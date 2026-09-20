package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	resendEndpoint        = "https://api.resend.com/emails"
	resendRequestTimeout  = 5 * time.Second
	resendMaximumAttempts = 3
	resendRetryDelay      = 100 * time.Millisecond
)

type ResendConfig struct {
	APIKey       string
	From         string
	PublicWebURL string
	Endpoint     string
	Client       *http.Client
	MaxAttempts  int
	RetryDelay   time.Duration
}

type ResendSender struct {
	apiKey       string
	from         string
	publicWebURL string
	endpoint     string
	client       *http.Client
	maxAttempts  int
	retryDelay   time.Duration
}

func NewResendSender(cfg ResendConfig) *ResendSender {
	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = resendEndpoint
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: resendRequestTimeout}
	}
	maxAttempts := cfg.MaxAttempts
	if maxAttempts <= 0 {
		maxAttempts = resendMaximumAttempts
	}
	retryDelay := cfg.RetryDelay
	if retryDelay == 0 {
		retryDelay = resendRetryDelay
	}
	return &ResendSender{
		apiKey:       cfg.APIKey,
		from:         cfg.From,
		publicWebURL: strings.TrimRight(cfg.PublicWebURL, "/"),
		endpoint:     endpoint,
		client:       client,
		maxAttempts:  maxAttempts,
		retryDelay:   retryDelay,
	}
}

func (s *ResendSender) SendPasswordReset(ctx context.Context, message PasswordResetMessage) error {
	resetURL, err := s.resetURL(message.Token)
	if err != nil {
		return err
	}
	body, err := json.Marshal(struct {
		From    string   `json:"from"`
		To      []string `json:"to"`
		Subject string   `json:"subject"`
		Text    string   `json:"text"`
		HTML    string   `json:"html"`
	}{
		From:    s.from,
		To:      []string{message.Recipient},
		Subject: "Reset your HeziBet password",
		Text:    "Use this link to reset your password. It expires in 30 minutes:\n\n" + resetURL + "\n\nIf you did not request this, you can ignore this email.",
		HTML:    "<p>Use this link to reset your password. It expires in 30 minutes:</p><p><a href=\"" + html.EscapeString(resetURL) + "\">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>",
	})
	if err != nil {
		return fmt.Errorf("auth: encode reset email: %w", err)
	}

	for attempt := 1; attempt <= s.maxAttempts; attempt++ {
		retry, err := s.send(ctx, message.ID, body)
		if err == nil {
			return nil
		}
		if !retry || attempt == s.maxAttempts {
			return err
		}
		if err := waitForRetry(ctx, s.retryDelay); err != nil {
			return fmt.Errorf("auth: wait to retry reset email: %w", err)
		}
	}
	return errors.New("auth: reset email attempts exhausted")
}

func (s *ResendSender) send(ctx context.Context, idempotencyKey string, body []byte) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("auth: build reset email request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", idempotencyKey)

	response, err := s.client.Do(req)
	if err != nil {
		return true, fmt.Errorf("auth: send reset email: %w", err)
	}
	defer response.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1<<20))

	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return false, nil
	}
	err = fmt.Errorf("auth: reset email service returned status %d", response.StatusCode)
	return retryableResendStatus(response.StatusCode), err
}

func (s *ResendSender) resetURL(token string) (string, error) {
	base, err := url.Parse(s.publicWebURL)
	if err != nil {
		return "", fmt.Errorf("auth: parse public web URL: %w", err)
	}
	base.Path = strings.TrimRight(base.Path, "/") + "/reset"
	query := base.Query()
	query.Set("token", token)
	base.RawQuery = query.Encode()
	return base.String(), nil
}

func retryableResendStatus(status int) bool {
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
