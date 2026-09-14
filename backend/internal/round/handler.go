package round

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

var readStatuses = map[string]bool{
	StatusOpen: true, StatusSettled: true, StatusCancelled: true, StatusFailed: true,
}

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
}

type response struct {
	ID                   string  `json:"id"`
	GameID               string  `json:"game_id"`
	GameSlug             string  `json:"game_slug"`
	GameName             string  `json:"game_name"`
	RTPProfileID         string  `json:"rtp_profile_id"`
	Status               string  `json:"status"`
	StakeMinor           int64   `json:"stake_minor"`
	WinMinor             *int64  `json:"win_minor"`
	MultiplierHundredths *int    `json:"multiplier_hundredths"`
	Currency             string  `json:"currency"`
	StartedAt            string  `json:"started_at"`
	SettledAt            *string `json:"settled_at"`
}

type adminResponse struct {
	response
	UserID      string `json:"user_id"`
	UserEmail   string `json:"user_email"`
	DisplayName string `json:"display_name"`
	WalletID    string `json:"wallet_id"`
}

func NewHandler(db *sql.DB, logger *slog.Logger) *Handler {
	return &Handler{db: db, logger: logger}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request, account user.User) {
	filter, ok := readFilter(w, r, false)
	if !ok {
		return
	}
	filter.UserID = account.ID
	items, total, err := List(r.Context(), h.db, filter)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]response, 0, len(items))
	for _, item := range items {
		result = append(result, newResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, filter.Page, filter.Size))
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request, account user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Round not found")
		return
	}
	item, err := GetForPlayer(r.Context(), h.db, account.ID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Round not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponse(item))
}

func (h *Handler) AdminList(w http.ResponseWriter, r *http.Request, _ user.User) {
	filter, ok := readFilter(w, r, true)
	if !ok {
		return
	}
	items, total, err := List(r.Context(), h.db, filter)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]adminResponse, 0, len(items))
	for _, item := range items {
		result = append(result, adminResponse{
			response: newResponse(item), UserID: item.UserID, UserEmail: item.UserEmail,
			DisplayName: item.UserDisplayName, WalletID: item.WalletID,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, filter.Page, filter.Size))
}

func readFilter(w http.ResponseWriter, r *http.Request, admin bool) (ReadFilter, bool) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return ReadFilter{}, false
	}
	fields := map[string]string{}
	if query.Status == "all" {
		query.Status = ""
	}
	if query.Status != "" && !readStatuses[query.Status] {
		fields["status"] = "Status must be open, settled, cancelled, or failed"
	}
	if query.Currency != "" && len(query.Currency) != 3 {
		fields["currency"] = "Currency must be a three-letter code"
	}
	if query.GameID != "" && !httpx.IsUUID(query.GameID) {
		fields["game_id"] = "Game ID must be a valid UUID"
	}
	if admin && query.UserID != "" && !httpx.IsUUID(query.UserID) {
		fields["user_id"] = "User ID must be a valid UUID"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", fields)
		return ReadFilter{}, false
	}
	return ReadFilter{
		Page: query.Page, Size: query.Size, UserID: query.UserID, GameID: query.GameID,
		Status: query.Status, Currency: query.Currency, From: query.From, To: query.To,
	}, true
}

func newResponse(item Record) response {
	var settledAt *string
	if item.SettledAt != nil {
		formatted := item.SettledAt.UTC().Format(time.RFC3339)
		settledAt = &formatted
	}
	return response{
		ID: item.ID, GameID: item.GameID, GameSlug: item.GameSlug, GameName: item.GameName,
		RTPProfileID: item.RTPProfileID, Status: item.Status, StakeMinor: item.StakeMinor,
		WinMinor: item.WinMinor, MultiplierHundredths: item.MultiplierHundredths,
		Currency: item.Currency, StartedAt: item.StartedAt.UTC().Format(time.RFC3339), SettledAt: settledAt,
	}
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("round read failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
