package auth

import (
	"errors"
	"net/http"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

// Guarded is the shape of a handler that needs the signed-in account. Only Player
// and Admin turn one into an http.HandlerFunc, so it cannot be routed without its
// guard.
type Guarded func(http.ResponseWriter, *http.Request, user.User)

func (h *Handler) Player(next Guarded) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		account, ok := h.currentUser(w, r)
		if !ok {
			return
		}
		next(w, r, account)
	}
}

func (h *Handler) Admin(next Guarded) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		account, ok := h.currentUser(w, r)
		if !ok {
			return
		}
		if account.Role != "admin" {
			httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
			return
		}
		next(w, r, account)
	}
}

func (h *Handler) currentUser(w http.ResponseWriter, r *http.Request) (user.User, bool) {
	cookie, err := r.Cookie(h.cfg.CookieName)
	if err != nil || cookie.Value == "" {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return user.User{}, false
	}

	account, err := user.FindBySessionHash(r.Context(), h.db, hashSessionToken(cookie.Value))
	if errors.Is(err, user.ErrNoSession) {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return user.User{}, false
	}
	if err != nil {
		h.internal(w, r, err)
		return user.User{}, false
	}
	return account, true
}
