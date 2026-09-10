package auth

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"
	"time"

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
	AllowedOrigins  []string
	MaxBodyBytes    int64
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

func (h *Handler) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/register", h.throttle(h.Register))
	mux.HandleFunc("POST /api/login", h.throttle(h.Login))
	mux.HandleFunc("POST /api/logout", h.Logout)
	mux.HandleFunc("GET /api/me", h.Me)
	mux.HandleFunc("GET /api/admin/users", h.AdminUsers)
	mux.HandleFunc("/", h.notFound)

	return h.logAndRecover(h.browserRules(h.limitBody(mux)))
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	email := normalizeEmail(body.Email)
	displayName := strings.TrimSpace(body.DisplayName)

	if fields := validateRegistration(email, body.Password, displayName); len(fields) > 0 {
		writeFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	hash, err := HashPassword(body.Password)
	if err != nil {
		h.internal(w, r, err)
		return
	}

	account, err := user.Create(r.Context(), h.db, email, hash, displayName)
	if errors.Is(err, user.ErrEmailTaken) {
		writeJSON(w, http.StatusConflict, errorResponse{
			Error:  "That email address is already registered",
			Fields: map[string]string{"email": "This email address is already registered"},
		})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}

	if !h.startSession(w, r, account) {
		return
	}
	writeJSON(w, http.StatusCreated, newUserResponse(account))
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !readJSON(w, r, &body) {
		return
	}

	email := normalizeEmail(body.Email)
	if email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "Enter an email address and a password")
		return
	}

	account, err := user.FindByEmail(r.Context(), h.db, email)
	if errors.Is(err, user.ErrNoUser) {
		spendVerificationTime(body.Password)
		writeError(w, http.StatusUnauthorized, invalidCredentials)
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
		writeError(w, http.StatusUnauthorized, invalidCredentials)
		return
	}

	if account.Status != "active" {
		writeError(w, http.StatusForbidden, "This account is not active")
		return
	}

	if !h.startSession(w, r, account) {
		return
	}
	writeJSON(w, http.StatusOK, newUserResponse(account))
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
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, newUserResponse(account))
}

func (h *Handler) AdminUsers(w http.ResponseWriter, r *http.Request) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return
	}
	if account.Role != "admin" {
		writeError(w, http.StatusForbidden, "Administrator access is required")
		return
	}

	accounts, err := user.List(r.Context(), h.db)
	if err != nil {
		h.internal(w, r, err)
		return
	}

	response := make([]adminUserResponse, 0, len(accounts))
	for _, listedAccount := range accounts {
		response = append(response, newAdminUserResponse(listedAccount))
	}
	writeJSON(w, http.StatusOK, response)
}

func validateRegistration(email, password, displayName string) map[string]string {
	fields := make(map[string]string)

	switch {
	case email == "":
		fields["email"] = "Enter an email address"
	case len(email) > maxEmailLength:
		fields["email"] = "That email address is too long"
	case !isEmailAddress(email):
		fields["email"] = "Enter a valid email address"
	}

	switch {
	case len(password) < minPasswordLength:
		fields["password"] = "Use at least 12 characters"
	case len(password) > maxPasswordLength:
		fields["password"] = "Use at most 128 characters"
	}

	switch {
	case displayName == "":
		fields["display_name"] = "Enter a display name"
	case len(displayName) > maxDisplayNameLength:
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
