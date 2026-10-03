package withdrawal

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/mail"
	"github.com/gaming-platform/backend/internal/user"
	"github.com/gaming-platform/backend/internal/wallet"
)

type Config struct {
	Mailer       mail.Sender
	PublicWebURL string
}

type Handler struct {
	db     *sql.DB
	logger *slog.Logger
	cfg    Config
}

type requestResponse struct {
	ID              string  `json:"id"`
	MethodID        string  `json:"method_id"`
	MethodName      string  `json:"method_name"`
	AmountMinor     int64   `json:"amount_minor"`
	Currency        string  `json:"currency"`
	AccountName     string  `json:"account_name"`
	AccountNumber   string  `json:"account_number"`
	Status          string  `json:"status"`
	PayoutReference *string `json:"payout_reference"`
	Reason          *string `json:"reason"`
	CreatedAt       string  `json:"created_at"`
	ReviewedAt      *string `json:"reviewed_at"`
	CancelledAt     *string `json:"cancelled_at"`
}

type adminRequestResponse struct {
	requestResponse
	UserID      string `json:"user_id"`
	UserEmail   string `json:"user_email"`
	DisplayName string `json:"display_name"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, cfg Config) *Handler {
	return &Handler{db: db, logger: logger, cfg: cfg}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request, account user.User) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	switch query.Status {
	case "", "pending", "approved", "rejected", "cancelled":
	default:
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"status": "Status must be pending, approved, rejected, or cancelled"})
		return
	}
	items, total, err := List(r.Context(), h.db, account.ID, query.Status, query.Page, query.Size)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]requestResponse, 0, len(items))
	for _, item := range items {
		result = append(result, newRequestResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request, account user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
		return
	}
	item, err := Get(r.Context(), h.db, account.ID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newRequestResponse(item))
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request, account user.User) {
	idempotencyKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if idempotencyKey == "" || utf8.RuneCountInString(idempotencyKey) > 200 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"idempotency_key": "A valid Idempotency-Key header is required"})
		return
	}
	var body struct {
		MethodID      string `json:"method_id"`
		Currency      string `json:"currency"`
		AmountMinor   int64  `json:"amount_minor"`
		AccountName   string `json:"account_name"`
		AccountNumber string `json:"account_number"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	in := NewRequest{
		UserID:         account.ID,
		MethodID:       strings.TrimSpace(body.MethodID),
		Currency:       strings.ToUpper(strings.TrimSpace(body.Currency)),
		AmountMinor:    body.AmountMinor,
		AccountName:    strings.TrimSpace(body.AccountName),
		AccountNumber:  strings.TrimSpace(body.AccountNumber),
		IdempotencyKey: idempotencyKey,
	}
	fields := map[string]string{}
	if in.MethodID == "" {
		fields["method_id"] = "Payment method is required"
	} else if !httpx.IsUUID(in.MethodID) {
		fields["method_id"] = "Payment method must be a valid UUID"
	}
	if in.Currency == "" {
		fields["currency"] = "Currency is required"
	}
	if in.AmountMinor <= 0 {
		fields["amount_minor"] = "Amount must be greater than zero"
	}
	if !validSingleLine(in.AccountName, 120) {
		fields["account_name"] = "Account name must be between 1 and 120 characters"
	}
	if !validSingleLine(in.AccountNumber, 64) {
		fields["account_number"] = "Account number must be between 1 and 64 characters"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}
	if _, err := wallet.Get(r.Context(), h.db, account.ID, in.Currency); err != nil && !errors.Is(err, wallet.ErrCurrencyDisabled) {
		h.internal(w, r, err)
		return
	}

	item, created, err := Create(r.Context(), h.db, in)
	if message, code, ok := walletFailure(err); ok {
		httpx.WriteCodedError(w, http.StatusConflict, message, code)
		return
	}
	switch {
	case errors.Is(err, ErrInvalidMethod):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"method_id": "The selected payment method is unavailable"})
	case errors.Is(err, ErrInvalidCurrency):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"currency": "The selected currency is unavailable"})
	case errors.Is(err, ErrAmountOutOfRange):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"amount_minor": "Amount is outside the allowed withdrawal range"})
	case errors.Is(err, ErrIdempotencyKeyReused):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"idempotency_key": "This key was already used for a different withdrawal"})
	case errors.Is(err, ErrPendingExists):
		httpx.WriteCodedError(w, http.StatusConflict, "You already have a withdrawal waiting for review", "WITHDRAWAL_PENDING")
	case err != nil:
		h.internal(w, r, err)
	case created:
		httpx.WriteJSON(w, http.StatusCreated, newRequestResponse(item))
		h.alertAdmins(item, account)
	default:
		httpx.WriteJSON(w, http.StatusOK, newRequestResponse(item))
	}
}

func (h *Handler) Cancel(w http.ResponseWriter, r *http.Request, account user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
		return
	}
	item, err := Cancel(r.Context(), h.db, account.ID, r.PathValue("id"))
	if message, code, ok := walletFailure(err); ok {
		httpx.WriteCodedError(w, http.StatusConflict, message, code)
		return
	}
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
	case errors.Is(err, ErrAlreadyReviewed):
		httpx.WriteCodedError(w, http.StatusConflict, "This withdrawal request is no longer pending", "WITHDRAWAL_ALREADY_REVIEWED")
	case err != nil:
		h.internal(w, r, err)
	default:
		httpx.WriteJSON(w, http.StatusOK, newRequestResponse(item))
	}
}

func (h *Handler) AdminList(w http.ResponseWriter, r *http.Request, _ user.User) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	if query.UserID != "" && !httpx.IsUUID(query.UserID) {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"user_id": "User ID must be a valid UUID"})
		return
	}
	status := query.Status
	switch status {
	case "":
		status = "pending"
	case "all":
		status = ""
	case "pending", "approved", "rejected", "cancelled":
	default:
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"status": "Status must be all, pending, approved, rejected, or cancelled"})
		return
	}
	items, total, err := ListAdmin(r.Context(), h.db, AdminListFilter{
		Page: query.Page, Size: query.Size, UserID: query.UserID, Status: status, Search: query.Search,
	})
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]adminRequestResponse, 0, len(items))
	for _, item := range items {
		result = append(result, adminRequestResponse{requestResponse: newRequestResponse(item.Request), UserID: item.UserID, UserEmail: item.UserEmail, DisplayName: item.DisplayName})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) AdminReview(w http.ResponseWriter, r *http.Request, actor user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
		return
	}
	var body struct {
		Action          string `json:"action"`
		PayoutReference string `json:"payout_reference"`
		Reason          string `json:"reason"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	body.Action = strings.ToLower(strings.TrimSpace(body.Action))
	body.PayoutReference = strings.TrimSpace(body.PayoutReference)
	body.Reason = strings.TrimSpace(body.Reason)
	fields := map[string]string{}
	switch body.Action {
	case "approve":
		if !validSingleLine(body.PayoutReference, 120) {
			fields["payout_reference"] = "A payout reference of at most 120 characters is required"
		}
	case "reject":
		if body.Reason == "" || utf8.RuneCountInString(body.Reason) > 500 {
			fields["reason"] = "A rejection reason of at most 500 characters is required"
		}
	default:
		fields["action"] = "Action must be approve or reject"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	item, err := Review(r.Context(), h.db, actor.ID, r.PathValue("id"), body.Action, body.PayoutReference, body.Reason)
	if message, code, ok := walletFailure(err); ok {
		httpx.WriteCodedError(w, http.StatusConflict, message, code)
		return
	}
	switch {
	case errors.Is(err, ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "Withdrawal request not found")
	case errors.Is(err, ErrAlreadyReviewed):
		httpx.WriteCodedError(w, http.StatusConflict, "This withdrawal request is no longer pending", "WITHDRAWAL_ALREADY_REVIEWED")
	case err != nil:
		h.internal(w, r, err)
	default:
		httpx.WriteJSON(w, http.StatusOK, newRequestResponse(item))
	}
}

func walletFailure(err error) (message, code string, ok bool) {
	switch {
	case errors.Is(err, wallet.ErrInsufficientFunds):
		return "Your balance is too low for that withdrawal", "INSUFFICIENT_BALANCE", true
	case errors.Is(err, wallet.ErrWalletFrozen):
		return "This wallet is frozen", "WALLET_FROZEN", true
	case errors.Is(err, wallet.ErrWalletClosed):
		return "This wallet is closed", "WALLET_CLOSED", true
	case errors.Is(err, wallet.ErrAmountOverflow):
		return "The wallet balance would overflow", "AMOUNT_OVERFLOW", true
	}
	return "", "", false
}

func validSingleLine(value string, maxRunes int) bool {
	if value == "" || utf8.RuneCountInString(value) > maxRunes {
		return false
	}
	return strings.IndexFunc(value, unicode.IsControl) < 0
}

func newRequestResponse(item Request) requestResponse {
	return requestResponse{
		ID: item.ID, MethodID: item.MethodID, MethodName: item.MethodName, AmountMinor: item.AmountMinor, Currency: item.Currency,
		AccountName: item.AccountName, AccountNumber: item.AccountNumber, Status: item.Status,
		PayoutReference: optionalText(item.PayoutReference), Reason: optionalText(item.Reason),
		CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339), ReviewedAt: optionalTime(item.ReviewedAt), CancelledAt: optionalTime(item.CancelledAt),
	}
}

func optionalText(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func optionalTime(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339)
	return &formatted
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("withdrawal request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
