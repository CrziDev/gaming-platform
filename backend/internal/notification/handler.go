package notification

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
}

type response struct {
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
	AmountMinor *int64  `json:"amount_minor"`
	Currency    *string `json:"currency"`
	Detail      *string `json:"detail"`
	ReferenceID string  `json:"reference_id"`
	Read        bool    `json:"read"`
	CreatedAt   string  `json:"created_at"`
}

func NewHandler(db *sql.DB, logger *slog.Logger) *Handler {
	return &Handler{db: db, logger: logger}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request, account user.User) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	items, total, err := List(r.Context(), h.db, account.ID, query.Page, query.Size)
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

func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request, account user.User) {
	if err := MarkAllRead(r.Context(), h.db, account.ID); err != nil {
		h.internal(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func newResponse(item Notification) response {
	return response{
		ID:          item.ID,
		Kind:        item.Kind,
		AmountMinor: item.AmountMinor,
		Currency:    nullable(item.Currency),
		Detail:      nullable(item.Detail),
		ReferenceID: item.ReferenceID,
		Read:        item.ReadAt != nil,
		CreatedAt:   item.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("notification request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
