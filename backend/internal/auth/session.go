package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/user"
)

func (h *Handler) startSession(w http.ResponseWriter, r *http.Request, account user.User) bool {
	token, expiresAt, err := h.prepareSession()
	if err != nil {
		h.internal(w, r, err)
		return false
	}

	if err := user.CreateSession(r.Context(), h.db, account.ID, hashSessionToken(token), expiresAt); err != nil {
		h.internal(w, r, err)
		return false
	}

	h.setSessionCookie(w, token, expiresAt)
	return true
}

func (h *Handler) prepareSession() (string, time.Time, error) {
	token, err := newSessionToken()
	if err != nil {
		return "", time.Time{}, err
	}
	return token, time.Now().UTC().Add(h.cfg.SessionTTL), nil
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, token string, expiresAt time.Time) {
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
