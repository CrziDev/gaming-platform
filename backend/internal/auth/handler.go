package auth

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

const (
	maxEmailLength       = 254
	minPasswordLength    = 12
	maxPasswordLength    = 128
	maxDisplayNameLength = 80
)

const invalidCredentials = "Email or password is incorrect"

type Config struct {
	CookieName      string
	CookieSecure    bool
	SessionTTL      time.Duration
	LoginsPerMinute int
}

type Handler struct {
	db      *sql.DB
	logger  *slog.Logger
	cfg     Config
	limiter *rateLimiter
}

func NewHandler(db *sql.DB, logger *slog.Logger, cfg Config) *Handler {
	return &Handler{
		db:      db,
		logger:  logger,
		cfg:     cfg,
		limiter: newRateLimiter(cfg.LoginsPerMinute, time.Minute),
	}
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	h.throttle(h.register)(w, r)
}

func (h *Handler) register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}

	email := normalizeEmail(body.Email)
	displayName := strings.TrimSpace(body.DisplayName)

	if fields := validateRegistration(email, body.Password, displayName); len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	hash, err := HashPassword(body.Password)
	if err != nil {
		h.internal(w, r, err)
		return
	}

	token, expiresAt, err := h.prepareSession()
	if err != nil {
		h.internal(w, r, err)
		return
	}
	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	defer tx.Rollback()

	account, err := user.CreateTx(r.Context(), tx, email, hash, displayName)
	if errors.Is(err, user.ErrEmailTaken) {
		httpx.WriteJSON(w, http.StatusConflict, httpx.ErrorResponse{
			Error:  "That email address is already registered",
			Fields: map[string]string{"email": "This email address is already registered"},
		})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if err := insertSession(r.Context(), tx, account.ID, token, expiresAt); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		h.internal(w, r, err)
		return
	}
	h.setSessionCookie(w, token, expiresAt)
	httpx.WriteJSON(w, http.StatusCreated, newUserResponse(account))
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	h.throttle(h.login)(w, r)
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}

	email := normalizeEmail(body.Email)
	if email == "" || body.Password == "" {
		httpx.WriteError(w, http.StatusBadRequest, "Enter an email address and a password")
		return
	}

	account, err := user.FindByEmail(r.Context(), h.db, email)
	if errors.Is(err, user.ErrNoUser) {
		spendVerificationTime(body.Password)
		httpx.WriteError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}

	matches, err := VerifyPassword(account.PasswordHash, body.Password)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if !matches {
		httpx.WriteError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}

	if account.Status != "active" {
		httpx.WriteError(w, http.StatusForbidden, "This account is not active")
		return
	}

	if !h.startSession(w, r, account) {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newUserResponse(account))
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(h.cfg.CookieName); err == nil && cookie.Value != "" {
		if err := revokeSession(r.Context(), h.db, cookie.Value); err != nil {
			h.internal(w, r, err)
			return
		}
	}

	h.clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	account, ok := h.CurrentUser(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newUserResponse(account))
}

func (h *Handler) CurrentUser(w http.ResponseWriter, r *http.Request) (user.User, bool) {
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return user.User{}, false
	}

	account, err := findUserBySessionToken(r.Context(), h.db, cookie.Value)
	if errors.Is(err, ErrNoSession) {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return user.User{}, false
	}
	if err != nil {
		h.internal(w, r, err)
		return user.User{}, false
	}
	return account, true
}

func (h *Handler) AdminUsers(w http.ResponseWriter, r *http.Request) {
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
	if query.Status != "" && query.Status != "active" && query.Status != "suspended" && query.Status != "closed" {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", map[string]string{
			"status": "Status must be active, suspended, or closed",
		})
		return
	}

	accounts, total, err := user.List(r.Context(), h.db, user.ListFilter{
		Page: query.Page, Size: query.Size, Search: query.Search, Status: query.Status,
	})
	if err != nil {
		h.internal(w, r, err)
		return
	}

	response := make([]adminUserResponse, 0, len(accounts))
	for _, listedAccount := range accounts {
		response = append(response, newAdminUserResponse(listedAccount))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(response, total, query.Page, query.Size))
}

func (h *Handler) AdminUser(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if account.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Account not found")
		return
	}

	target, err := user.FindByID(r.Context(), h.db, r.PathValue("id"))
	if errors.Is(err, user.ErrNoUser) {
		httpx.WriteError(w, http.StatusNotFound, "Account not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminUserResponse(target))
}

func (h *Handler) AdminUserStatus(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if account.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Account not found")
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	body.Status = strings.ToLower(strings.TrimSpace(body.Status))
	if body.Status != "active" && body.Status != "suspended" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"status": "Status must be active or suspended"})
		return
	}

	target, err := user.ChangeStatus(r.Context(), h.db, account.ID, r.PathValue("id"), body.Status)
	if errors.Is(err, user.ErrNoUser) {
		httpx.WriteError(w, http.StatusNotFound, "Account not found")
		return
	}
	if errors.Is(err, user.ErrSelfStatusChange) {
		httpx.WriteCodedError(w, http.StatusConflict, "Administrators cannot change their own status", "SELF_STATUS_CHANGE")
		return
	}
	if errors.Is(err, user.ErrAccountClosed) {
		httpx.WriteCodedError(w, http.StatusConflict, "A closed account cannot be reinstated or suspended", "ACCOUNT_CLOSED")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminUserResponse(target))
}

func validateRegistration(email, password, displayName string) map[string]string {
	fields := make(map[string]string)

	switch {
	case email == "":
		fields["email"] = "Enter an email address"
	case utf8.RuneCountInString(email) > maxEmailLength:
		fields["email"] = "That email address is too long"
	case !isEmailAddress(email):
		fields["email"] = "Enter a valid email address"
	}

	switch {
	case utf8.RuneCountInString(password) < minPasswordLength:
		fields["password"] = "Use at least 12 characters"
	case utf8.RuneCountInString(password) > maxPasswordLength:
		fields["password"] = "Use at most 128 characters"
	}

	switch {
	case displayName == "":
		fields["display_name"] = "Enter a display name"
	case utf8.RuneCountInString(displayName) > maxDisplayNameLength:
		fields["display_name"] = "Use at most 80 characters"
	}

	return fields
}

func isEmailAddress(value string) bool {
	parsed, err := mail.ParseAddress(value)
	return err == nil && parsed.Address == value
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}
