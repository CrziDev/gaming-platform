package deposit

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
	"github.com/gaming-platform/backend/internal/wallet"
)

type Handler struct {
	db       *sql.DB
	logger   *slog.Logger
	proofDir string
}

type methodResponse struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	Description       string `json:"description"`
	PayTo             string `json:"pay_to"`
	ReferenceRequired bool   `json:"reference_required"`
}

type requestResponse struct {
	ID          string  `json:"id"`
	Reference   string  `json:"reference"`
	MethodID    string  `json:"method_id"`
	MethodName  string  `json:"method_name"`
	AmountMinor int64   `json:"amount_minor"`
	Currency    string  `json:"currency"`
	Status      string  `json:"status"`
	CreatedAt   string  `json:"created_at"`
	ReviewedAt  *string `json:"reviewed_at"`
	Reason      *string `json:"reason"`
}

type adminRequestResponse struct {
	requestResponse
	UserID      string `json:"user_id"`
	UserEmail   string `json:"user_email"`
	DisplayName string `json:"display_name"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, proofDir string) *Handler {
	return &Handler{db: db, logger: logger, proofDir: proofDir}
}

func (h *Handler) Methods(w http.ResponseWriter, r *http.Request, _ user.User) {
	items, err := ListMethods(r.Context(), h.db)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]methodResponse, 0, len(items))
	for _, item := range items {
		result = append(result, methodResponse{
			ID: item.ID, Name: item.Name, Description: item.Description,
			PayTo: item.PayTo, ReferenceRequired: item.ReferenceRequired,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request, account user.User) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	if query.Status != "" && query.Status != "pending" && query.Status != "approved" && query.Status != "rejected" {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"status": "Status must be pending, approved, or rejected"})
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
		httpx.WriteError(w, http.StatusNotFound, "Deposit request not found")
		return
	}
	item, err := Get(r.Context(), h.db, account.ID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Deposit request not found")
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
	if existing, err := GetByIdempotencyKey(r.Context(), h.db, account.ID, idempotencyKey); err == nil {
		httpx.WriteJSON(w, http.StatusOK, newRequestResponse(existing))
		return
	} else if !errors.Is(err, ErrNotFound) {
		h.internal(w, r, err)
		return
	}
	if err := r.ParseMultipartForm(6 << 20); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			httpx.WriteError(w, http.StatusRequestEntityTooLarge, "The request body is too large")
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, "The deposit form could not be read")
		return
	}
	body := struct {
		MethodID, Reference, Currency string
		AmountMinor                   int64
	}{
		MethodID:  strings.TrimSpace(r.FormValue("method_id")),
		Reference: strings.TrimSpace(r.FormValue("reference")),
		Currency:  strings.ToUpper(strings.TrimSpace(r.FormValue("currency"))),
	}
	if amount, err := strconv.ParseInt(strings.TrimSpace(r.FormValue("amount_minor")), 10, 64); err == nil {
		body.AmountMinor = amount
	}
	fields := map[string]string{}
	if body.MethodID == "" {
		fields["method_id"] = "Payment method is required"
	} else if !httpx.IsUUID(body.MethodID) {
		fields["method_id"] = "Payment method must be a valid UUID"
	}
	if body.Currency == "" {
		fields["currency"] = "Currency is required"
	}
	if body.AmountMinor <= 0 {
		fields["amount_minor"] = "Amount must be greater than zero"
	}
	if utf8.RuneCountInString(body.Reference) > 120 {
		fields["reference"] = "Reference is too long"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}
	file, header, err := r.FormFile("proof")
	if err != nil {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"proof": "A payment proof image is required"})
		return
	}
	defer file.Close()
	if header.Size > 5<<20 {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "The proof image must not exceed 5 MB")
		return
	}
	content := make([]byte, 512)
	read, readErr := io.ReadFull(file, content)
	if readErr != nil && readErr != io.ErrUnexpectedEOF {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"proof": "The proof image could not be read"})
		return
	}
	mime := http.DetectContentType(content[:read])
	extension := map[string]string{"image/png": ".png", "image/jpeg": ".jpg"}[mime]
	if extension == "" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"proof": "Only PNG or JPEG images are accepted"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := os.MkdirAll(h.proofDir, 0o700); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := os.Chmod(h.proofDir, 0o700); err != nil {
		h.internal(w, r, err)
		return
	}
	nameBytes := make([]byte, 16)
	if _, err := rand.Read(nameBytes); err != nil {
		h.internal(w, r, err)
		return
	}
	filename := fmt.Sprintf("%x%s", nameBytes, extension)
	path := filepath.Join(h.proofDir, filename)
	destination, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	copied, copyErr := io.Copy(destination, io.LimitReader(file, 5<<20+1))
	closeErr := destination.Close()
	if copied > 5<<20 {
		_ = os.Remove(path)
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "The proof image must not exceed 5 MB")
		return
	}
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(path)
		h.internal(w, r, fmt.Errorf("store proof: %v %v", copyErr, closeErr))
		return
	}
	if _, err := wallet.Get(r.Context(), h.db, account.ID, body.Currency); err != nil && !errors.Is(err, wallet.ErrCurrencyDisabled) {
		_ = os.Remove(path)
		h.internal(w, r, err)
		return
	}
	item, created, err := Create(r.Context(), h.db, account.ID, body.MethodID, body.Currency, body.AmountMinor, body.Reference, filename, idempotencyKey)
	if err != nil || !created {
		_ = os.Remove(path)
	}
	if errors.Is(err, ErrInvalidMethod) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"method_id": "The selected payment method is unavailable"})
		return
	}
	if errors.Is(err, ErrInvalidCurrency) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"currency": "The selected currency is unavailable"})
		return
	}
	if errors.Is(err, ErrAmountOutOfRange) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"amount_minor": "Amount is outside the allowed deposit range"})
		return
	}
	if errors.Is(err, ErrReferenceRequired) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"reference": "A payment reference is required"})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	status := http.StatusCreated
	if !created {
		status = http.StatusOK
	}
	httpx.WriteJSON(w, status, newRequestResponse(item))
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
	if status == "" {
		status = "pending"
	}
	if status != "all" && status != "pending" && status != "approved" && status != "rejected" {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{"status": "Status must be all, pending, approved, or rejected"})
		return
	}
	if status == "all" {
		status = ""
	}
	items, total, err := ListAdmin(r.Context(), h.db, AdminListFilter{
		Page: query.Page, Size: query.Size, UserID: query.UserID, Status: status,
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
		httpx.WriteError(w, http.StatusNotFound, "Deposit request not found")
		return
	}
	var body struct {
		Action      string `json:"action"`
		AmountMinor int64  `json:"amount_minor"`
		Reason      string `json:"reason"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	body.Action = strings.ToLower(strings.TrimSpace(body.Action))
	body.Reason = strings.TrimSpace(body.Reason)
	if body.Action != "approve" && body.Action != "reject" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"action": "Action must be approve or reject"})
		return
	}
	if body.Action == "approve" && body.AmountMinor < 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"amount_minor": "Amount must be greater than zero"})
		return
	}
	if body.Action == "reject" && body.Reason == "" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"reason": "A rejection reason is required"})
		return
	}
	item, err := Review(r.Context(), h.db, actor.ID, r.PathValue("id"), body.Action, body.AmountMinor, body.Reason)
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Deposit request not found")
		return
	}
	if errors.Is(err, ErrAlreadyReviewed) {
		httpx.WriteCodedError(w, http.StatusConflict, "This deposit request has already been reviewed", "DEPOSIT_ALREADY_REVIEWED")
		return
	}
	if errors.Is(err, ErrApprovalReasonRequired) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"reason": "An edited approval amount requires a reason"})
		return
	}
	if errors.Is(err, ErrAmountOutOfRange) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"amount_minor": "Amount is outside the allowed deposit range"})
		return
	}
	if errors.Is(err, ErrWalletUnavailable) {
		httpx.WriteCodedError(w, http.StatusConflict, "The deposit could not be approved", "DEPOSIT_APPROVAL_FAILED")
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
	httpx.WriteJSON(w, http.StatusOK, newRequestResponse(item))
}

func (h *Handler) AdminProof(w http.ResponseWriter, r *http.Request, _ user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Proof not found")
		return
	}
	stored, err := ProofPath(r.Context(), h.db, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Proof not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	filename := filepath.Base(stored)
	path := filepath.Join(h.proofDir, filename)
	file, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		httpx.WriteError(w, http.StatusNotFound, "Proof not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		h.internal(w, r, err)
		return
	}
	w.Header().Set("Content-Disposition", "inline; filename=proof-"+r.PathValue("id"))
	if contentType := mime.TypeByExtension(filepath.Ext(filename)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	http.ServeContent(w, r, filename, info.ModTime(), file)
}

func newRequestResponse(item Request) requestResponse {
	var reviewedAt *string
	var reason *string
	if item.ReviewedAt != nil {
		value := item.ReviewedAt.UTC().Format(time.RFC3339)
		reviewedAt = &value
	}
	if item.Reason != "" {
		reason = &item.Reason
	}
	return requestResponse{ID: item.ID, Reference: item.Reference, MethodID: item.MethodID, MethodName: item.MethodName, AmountMinor: item.AmountMinor, Currency: item.Currency, Status: item.Status, CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339), ReviewedAt: reviewedAt, Reason: reason}
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("deposit request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
