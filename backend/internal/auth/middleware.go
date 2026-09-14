package auth

import (
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
)

func (h *Handler) throttle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.limiter.allow(clientIP(r), time.Now()) {
			w.Header().Set("Retry-After", "60")
			httpx.WriteError(w, http.StatusTooManyRequests, "Too many attempts. Try again shortly.")
			return
		}
		next(w, r)
	}
}

const maxTrackedClients = 4096

type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	seen   map[string]attempts
}

type attempts struct {
	count   int
	resetAt time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, seen: make(map[string]attempts)}
}

func (l *rateLimiter) allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, tracked := l.seen[key]
	if !tracked && len(l.seen) >= maxTrackedClients {
		var earliestKey string
		var earliestReset time.Time
		for seenKey, entry := range l.seen {
			if !now.Before(entry.resetAt) {
				delete(l.seen, seenKey)
				continue
			}
			if earliestKey == "" || entry.resetAt.Before(earliestReset) {
				earliestKey = seenKey
				earliestReset = entry.resetAt
			}
		}
		if len(l.seen) >= maxTrackedClients {
			delete(l.seen, earliestKey)
		}
	}

	if !tracked || !now.Before(entry.resetAt) {
		l.seen[key] = attempts{count: 1, resetAt: now.Add(l.window)}
		return true
	}
	if entry.count >= l.limit {
		return false
	}

	entry.count++
	l.seen[key] = entry
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
