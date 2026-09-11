package currency

import (
	"database/sql"
	"log/slog"
	"net/http"

	"github.com/gaming-platform/backend/internal/httpx"
)

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
}

type response struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	Symbol          string `json:"symbol"`
	MinorUnits      int    `json:"minor_units"`
	DepositMinMinor int64  `json:"deposit_min_minor"`
	DepositMaxMinor int64  `json:"deposit_max_minor"`
}

func NewHandler(db *sql.DB, logger *slog.Logger) *Handler {
	return &Handler{db: db, logger: logger}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	currencies, err := ListEnabled(r.Context(), h.db)
	if err != nil {
		h.logger.Error("request failed",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Any("error", err))
		httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
		return
	}

	result := make([]response, 0, len(currencies))
	for _, currency := range currencies {
		result = append(result, response{
			Code:            currency.Code,
			Name:            currency.Name,
			Symbol:          currency.Symbol,
			MinorUnits:      currency.MinorUnits,
			DepositMinMinor: currency.DepositMinMinor,
			DepositMaxMinor: currency.DepositMaxMinor,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}
