package ratelimit

import (
	"sync"
	"time"
)

const maxTrackedKeys = 4096

// Limiter counts attempts per key in fixed windows and holds at most
// maxTrackedKeys entries, evicting expired and then earliest-expiring keys so an
// attacker rotating keys cannot grow it without bound.
type Limiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	seen   map[string]attempts
}

type attempts struct {
	count   int
	resetAt time.Time
}

func New(limit int, window time.Duration) *Limiter {
	return &Limiter{limit: limit, window: window, seen: make(map[string]attempts)}
}

func (l *Limiter) Allow(key string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	entry, tracked := l.seen[key]
	if !tracked && len(l.seen) >= maxTrackedKeys {
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
		if len(l.seen) >= maxTrackedKeys {
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
