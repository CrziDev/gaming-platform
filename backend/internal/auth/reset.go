package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

const (
	resetTokenBytes      = 32
	resetTokenTTL        = 30 * time.Minute
	defaultResetMinDelay = 300 * time.Millisecond
	invalidResetLink     = "This reset link is invalid or has expired"
)

type PasswordResetMessage struct {
	ID        string
	Recipient string
	Token     string
}

type PasswordResetSender interface {
	SendPasswordReset(context.Context, PasswordResetMessage) error
}

func (h *Handler) RequestPasswordReset(w http.ResponseWriter, r *http.Request) {
	h.throttle(h.requestPasswordReset)(w, r)
}

func (h *Handler) requestPasswordReset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}

	email := normalizeEmail(body.Email)
	if message := validateEmail(email); message != "" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"email": message})
		return
	}
	if h.cfg.PasswordResetSender == nil {
		httpx.WriteError(w, http.StatusServiceUnavailable, "Password reset is unavailable right now")
		return
	}

	started := time.Now()
	defer h.finishResetWindow(started)

	tx, err := h.db.BeginTx(r.Context(), nil)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	defer tx.Rollback()

	account, err := user.FindActiveByEmailForUpdateTx(r.Context(), tx, email)
	if errors.Is(err, user.ErrNoUser) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}

	token, err := newResetToken()
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if _, err := tx.ExecContext(r.Context(), `
		UPDATE password_reset_tokens
		SET used_at = now()
		WHERE user_id = ($1::text)::uuid AND used_at IS NULL`, account.ID); err != nil {
		h.internal(w, r, fmt.Errorf("auth: supersede reset tokens: %w", err))
		return
	}

	var resetID string
	if err := tx.QueryRowContext(r.Context(), `
		INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
		VALUES (($1::text)::uuid, $2, $3)
		RETURNING id::text`, account.ID, hashResetToken(token), time.Now().UTC().Add(resetTokenTTL)).Scan(&resetID); err != nil {
		h.internal(w, r, fmt.Errorf("auth: create reset token: %w", err))
		return
	}
	if err := tx.Commit(); err != nil {
		h.internal(w, r, fmt.Errorf("auth: commit reset request: %w", err))
		return
	}

	if err := h.cfg.PasswordResetSender.SendPasswordReset(r.Context(), PasswordResetMessage{
		ID: resetID, Recipient: account.Email, Token: token,
	}); err != nil {
		h.logger.Error("password reset delivery failed",
			slog.String("reset_id", resetID),
			slog.Any("error", err))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ConfirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	h.throttle(h.confirmPasswordReset)(w, r)
}

func (h *Handler) confirmPasswordReset(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	if message := validatePassword(body.Password); message != "" {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"password": message})
		return
	}
	tokenHash, ok := parseResetToken(body.Token)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	}

	passwordHash, err := HashPassword(body.Password)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	sessionToken, sessionExpiresAt, err := h.prepareSession()
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

	var userID string
	if err := tx.QueryRowContext(r.Context(), `
		SELECT user_id::text
		FROM password_reset_tokens
		WHERE token_hash = $1`, tokenHash).Scan(&userID); errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	} else if err != nil {
		h.internal(w, r, fmt.Errorf("auth: find reset token owner: %w", err))
		return
	}

	account, err := user.FindByIDForUpdateTx(r.Context(), tx, userID)
	if errors.Is(err, user.ErrNoUser) {
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}

	var resetID string
	var expiresAt time.Time
	var usedAt sql.NullTime
	if err := tx.QueryRowContext(r.Context(), `
		SELECT id::text, expires_at, used_at
		FROM password_reset_tokens
		WHERE token_hash = $1 AND user_id = ($2::text)::uuid
		FOR UPDATE`, tokenHash, account.ID).Scan(&resetID, &expiresAt, &usedAt); errors.Is(err, sql.ErrNoRows) {
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	} else if err != nil {
		h.internal(w, r, fmt.Errorf("auth: lock reset token: %w", err))
		return
	}
	if account.Status != "active" || usedAt.Valid || !expiresAt.After(time.Now().UTC()) {
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	}

	if err := user.UpdatePasswordTx(r.Context(), tx, account.ID, passwordHash); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := user.RevokeSessionsTx(r.Context(), tx, account.ID); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := user.CreateSessionTx(r.Context(), tx, account.ID, hashSessionToken(sessionToken), sessionExpiresAt); err != nil {
		h.internal(w, r, err)
		return
	}
	result, err := tx.ExecContext(r.Context(), `
		UPDATE password_reset_tokens
		SET used_at = now()
		WHERE id = ($1::text)::uuid AND used_at IS NULL`, resetID)
	if err != nil {
		h.internal(w, r, fmt.Errorf("auth: consume reset token: %w", err))
		return
	}
	if changed, err := result.RowsAffected(); err != nil || changed != 1 {
		if err != nil {
			h.internal(w, r, fmt.Errorf("auth: count consumed reset token: %w", err))
			return
		}
		httpx.WriteError(w, http.StatusBadRequest, invalidResetLink)
		return
	}
	if err := tx.Commit(); err != nil {
		h.internal(w, r, fmt.Errorf("auth: commit password reset: %w", err))
		return
	}

	account.PasswordHash = passwordHash
	h.setSessionCookie(w, sessionToken, sessionExpiresAt)
	httpx.WriteJSON(w, http.StatusOK, newUserResponse(account))
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request, account user.User) {
	h.throttle(func(w http.ResponseWriter, r *http.Request) {
		h.changePassword(w, r, account)
	})(w, r)
}

func (h *Handler) changePassword(w http.ResponseWriter, r *http.Request, sessionAccount user.User) {
	var body struct {
		CurrentPassword string `json:"current_password"`
		Password        string `json:"password"`
	}
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	fields := make(map[string]string)
	if body.CurrentPassword == "" {
		fields["current_password"] = "Enter your current password"
	}
	if message := validatePassword(body.Password); message != "" {
		fields["password"] = message
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	sessionToken, sessionExpiresAt, err := h.prepareSession()
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

	account, err := user.FindByIDForUpdateTx(r.Context(), tx, sessionAccount.ID)
	if errors.Is(err, user.ErrNoUser) {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if account.Status != "active" {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return
	}
	matches, err := VerifyPassword(account.PasswordHash, body.CurrentPassword)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if !matches {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{
			"current_password": "Current password is incorrect",
		})
		return
	}
	passwordHash, err := HashPassword(body.Password)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	if err := user.UpdatePasswordTx(r.Context(), tx, account.ID, passwordHash); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := user.RevokeSessionsTx(r.Context(), tx, account.ID); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := user.CreateSessionTx(r.Context(), tx, account.ID, hashSessionToken(sessionToken), sessionExpiresAt); err != nil {
		h.internal(w, r, err)
		return
	}
	if err := tx.Commit(); err != nil {
		h.internal(w, r, fmt.Errorf("auth: commit password change: %w", err))
		return
	}

	h.setSessionCookie(w, sessionToken, sessionExpiresAt)
	w.WriteHeader(http.StatusNoContent)
}

func validateEmail(email string) string {
	switch {
	case email == "":
		return "Enter an email address"
	case utf8.RuneCountInString(email) > maxEmailLength:
		return "That email address is too long"
	case !isEmailAddress(email):
		return "Enter a valid email address"
	default:
		return ""
	}
}

func validatePassword(password string) string {
	switch {
	case utf8.RuneCountInString(password) < minPasswordLength:
		return "Use at least 12 characters"
	case utf8.RuneCountInString(password) > maxPasswordLength:
		return "Use at most 128 characters"
	default:
		return ""
	}
}

func (h *Handler) finishResetWindow(started time.Time) {
	if remaining := defaultResetMinDelay - time.Since(started); remaining > 0 {
		time.Sleep(remaining)
	}
}

func newResetToken() (string, error) {
	raw := make([]byte, resetTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("auth: read reset token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func parseResetToken(token string) ([]byte, bool) {
	token = strings.TrimSpace(token)
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) != resetTokenBytes {
		return nil, false
	}
	return hashResetToken(token), true
}

func hashResetToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
