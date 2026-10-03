package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const resendEndpoint = "https://api.resend.com/emails"

type ResendConfig struct {
	APIKey      string
	From        string
	Endpoint    string
	Client      *http.Client
	MaxAttempts int
	RetryDelay  time.Duration
}

type Resend struct {
	apiKey      string
	from        string
	endpoint    string
	client      *http.Client
	maxAttempts int
	retryDelay  time.Duration
}

func NewResend(cfg ResendConfig) *Resend {
	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = resendEndpoint
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: requestTimeout}
	}
	maxAttempts := cfg.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = maximumAttempts
	}
	delay := cfg.RetryDelay
	if delay == 0 {
		delay = retryDelay
	}
	return &Resend{
		apiKey:      cfg.APIKey,
		from:        cfg.From,
		endpoint:    endpoint,
		client:      client,
		maxAttempts: maxAttempts,
		retryDelay:  delay,
	}
}

func (s *Resend) Send(ctx context.Context, message Message) error {
	body, err := json.Marshal(struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
		HTML    string   `json:"html"`
	}{
		From:    s.from,
		To:      message.To,
		Subject: message.Subject,
		Text:    message.Text,
		HTML:    message.HTML,
	})
	if err != nil {
		return fmt.Errorf("mail: encode resend email: %w", err)
	}
	return withRetries(ctx, s.maxAttempts, s.retryDelay, func() (bool, error) {
		return s.send(ctx, message.IdempotencyKey, body)
	})
}

func (s *Resend) send(ctx context.Context, idempotencyKey string, body []byte) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("mail: build resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}

	response, err := s.client.Do(req)
	if err != nil {
		return true, fmt.Errorf("mail: send through resend: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))

	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return false, nil
	}
	return retryableStatus(response.StatusCode), fmt.Errorf("mail: resend returned status %d", response.StatusCode)
}
