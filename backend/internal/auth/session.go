package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/user"
)

const (
	insertSessionSQL = `
		INSERT INTO auth_sessions (user_id, token_hash, expires_at)
		VALUES (($1::text)::uuid, $2, $3)`

	selectUserBySessionSQL = `
		SELECT u.id::text, u.email, u.password_hash, u.display_name, u.role, u.status, u.created_at
		FROM auth_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1
		  AND s.revoked_at IS NULL
		  AND s.expires_at > now()
		  AND u.status = 'active'`

	revokeSessionSQL = `
		UPDATE auth_sessions
		SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`
)

var (
	ErrNoSession = errors.New("auth: no usable session")
)

func findUserBySessionToken(ctx context.Context, db *sql.DB, token string) (user.User, error) {
	var account user.User

	err := db.QueryRowContext(ctx, selectUserBySessionSQL, hashSessionToken(token)).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return user.User{}, ErrNoSession
	}
	if err != nil {
		return user.User{}, fmt.Errorf("auth: find user by session: %w", err)
	}
	return account, nil
}

func insertSession(ctx context.Context, db *sql.DB, userID, token string, expiresAt time.Time) error {
	_, err := db.ExecContext(ctx, insertSessionSQL, userID, hashSessionToken(token), expiresAt)
	if err != nil {
		return fmt.Errorf("auth: insert session: %w", err)
	}
	return nil
}

func revokeSession(ctx context.Context, db *sql.DB, token string) error {
	if _, err := db.ExecContext(ctx, revokeSessionSQL, hashSessionToken(token)); err != nil {
		return fmt.Errorf("auth: revoke session: %w", err)
	}
	return nil
}

func (h *Handler) currentUser(w http.ResponseWriter, r *http.Request) (user.User, bool) {
	return h.CurrentUser(w, r)
}

func (h *Handler) startSession(w http.ResponseWriter, r *http.Request, account user.User) bool {
	token, err := newSessionToken()
	if err != nil {
		h.internal(w, r, err)
		return false
	}

	expiresAt := time.Now().UTC().Add(h.cfg.SessionTTL)
	if err := insertSession(r.Context(), h.db, account.ID, token, expiresAt); err != nil {
		h.internal(w, r, err)
		return false
	}

	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expiresAt,
		MaxAge:   int(h.cfg.SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	return true
}

func (h *Handler) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     h.cfg.CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

const sessionTokenBytes = 32

func newSessionToken() (string, error) {
	raw := make([]byte, sessionTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("auth: read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func hashSessionToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
