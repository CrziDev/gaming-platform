package wallet

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
	CreatedAt     string `json:"created_at"`
}

type adminTransactionResponse struct {
	transactionResponse
	WalletID string `json:"wallet_id"`
	UserID   string `json:"user_id"`
	Reason   string `json:"reason,omitempty"`
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
	pathCurrency := strings.ToUpper(strings.TrimSpace(r.PathValue("currency")))
	if pathCurrency != "" {
		if len(pathCurrency) != 3 {
			httpx.WriteError(w, http.StatusNotFound, "Wallet not found")
			return
		}
		query.Currency = pathCurrency
	}
	if query.Currency != "" {
		if _, err := Get(r.Context(), h.db, account.ID, query.Currency); errors.Is(err, ErrCurrencyDisabled) {
			httpx.WriteError(w, http.StatusNotFound, "Wallet not found")
			return
		} else if err != nil {
			h.internal(w, r, err)
			return
		}
	}
	items, total, err := ListTransactions(r.Context(), h.db, account.ID, query.Currency, query.Page, query.Size)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]transactionResponse, 0, len(items))
	for _, item := range items {
		result = append(result, transactionResponse{ID: item.ID, Kind: item.Kind, AmountMinor: item.AmountMinor, Currency: item.Currency, BalanceBefore: item.BalanceBefore, BalanceAfter: item.BalanceAfter, CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339)})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) AdminAdjust(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if actor.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Wallet not found")
		return
	}

	var body struct {
		Direction   string `json:"direction"`
		Currency    string `json:"currency"`
		AmountMinor int64  `json:"amount_minor"`
		Reason      string `json:"reason"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	body.Currency = strings.ToUpper(strings.TrimSpace(body.Currency))
	body.Direction = strings.ToLower(strings.TrimSpace(body.Direction))
	body.Reason = strings.TrimSpace(body.Reason)
	fields := map[string]string{}
	if body.Direction != "credit" && body.Direction != "debit" {
		fields["direction"] = "Direction must be credit or debit"
	}
	if len(body.Currency) != 3 {
		fields["currency"] = "Currency must be a three-letter code"
	}
	if body.AmountMinor <= 0 {
		fields["amount_minor"] = "Amount must be greater than zero"
	}
	if body.Reason == "" {
		fields["reason"] = "A reason is required"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	transaction, err := Adjust(r.Context(), h.db, actor.ID, r.PathValue("id"), body.Currency, body.Direction, body.AmountMinor, body.Reason)
	if errors.Is(err, ErrNotFound) || errors.Is(err, ErrCurrencyDisabled) {
		httpx.WriteError(w, http.StatusNotFound, "Wallet not found")
		return
	}
	if errors.Is(err, ErrWalletFrozen) {
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet is frozen", "WALLET_FROZEN")
		return
	}
	if errors.Is(err, ErrWalletClosed) {
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet is closed", "WALLET_CLOSED")
		return
	}
	if errors.Is(err, ErrInsufficientFunds) {
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet balance is too low", "INSUFFICIENT_BALANCE")
		return
	}
	if errors.Is(err, ErrAmountOverflow) {
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet balance would overflow", "AMOUNT_OVERFLOW")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, adminTransactionResponse{
		transactionResponse: transactionResponse{ID: transaction.ID, Kind: transaction.Kind, AmountMinor: transaction.AmountMinor,
			Currency: transaction.Currency, BalanceBefore: transaction.BalanceBefore,
			BalanceAfter: transaction.BalanceAfter, CreatedAt: transaction.CreatedAt.UTC().Format(time.RFC3339)},
		WalletID: transaction.WalletID, UserID: transaction.UserID, Reason: transaction.Reason,
	})
}

func (h *Handler) AdminTransactions(w http.ResponseWriter, r *http.Request) {
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
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"user_id": "User ID must be a valid UUID"})
		return
	}
	validKinds := map[string]bool{"deposit": true, "withdrawal": true, "wager": true, "win": true, "refund": true, "adjustment": true}
	if query.Type != "" && !validKinds[query.Type] {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"type": "Transaction type is invalid"})
		return
	}
	items, total, err := ListAdminTransactions(r.Context(), h.db, AdminTransactionFilter{Page: query.Page, Size: query.Size, UserID: query.UserID, Currency: query.Currency, Kind: query.Type, From: query.From, To: query.To})
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]adminTransactionResponse, 0, len(items))
	for _, item := range items {
		result = append(result, adminTransactionResponse{
			transactionResponse: transactionResponse{ID: item.ID, Kind: item.Kind, AmountMinor: item.AmountMinor, Currency: item.Currency, BalanceBefore: item.BalanceBefore, BalanceAfter: item.BalanceAfter, CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339)},
			WalletID:            item.WalletID, UserID: item.UserID, Reason: item.Reason,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("wallet request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
