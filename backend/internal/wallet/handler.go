package wallet

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

type CurrentUser func(http.ResponseWriter, *http.Request) (user.User, bool)
type Handler struct {
	db          *sql.DB
	logger      *slog.Logger
	currentUser CurrentUser
}

type walletResponse struct {
	ID           string `json:"id"`
	Currency     string `json:"currency"`
	BalanceMinor int64  `json:"balance_minor"`
	Status       string `json:"status"`
}
type transactionResponse struct {
	ID            string `json:"id"`
	Kind          string `json:"kind"`
	AmountMinor   int64  `json:"amount_minor"`
	Currency      string `json:"currency"`
	BalanceBefore int64  `json:"balance_before"`
	BalanceAfter  int64  `json:"balance_after"`
	Reason        string `json:"reason,omitempty"`
	CreatedAt     string `json:"created_at"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, currentUser CurrentUser) *Handler {
	return &Handler{db: db, logger: logger, currentUser: currentUser}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	wallets, err := List(r.Context(), h.db, account.ID)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]walletResponse, 0, len(wallets))
	for _, item := range wallets {
		result = append(result, walletResponse{item.ID, item.Currency, item.BalanceMinor, item.Status})
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	code := strings.ToUpper(strings.TrimSpace(r.PathValue("currency")))
	if len(code) != 3 {
		httpx.WriteError(w, http.StatusBadRequest, "Currency must be a three-letter code")
		return
	}
	item, err := Get(r.Context(), h.db, account.ID, code)
	if errors.Is(err, ErrCurrencyDisabled) {
		httpx.WriteError(w, http.StatusNotFound, "Wallet not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, walletResponse{item.ID, item.Currency, item.BalanceMinor, item.Status})
}

func (h *Handler) Transactions(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	if query.Currency == "" {
		query.Currency = strings.ToUpper(strings.TrimSpace(r.PathValue("currency")))
	}
	items, total, err := ListTransactions(r.Context(), h.db, account.ID, query.Currency, query.Page, query.Size)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]transactionResponse, 0, len(items))
	for _, item := range items {
		result = append(result, transactionResponse{ID: item.ID, Kind: item.Kind, AmountMinor: item.AmountMinor, Currency: item.Currency, BalanceBefore: item.BalanceBefore, BalanceAfter: item.BalanceAfter, Reason: item.Reason, CreatedAt: item.CreatedAt.UTC().Format("2006-01-02T15:04:05Z07:00")})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("wallet request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
