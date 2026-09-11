package dashboard

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
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
	PendingDeposits         int     `json:"pending_deposits"`
	PendingHeldMinor        int64   `json:"pending_held_minor"`
	OldestPendingAt         *string `json:"oldest_pending_at"`
	ApprovedTodayMinor      int64   `json:"approved_today_minor"`
	ApprovedTodayCount      int     `json:"approved_today_count"`
	StakedTodayMinor        int64   `json:"staked_today_minor"`
	RoundsToday             int     `json:"rounds_today"`
	PlayersToday            int     `json:"players_today"`
	ReturnedTodayMinor      int64   `json:"returned_today_minor"`
	EffectiveRTPBasisPoints int     `json:"effective_rtp_basis_points"`
	TargetRTPBasisPoints    int     `json:"target_rtp_basis_points"`
	Currency                string  `json:"currency"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, currentUser CurrentUser) *Handler {
	return &Handler{db: db, logger: logger, currentUser: currentUser}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if account.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return
	}
	currency := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("currency")))
	if currency == "" {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"currency": "Currency is required"})
		return
	}
	if len(currency) != 3 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"currency": "Currency must be a three-letter code"})
		return
	}
	summary, err := Get(r.Context(), h.db, currency)
	if errors.Is(err, ErrCurrencyUnavailable) {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"currency": "The selected currency is unavailable"})
		return
	}
	if err != nil {
		h.logger.Error("dashboard request failed", slog.Any("error", err))
		httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
		return
	}
	var oldestPendingAt *string
	if summary.OldestPendingAt != nil {
		formatted := summary.OldestPendingAt.UTC().Format(time.RFC3339)
		oldestPendingAt = &formatted
	}
	httpx.WriteJSON(w, http.StatusOK, response{
		PendingDeposits:         summary.PendingDeposits,
		PendingHeldMinor:        summary.PendingHeldMinor,
		OldestPendingAt:         oldestPendingAt,
		ApprovedTodayMinor:      summary.ApprovedTodayMinor,
		ApprovedTodayCount:      summary.ApprovedTodayCount,
		StakedTodayMinor:        summary.StakedTodayMinor,
		RoundsToday:             summary.RoundsToday,
		PlayersToday:            summary.PlayersToday,
		ReturnedTodayMinor:      summary.ReturnedTodayMinor,
		EffectiveRTPBasisPoints: summary.EffectiveRTPBasisPts,
		TargetRTPBasisPoints:    summary.TargetRTPBasisPoints,
		Currency:                summary.Currency,
	})
}
