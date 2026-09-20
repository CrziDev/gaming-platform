package auth_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/auth"
)

func TestResendSenderBuildsTheResetEmail(t *testing.T) {
	var request struct {
		Authorization  string
		IdempotencyKey string
		ContentType    string
		Body           struct {
			From    string   `json:"from"`
			To      []string `json:"to"`
			Subject string   `json:"subject"`
			Text    string   `json:"text"`
			HTML    string   `json:"html"`
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request.Authorization = r.Header.Get("Authorization")
		request.IdempotencyKey = r.Header.Get("Idempotency-Key")
		request.ContentType = r.Header.Get("Content-Type")
		if err := json.NewDecoder(r.Body).Decode(&request.Body); err != nil {
			t.Errorf("decode request: %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	sender := auth.NewResendSender(auth.ResendConfig{
		APIKey: "re_secret", From: "HeziBet <security@example.com>",
		PublicWebURL: "https://play.example.com", Endpoint: server.URL,
		MaxAttempts: 1,
	})
	message := auth.PasswordResetMessage{
		ID: "reset-record-id", Recipient: "player@example.com", Token: "a+b/c=",
	}
	if err := sender.SendPasswordReset(context.Background(), message); err != nil {
		t.Fatalf("send: %v", err)
	}

	if request.Authorization != "Bearer re_secret" {
		t.Fatalf("authorization = %q", request.Authorization)
	}
	if request.IdempotencyKey != message.ID {
		t.Fatalf("idempotency key = %q, want %q", request.IdempotencyKey, message.ID)
	}
	if request.ContentType != "application/json" {
		t.Fatalf("content type = %q", request.ContentType)
	}
	if request.Body.From != "HeziBet <security@example.com>" || len(request.Body.To) != 1 || request.Body.To[0] != message.Recipient {
		t.Fatalf("unexpected envelope: %+v", request.Body)
	}
	wantLink := "https://play.example.com/reset?token=a%2Bb%2Fc%3D"
	if !strings.Contains(request.Body.Text, wantLink) || !strings.Contains(request.Body.Text, "30 minutes") {
		t.Fatalf("plain-text body does not contain the reset link and expiry: %q", request.Body.Text)
	}
	if !strings.Contains(request.Body.HTML, `href="`+wantLink+`"`) || !strings.Contains(request.Body.HTML, "30 minutes") {
		t.Fatalf("HTML body does not contain the reset link and expiry: %q", request.Body.HTML)
	}
}

func TestResendSenderRetriesOnlyTemporaryFailures(t *testing.T) {
	t.Run("temporary", func(t *testing.T) {
		var mu sync.Mutex
		statuses := []int{http.StatusInternalServerError, http.StatusTooManyRequests, http.StatusAccepted}
		requests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			mu.Lock()
			status := statuses[requests]
			requests++
			mu.Unlock()
			w.WriteHeader(status)
		}))
		t.Cleanup(server.Close)

		sender := auth.NewResendSender(auth.ResendConfig{
			APIKey: "key", From: "security@example.com", PublicWebURL: "https://play.example.com",
			Endpoint: server.URL, MaxAttempts: 3, RetryDelay: -1,
		})
		if err := sender.SendPasswordReset(context.Background(), auth.PasswordResetMessage{ID: "id", Recipient: "player@example.com", Token: "token"}); err != nil {
			t.Fatalf("send: %v", err)
		}
		if requests != 3 {
			t.Fatalf("requests = %d, want 3", requests)
		}
	})

	t.Run("permanent", func(t *testing.T) {
		requests := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			requests++
			w.WriteHeader(http.StatusBadRequest)
		}))
		t.Cleanup(server.Close)

		sender := auth.NewResendSender(auth.ResendConfig{
			APIKey: "key", From: "security@example.com", PublicWebURL: "https://play.example.com",
			Endpoint: server.URL, MaxAttempts: 3, RetryDelay: -1,
		})
		err := sender.SendPasswordReset(context.Background(), auth.PasswordResetMessage{ID: "id", Recipient: "player@example.com", Token: "do-not-log-this-token"})
		if err == nil || !strings.Contains(err.Error(), "status 400") {
			t.Fatalf("error = %v, want permanent status failure", err)
		}
		if strings.Contains(err.Error(), "do-not-log-this-token") {
			t.Fatalf("error contains the reset secret: %v", err)
		}
		if requests != 1 {
			t.Fatalf("requests = %d, want 1", requests)
		}
	})
}

func TestResendSenderHonorsItsHTTPTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	sender := auth.NewResendSender(auth.ResendConfig{
		APIKey: "key", From: "security@example.com", PublicWebURL: "https://play.example.com",
		Endpoint: server.URL, Client: &http.Client{Timeout: 10 * time.Millisecond}, MaxAttempts: 1,
	})
	err := sender.SendPasswordReset(context.Background(), auth.PasswordResetMessage{ID: "id", Recipient: "player@example.com", Token: "token"})
	if err == nil {
		t.Fatal("a timed-out delivery succeeded")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		var timeout interface{ Timeout() bool }
		if !errors.As(err, &timeout) || !timeout.Timeout() {
			t.Fatalf("error = %v, want timeout", err)
		}
	}
}

func TestResendSenderIgnoresAResponseBodyThatCouldContainSecrets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)

	sender := auth.NewResendSender(auth.ResendConfig{
		APIKey: "key", From: "security@example.com", PublicWebURL: "https://play.example.com",
		Endpoint: server.URL, MaxAttempts: 1,
	})
	err := sender.SendPasswordReset(context.Background(), auth.PasswordResetMessage{ID: "id", Recipient: "player@example.com", Token: "secret-reset-token"})
	if err == nil {
		t.Fatal("a permanent failure succeeded")
	}
	if strings.Contains(err.Error(), "secret-reset-token") {
		t.Fatalf("error contains response-body secret: %v", err)
	}
}
