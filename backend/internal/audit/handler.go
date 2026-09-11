package audit

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

type CurrentUser func(http.ResponseWriter, *http.Request) (user.User, bool)

type Handler struct {
	db          *sql.DB
	logger      *slog.Logger
	currentUser CurrentUser
}

type response struct {
	ID               string          `json:"id"`
	ActorUserID      string          `json:"actor_user_id,omitempty"`
	ActorDisplayName string          `json:"actor_display_name"`
	Action           string          `json:"action"`
	EntityType       string          `json:"entity_type"`
	EntityID         string          `json:"entity_id"`
	Detail           string          `json:"detail"`
	BeforeData       json.RawMessage `json:"before_data"`
	AfterData        json.RawMessage `json:"after_data"`
	CreatedAt        string          `json:"created_at"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, currentUser CurrentUser) *Handler {
	return &Handler{db: db, logger: logger, currentUser: currentUser}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if account.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return
	}
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	if query.UserID != "" && !httpx.IsUUID(query.UserID) {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"user_id": "Actor user ID must be a valid UUID"})
		return
	}

	entries, total, err := List(r.Context(), h.db, ListFilter{
		Page: query.Page, Size: query.Size, ActorID: query.UserID,
		Action: query.Type, From: query.From, To: query.To,
	})
	if err != nil {
		h.logger.Error("audit request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
		httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
		return
	}

	result := make([]response, 0, len(entries))
	for _, entry := range entries {
		result = append(result, response{
			ID: entry.ID, ActorUserID: entry.ActorUserID, ActorDisplayName: entry.ActorDisplayName,
			Action: entry.Action, EntityType: entry.EntityType, EntityID: entry.EntityID,
			Detail: entry.Detail, BeforeData: entry.BeforeData, AfterData: entry.AfterData,
			CreatedAt: entry.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}
