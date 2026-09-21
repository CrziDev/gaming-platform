package announcement

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

const maxTextLength = 280

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
	now    func() time.Time
}

type response struct {
	ID        string  `json:"id"`
	Text      string  `json:"text"`
	EndsAt    *string `json:"ends_at"`
	CreatedAt string  `json:"created_at"`
}

type adminResponse struct {
	response
	Enabled   bool   `json:"enabled"`
	UpdatedAt string `json:"updated_at"`
}

type contentBody struct {
	Text   string  `json:"text"`
	EndsAt *string `json:"ends_at"`
}

type statusBody struct {
	Enabled *bool `json:"enabled"`
}

func NewHandler(db *sql.DB, logger *slog.Logger) *Handler {
	return &Handler{db: db, logger: logger, now: time.Now}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	items, total, err := ListActive(r.Context(), h.db, query.Page, query.Size, h.now().UTC())
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]response, 0, len(items))
	for _, item := range items {
		result = append(result, newResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) AdminList(w http.ResponseWriter, r *http.Request, _ user.User) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	items, total, err := ListAdmin(r.Context(), h.db, query.Page, query.Size)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]adminResponse, 0, len(items))
	for _, item := range items {
		result = append(result, newAdminResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request, actor user.User) {
	var body contentBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	text, endsAt, fields := validateContent(body, h.now())
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}
	created, err := Create(r.Context(), h.db, actor.ID, text, endsAt)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, newAdminResponse(created))
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request, actor user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Announcement not found")
		return
	}
	var body contentBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	text, endsAt, fields := validateContent(body, h.now())
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}
	updated, err := Update(r.Context(), h.db, actor.ID, r.PathValue("id"), text, endsAt)
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Announcement not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminResponse(updated))
}

func (h *Handler) SetStatus(w http.ResponseWriter, r *http.Request, actor user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Announcement not found")
		return
	}
	var body statusBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	if body.Enabled == nil {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"enabled": "Choose whether the announcement is enabled"})
		return
	}
	updated, err := SetEnabled(r.Context(), h.db, actor.ID, r.PathValue("id"), *body.Enabled, h.now())
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Announcement not found")
		return
	}
	if errors.Is(err, ErrEnded) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"ends_at": "Choose a future end date before enabling this announcement"})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminResponse(updated))
}

func validateContent(body contentBody, now time.Time) (string, *time.Time, map[string]string) {
	text := strings.TrimSpace(body.Text)
	fields := map[string]string{}
	if text == "" || utf8.RuneCountInString(text) > maxTextLength {
		fields["text"] = "Text must be between 1 and 280 characters"
	} else if strings.ContainsAny(text, "\r\n") {
		fields["text"] = "Text must be a single line"
	}

	var endsAt *time.Time
	if body.EndsAt != nil {
		parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.EndsAt))
		if err != nil {
			fields["ends_at"] = "Use an RFC 3339 timestamp"
		} else if !parsed.After(now) {
			fields["ends_at"] = "End date must be in the future"
		} else {
			parsed = parsed.UTC()
			endsAt = &parsed
		}
	}
	return text, endsAt, fields
}

func newResponse(item Announcement) response {
	return response{ID: item.ID, Text: item.Text, EndsAt: formatOptionalTime(item.EndsAt), CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339Nano)}
}

func newAdminResponse(item Announcement) adminResponse {
	return adminResponse{response: newResponse(item), Enabled: item.Enabled, UpdatedAt: item.UpdatedAt.UTC().Format(time.RFC3339Nano)}
}

func formatOptionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339Nano)
	return &formatted
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("announcement request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
