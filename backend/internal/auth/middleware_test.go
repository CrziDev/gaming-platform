package auth

import (
	"fmt"
	"testing"
	"time"
)

func TestRateLimiterNeverExceedsItsClientCap(t *testing.T) {
	limiter := newRateLimiter(2, time.Minute)
	start := time.Date(2026, time.September, 13, 0, 0, 0, 0, time.UTC)

	for i := 0; i < maxTrackedClients+100; i++ {
		if !limiter.allow(fmt.Sprintf("client-%d", i), start.Add(time.Duration(i))) {
			t.Fatalf("first request for client %d was rejected", i)
		}
		if len(limiter.seen) > maxTrackedClients {
			t.Fatalf("tracked clients = %d, cap = %d", len(limiter.seen), maxTrackedClients)
		}
	}
	if _, retained := limiter.seen[fmt.Sprintf("client-%d", maxTrackedClients+99)]; !retained {
		t.Fatal("newest client was not retained")
	}
}

func TestRateLimiterResetsAtTheWindowBoundary(t *testing.T) {
	limiter := newRateLimiter(1, time.Minute)
	start := time.Date(2026, time.September, 13, 0, 0, 0, 0, time.UTC)
	if !limiter.allow("client", start) {
		t.Fatal("first request was rejected")
	}
	if limiter.allow("client", start.Add(time.Minute-time.Nanosecond)) {
		t.Fatal("request inside the window was accepted")
	}
	if !limiter.allow("client", start.Add(time.Minute)) {
		t.Fatal("request at the reset boundary was rejected")
	}
}
