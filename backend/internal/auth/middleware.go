package auth

import (
	"net"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
)

func (h *Handler) throttle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.limiter.Allow(clientIP(r), time.Now()) {
			w.Header().Set("Retry-After", "60")
			httpx.WriteError(w, http.StatusTooManyRequests, "Too many attempts. Try again shortly.")
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
