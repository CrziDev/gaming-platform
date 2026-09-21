package chat

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/coder/websocket"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/ratelimit"
	"github.com/gaming-platform/backend/internal/user"
)

const (
	pingInterval = 30 * time.Second
	writeTimeout = 5 * time.Second
)

type Config struct {
	MessagesPerMinute int
	AllowedOrigins    []string
}

type Handler struct {
	db          *sql.DB
	logger      *slog.Logger
	hub         *Hub
	limiter     *ratelimit.Limiter
	originHosts []string
}

type messageResponse struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	Text        string `json:"text"`
	CreatedAt   string `json:"created_at"`
}

type roomResponse struct {
	Online   int               `json:"online"`
	Messages []messageResponse `json:"messages"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, hub *Hub, cfg Config) *Handler {
	hosts := make([]string, 0, len(cfg.AllowedOrigins))
	for _, origin := range cfg.AllowedOrigins {
		if parsed, err := url.Parse(strings.TrimSpace(origin)); err == nil && parsed.Host != "" {
			hosts = append(hosts, parsed.Host)
		}
	}
	return &Handler{
		db:          db,
		logger:      logger,
		hub:         hub,
		limiter:     ratelimit.New(cfg.MessagesPerMinute, time.Minute),
		originHosts: hosts,
	}
}

func (h *Handler) Messages(w http.ResponseWriter, r *http.Request) {
	items, err := ListRecent(r.Context(), h.db)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]messageResponse, 0, len(items))
	for _, item := range items {
		result = append(result, newResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, roomResponse{Online: h.hub.Online(), Messages: result})
}

func (h *Handler) Post(w http.ResponseWriter, r *http.Request, account user.User) {
	if !h.limiter.Allow(account.ID, time.Now()) {
		w.Header().Set("Retry-After", "60")
		httpx.WriteError(w, http.StatusTooManyRequests, "You are sending messages too quickly. Try again shortly.")
		return
	}
	var body struct {
		Text string `json:"text"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" || utf8.RuneCountInString(text) > MaxMessageLength || strings.ContainsFunc(text, unicode.IsControl) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"text": "Message must be one line of 1 to 280 characters"})
		return
	}
	item, err := Create(r.Context(), h.db, account.ID, text)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	h.hub.Broadcast(messageEvent)
	httpx.WriteJSON(w, http.StatusCreated, newResponse(item))
}

// Socket upgrades the request and pushes hub events until the peer or the hub
// closes. The hijack clears the server's request deadlines, so the socket is
// not cut off by ReadTimeout or WriteTimeout.
func (h *Handler) Socket(w http.ResponseWriter, r *http.Request) {
	events, unsubscribe := h.hub.Subscribe()
	defer unsubscribe()

	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: h.originHosts})
	if err != nil {
		h.logger.Debug("chat socket refused", slog.String("origin", r.Header.Get("Origin")), slog.Any("error", err))
		return
	}
	defer conn.CloseNow()

	// The request context is not cancelled when a hijacked peer disconnects, so
	// the read loop's own context is the signal that the socket has gone.
	ctx := conn.CloseRead(context.Background())
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-h.hub.Done():
			_ = conn.Close(websocket.StatusGoingAway, "server shutting down")
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := withTimeout(ctx, func(ctx context.Context) error {
				return conn.Write(ctx, websocket.MessageText, event)
			}); err != nil {
				return
			}
		case <-ticker.C:
			if err := withTimeout(ctx, conn.Ping); err != nil {
				return
			}
		}
	}
}

func withTimeout(parent context.Context, operation func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(parent, writeTimeout)
	defer cancel()
	return operation(ctx)
}

func newResponse(item Message) messageResponse {
	return messageResponse{
		ID:          item.ID,
		DisplayName: item.DisplayName,
		Role:        item.Role,
		Text:        item.Text,
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("chat request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
