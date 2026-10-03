package mail_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	netmail "net/mail"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/mail"
)

type fakeGoogle struct {
	t             *testing.T
	mu            sync.Mutex
	tokenRequests int
	tokenStatus   int
	tokenBody     string
	sendStatuses  []int
	sends         int
	authorization []string
	raw           []string
	server        *httptest.Server
}

func newFakeGoogle(t *testing.T) *fakeGoogle {
	f := &fakeGoogle{t: t, tokenStatus: http.StatusOK}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		f.tokenRequests++
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse token form: %v", err)
		}
		if r.PostForm.Get("grant_type") != "refresh_token" || r.PostForm.Get("refresh_token") != "refresh-secret" ||
			r.PostForm.Get("client_id") != "client.apps.googleusercontent.com" || r.PostForm.Get("client_secret") != "client-secret" {
			t.Errorf("unexpected token form: %v", r.PostForm)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(f.tokenStatus)
		if f.tokenBody != "" {
			_, _ = io.WriteString(w, f.tokenBody)
			return
		}
		_, _ = fmt.Fprintf(w, `{"access_token":"access-%d","expires_in":3599,"token_type":"Bearer"}`, f.tokenRequests)
	})
	mux.HandleFunc("POST /send", func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		var body struct {
			Raw string `json:"raw"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode send body: %v", err)
		}
		f.authorization = append(f.authorization, r.Header.Get("Authorization"))
		f.raw = append(f.raw, body.Raw)
		status := http.StatusOK
		if f.sends < len(f.sendStatuses) {
			status = f.sendStatuses[f.sends]
		}
		f.sends++
		w.WriteHeader(status)
		_, _ = io.WriteString(w, `{"id":"sent"}`)
	})
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeGoogle) sender(now func() time.Time) *mail.Gmail {
	return mail.NewGmail(mail.GmailConfig{
		ClientID: "client.apps.googleusercontent.com", ClientSecret: "client-secret", RefreshToken: "refresh-secret",
		From: "HeziBet <owner@gmail.com>", TokenEndpoint: f.server.URL + "/token", SendEndpoint: f.server.URL + "/send",
		MaxAttempts: 3, RetryDelay: -1, Now: now,
	})
}

func TestGmailSendsAMultipartMessageAsTheAuthorizedAccount(t *testing.T) {
	google := newFakeGoogle(t)
	message := mail.Message{
		To: []string{"admin@example.com", "Second Admin <second@example.com>"}, Subject: "Deposit request: ₱1,000.00",
		Text: "Amount: ₱1,000.00", HTML: "<p>Amount: <strong>₱1,000.00</strong></p>",
	}
	if err := google.sender(nil).Send(context.Background(), message); err != nil {
		t.Fatalf("send: %v", err)
	}
	if google.authorization[0] != "Bearer access-1" {
		t.Fatalf("authorization = %q", google.authorization[0])
	}

	raw, err := base64.URLEncoding.DecodeString(google.raw[0])
	if err != nil {
		t.Fatalf("raw is not base64url: %v", err)
	}
	parsed, err := netmail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("parse message: %v", err)
	}
	if from := parsed.Header.Get("From"); from != `"HeziBet" <owner@gmail.com>` {
		t.Fatalf("from = %q", from)
	}
	to, err := parsed.Header.AddressList("To")
	if err != nil || len(to) != 2 || to[0].Address != "admin@example.com" || to[1].Address != "second@example.com" {
		t.Fatalf("to = %v (%v)", to, err)
	}
	subject, err := new(mime.WordDecoder).DecodeHeader(parsed.Header.Get("Subject"))
	if err != nil || subject != message.Subject {
		t.Fatalf("subject = %q (%v)", subject, err)
	}
	if _, err := parsed.Header.Date(); err != nil {
		t.Fatalf("date: %v", err)
	}

	mediaType, params, err := mime.ParseMediaType(parsed.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/alternative" {
		t.Fatalf("content type = %q (%v)", mediaType, err)
	}
	reader := multipart.NewReader(parsed.Body, params["boundary"])
	want := []struct{ contentType, content string }{
		{"text/plain; charset=UTF-8", message.Text},
		{"text/html; charset=UTF-8", message.HTML},
	}
	for _, expected := range want {
		part, err := reader.NextPart()
		if err != nil {
			t.Fatalf("next part: %v", err)
		}
		content, _ := io.ReadAll(part)
		if part.Header.Get("Content-Type") != expected.contentType || string(content) != expected.content {
			t.Fatalf("part %q = %q, want %q", part.Header.Get("Content-Type"), content, expected.content)
		}
	}
}

func TestGmailKeepsHeaderInjectionInsideTheSubject(t *testing.T) {
	google := newFakeGoogle(t)
	message := testMessage()
	message.Subject = "Hello\r\nBcc: attacker@example.com"
	if err := google.sender(nil).Send(context.Background(), message); err != nil {
		t.Fatalf("send: %v", err)
	}
	raw, _ := base64.URLEncoding.DecodeString(google.raw[0])
	parsed, err := netmail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatalf("parse message: %v", err)
	}
	if parsed.Header.Get("Bcc") != "" {
		t.Fatalf("subject injected a header: %q", raw)
	}
}

func TestGmailReusesItsAccessTokenUntilItExpires(t *testing.T) {
	google := newFakeGoogle(t)
	now := time.Date(2026, 10, 3, 9, 0, 0, 0, time.UTC)
	sender := google.sender(func() time.Time { return now })

	for range 2 {
		if err := sender.Send(context.Background(), testMessage()); err != nil {
			t.Fatalf("send: %v", err)
		}
	}
	if google.tokenRequests != 1 {
		t.Fatalf("token requests = %d, want 1", google.tokenRequests)
	}

	now = now.Add(59 * time.Minute)
	if err := sender.Send(context.Background(), testMessage()); err != nil {
		t.Fatalf("send after expiry: %v", err)
	}
	if google.tokenRequests != 2 || google.authorization[2] != "Bearer access-2" {
		t.Fatalf("token requests = %d, authorization = %q", google.tokenRequests, google.authorization[2])
	}
}

func TestGmailRefreshesARejectedAccessTokenAndRetries(t *testing.T) {
	google := newFakeGoogle(t)
	google.sendStatuses = []int{http.StatusUnauthorized, http.StatusOK}
	if err := google.sender(nil).Send(context.Background(), testMessage()); err != nil {
		t.Fatalf("send: %v", err)
	}
	if google.tokenRequests != 2 || google.authorization[1] != "Bearer access-2" {
		t.Fatalf("token requests = %d, authorizations = %v", google.tokenRequests, google.authorization)
	}
}

func TestGmailRetriesOnlyTemporaryFailures(t *testing.T) {
	t.Run("temporary", func(t *testing.T) {
		google := newFakeGoogle(t)
		google.sendStatuses = []int{http.StatusServiceUnavailable, http.StatusTooManyRequests, http.StatusOK}
		if err := google.sender(nil).Send(context.Background(), testMessage()); err != nil {
			t.Fatalf("send: %v", err)
		}
		if google.sends != 3 {
			t.Fatalf("sends = %d, want 3", google.sends)
		}
	})

	t.Run("permanent", func(t *testing.T) {
		google := newFakeGoogle(t)
		google.sendStatuses = []int{http.StatusForbidden}
		err := google.sender(nil).Send(context.Background(), testMessage())
		if err == nil || !strings.Contains(err.Error(), "status 403") {
			t.Fatalf("error = %v, want permanent status failure", err)
		}
		if google.sends != 1 {
			t.Fatalf("sends = %d, want 1", google.sends)
		}
	})
}

func TestGmailReportsARevokedRefreshTokenWithoutItsSecrets(t *testing.T) {
	google := newFakeGoogle(t)
	google.tokenStatus = http.StatusBadRequest
	google.tokenBody = `{"error":"invalid_grant","error_description":"Token has been expired or revoked."}`
	err := google.sender(nil).Send(context.Background(), testMessage())
	if err == nil || !strings.Contains(err.Error(), "invalid_grant") {
		t.Fatalf("error = %v, want invalid_grant", err)
	}
	if google.tokenRequests != 1 || google.sends != 0 {
		t.Fatalf("token requests = %d, sends = %d", google.tokenRequests, google.sends)
	}
	for _, secret := range []string{"refresh-secret", "client-secret"} {
		if strings.Contains(err.Error(), secret) {
			t.Fatalf("error contains %s: %v", secret, err)
		}
	}
}

func TestGmailRefusesAMessageWithoutRecipients(t *testing.T) {
	google := newFakeGoogle(t)
	message := testMessage()
	message.To = nil
	if err := google.sender(nil).Send(context.Background(), message); err == nil {
		t.Fatal("a message without recipients was sent")
	}
	if google.tokenRequests != 0 {
		t.Fatalf("token requests = %d, want 0", google.tokenRequests)
	}
}
