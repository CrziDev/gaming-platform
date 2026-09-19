package ratelimit

import (
	"fmt"
	"testing"
	"time"
)

func TestRateLimiterNeverExceedsItsClientCap(t *testing.T) {
	limiter := New(2, time.Minute)
	start := time.Date(2026, time.September, 13, 0, 0, 0, 0, time.UTC)

	for i := 0; i < maxTrackedKeys+100; i++ {
		if !limiter.Allow(fmt.Sprintf("client-%d", i), start.Add(time.Duration(i))) {
			t.Fatalf("first request for client %d was rejected", i)
		}
		if len(limiter.seen) > maxTrackedKeys {
			t.Fatalf("tracked clients = %d, cap = %d", len(limiter.seen), maxTrackedKeys)
		}
	}
	if _, retained := limiter.seen[fmt.Sprintf("client-%d", maxTrackedKeys+99)]; !retained {
		t.Fatal("newest client was not retained")
	}
}

func TestRateLimiterResetsAtTheWindowBoundary(t *testing.T) {
	limiter := New(1, time.Minute)
	start := time.Date(2026, time.September, 13, 0, 0, 0, 0, time.UTC)
	if !limiter.Allow("client", start) {
		t.Fatal("first request was rejected")
	}
	if limiter.Allow("client", start.Add(time.Minute-time.Nanosecond)) {
		t.Fatal("request inside the window was accepted")
	}
	if !limiter.Allow("client", start.Add(time.Minute)) {
		t.Fatal("request at the reset boundary was rejected")
	}
}
