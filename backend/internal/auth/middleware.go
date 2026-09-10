package auth

import (
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"sync"
	"time"
)

func (h *Handler) browserRules(next http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(h.cfg.AllowedOrigins))
	for _, origin := range h.cfg.AllowedOrigins {
		allowed[origin] = struct{}{}
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := w.Header()
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("X-Frame-Options", "DENY")
		header.Set("Referrer-Policy", "no-referrer")
		header.Set("Cache-Control", "no-store")

		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}

		header.Add("Vary", "Origin")

		if _, ok := allowed[origin]; !ok && origin != ownOrigin(r) {
			writeError(w, http.StatusForbidden, "This origin is not allowed to call the API")
			return
		}

		header.Set("Access-Control-Allow-Origin", origin)
		header.Set("Access-Control-Allow-Credentials", "true")

		if r.Method == http.MethodOptions {
			header.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			header.Set("Access-Control-Allow-Headers", "Content-Type")
			header.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (h *Handler) limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > h.cfg.MaxBodyBytes {
			writeError(w, http.StatusRequestEntityTooLarge, "The request body is too large")
			return
		}
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, h.cfg.MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) logAndRecover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		defer func() {
			if recovered := recover(); recovered != nil {
				h.logger.Error("panic recovered",
					slog.String("method", r.Method),
					slog.String("path", r.URL.Path),
					slog.Any("panic", recovered),
					slog.String("stack", string(debug.Stack())))

				if !recorder.wrote {
					writeError(recorder, http.StatusInternalServerError, "An unexpected error occurred")
				}
			}

			level := slog.LevelInfo
			switch {
			case recorder.status >= 500:
				level = slog.LevelError
			case recorder.status >= 400:
				level = slog.LevelWarn
			}

			h.logger.Log(r.Context(), level, "request",
				slog.String("method", r.Method),
				slog.String("path", r.URL.Path),
				slog.Int("status", recorder.status),
				slog.Duration("duration", time.Since(start)))
		}()

		next.ServeHTTP(recorder, r)
	})
}

func (h *Handler) throttle(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !h.limiter.allow(clientIP(r), time.Now()) {
			w.Header().Set("Retry-After", "60")
			writeError(w, http.StatusTooManyRequests, "Too many attempts. Try again shortly.")
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

	if len(l.seen) >= maxTrackedClients {
		for seenKey, entry := range l.seen {
			if now.After(entry.resetAt) {
				delete(l.seen, seenKey)
			}
		}
	}

	entry, tracked := l.seen[key]
	if !tracked || now.After(entry.resetAt) {
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

func ownOrigin(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (r *statusRecorder) WriteHeader(status int) {
	if r.wrote {
		return
	}
	r.status = status
	r.wrote = true
	r.ResponseWriter.WriteHeader(status)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.ResponseWriter.Write(b)
}
