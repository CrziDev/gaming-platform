package mail_test

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

	"github.com/gaming-platform/backend/internal/mail"
)

func testMessage() mail.Message {
	return mail.Message{
		IdempotencyKey: "message-id", To: []string{"player@example.com"},
		Subject: "Subject", Text: "plain body", HTML: "<p>html body</p>",
	}
}

func TestResendSendsTheMessage(t *testing.T) {
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

	sender := mail.NewResend(mail.ResendConfig{
		APIKey: "re_secret", From: "HeziBet <security@example.com>", Endpoint: server.URL, MaxAttempts: 1,
	})
	message := testMessage()
	if err := sender.Send(context.Background(), message); err != nil {
		t.Fatalf("send: %v", err)
	}

	if request.Authorization != "Bearer re_secret" {
		t.Fatalf("authorization = %q", request.Authorization)
	}
	if request.IdempotencyKey != message.IdempotencyKey {
		t.Fatalf("idempotency key = %q, want %q", request.IdempotencyKey, message.IdempotencyKey)
	}
	if request.ContentType != "application/json" {
		t.Fatalf("content type = %q", request.ContentType)
	}
	body := request.Body
	if body.From != "HeziBet <security@example.com>" || len(body.To) != 1 || body.To[0] != message.To[0] ||
		body.Subject != message.Subject || body.Text != message.Text || body.HTML != message.HTML {
		t.Fatalf("unexpected email: %+v", body)
	}
}

func TestResendRetriesOnlyTemporaryFailures(t *testing.T) {
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

		sender := mail.NewResend(mail.ResendConfig{APIKey: "key", From: "security@example.com", Endpoint: server.URL, MaxAttempts: 3, RetryDelay: -1})
		if err := sender.Send(context.Background(), testMessage()); err != nil {
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

		sender := mail.NewResend(mail.ResendConfig{APIKey: "key", From: "security@example.com", Endpoint: server.URL, MaxAttempts: 3, RetryDelay: -1})
		err := sender.Send(context.Background(), testMessage())
		if err == nil || !strings.Contains(err.Error(), "status 400") {
			t.Fatalf("error = %v, want permanent status failure", err)
		}
		if requests != 1 {
			t.Fatalf("requests = %d, want 1", requests)
		}
	})
}

func TestResendHonorsItsHTTPTimeout(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	sender := mail.NewResend(mail.ResendConfig{
		APIKey: "key", From: "security@example.com", Endpoint: server.URL,
		Client: &http.Client{Timeout: 10 * time.Millisecond}, MaxAttempts: 1,
	})
	err := sender.Send(context.Background(), testMessage())
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

func TestResendIgnoresAResponseBodyThatCouldContainSecrets(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)

	sender := mail.NewResend(mail.ResendConfig{APIKey: "key", From: "security@example.com", Endpoint: server.URL, MaxAttempts: 1})
	message := testMessage()
	message.Text = "secret-reset-token"
	err := sender.Send(context.Background(), message)
	if err == nil {
		t.Fatal("a permanent failure succeeded")
	}
	if strings.Contains(err.Error(), "secret-reset-token") {
		t.Fatalf("error contains response-body secret: %v", err)
	}
}
