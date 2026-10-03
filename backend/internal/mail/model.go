package mail

import (
	"context"
	"net/http"
	"time"
)

const (
	requestTimeout  = 5 * time.Second
	maximumAttempts = 3
	retryDelay      = 100 * time.Millisecond
)

// IdempotencyKey identifies one logical email, so a provider that supports it
// delivers a retried send once.
type Message struct {
	IdempotencyKey string
	To             []string
	Subject        string
	Text           string
	HTML           string
}

type Sender interface {
	Send(context.Context, Message) error
}

func retryableStatus(status int) bool {
	return status == http.StatusRequestTimeout || status == http.StatusTooManyRequests || status >= 500
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	if delay < 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func withRetries(ctx context.Context, attempts int, delay time.Duration, send func() (bool, error)) error {
	for attempt := 1; ; attempt++ {
		retry, err := send()
		if err == nil {
			return nil
		}
		if !retry || attempt >= attempts {
			return err
		}
		if err := waitForRetry(ctx, delay); err != nil {
			return err
		}
	}
}
