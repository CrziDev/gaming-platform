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

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
}

type response struct {
	PendingDeposits         int            `json:"pending_deposits"`
	PendingHeldMinor        int64          `json:"pending_held_minor"`
	OldestPendingAt         *string        `json:"oldest_pending_at"`
	ApprovedTodayMinor      int64          `json:"approved_today_minor"`
	ApprovedTodayCount      int            `json:"approved_today_count"`
	StakedTodayMinor        int64          `json:"staked_today_minor"`
	ReturnedTodayMinor      int64          `json:"returned_today_minor"`
	HoldTodayMinor          int64          `json:"hold_today_minor"`
	RoundsToday             int            `json:"rounds_today"`
	PlayersToday            int            `json:"players_today"`
	EffectiveRTPBasisPoints int            `json:"effective_rtp_basis_points"`
	ExpectedRTPBasisPoints  int            `json:"expected_rtp_basis_points"`
	Games                   []gameActivity `json:"games"`
	Currency                string         `json:"currency"`
}

type gameActivity struct {
	GameID                  string `json:"game_id"`
	GameSlug                string `json:"game_slug"`
	GameName                string `json:"game_name"`
	Rounds                  int    `json:"rounds"`
	StakedMinor             int64  `json:"staked_minor"`
	ReturnedMinor           int64  `json:"returned_minor"`
	HoldMinor               int64  `json:"hold_minor"`
	EffectiveRTPBasisPoints int    `json:"effective_rtp_basis_points"`
	ExpectedRTPBasisPoints  int    `json:"expected_rtp_basis_points"`
}

func NewHandler(db *sql.DB, logger *slog.Logger) *Handler {
	return &Handler{db: db, logger: logger}
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request, _ user.User) {
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
	games := make([]gameActivity, 0, len(summary.Games))
	for _, item := range summary.Games {
		games = append(games, gameActivity{
			GameID:                  item.GameID,
			GameSlug:                item.Slug,
			GameName:                item.Name,
			Rounds:                  item.Rounds,
			StakedMinor:             item.StakedMinor,
			ReturnedMinor:           item.ReturnedMinor,
			HoldMinor:               item.HoldMinor,
			EffectiveRTPBasisPoints: item.EffectiveRTPBasisPts,
			ExpectedRTPBasisPoints:  item.ExpectedRTPBasisPts,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, response{
		PendingDeposits:         summary.PendingDeposits,
		PendingHeldMinor:        summary.PendingHeldMinor,
		OldestPendingAt:         oldestPendingAt,
		ApprovedTodayMinor:      summary.ApprovedTodayMinor,
		ApprovedTodayCount:      summary.ApprovedTodayCount,
		StakedTodayMinor:        summary.StakedTodayMinor,
		ReturnedTodayMinor:      summary.ReturnedTodayMinor,
		HoldTodayMinor:          summary.HoldTodayMinor,
		RoundsToday:             summary.RoundsToday,
		PlayersToday:            summary.PlayersToday,
		EffectiveRTPBasisPoints: summary.EffectiveRTPBasisPts,
		ExpectedRTPBasisPoints:  summary.ExpectedRTPBasisPts,
		Games:                   games,
		Currency:                summary.Currency,
	})
}
