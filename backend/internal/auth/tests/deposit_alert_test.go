package auth_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/app"
	"github.com/gaming-platform/backend/internal/chat"
	"github.com/gaming-platform/backend/internal/mail"
)

type channelMailer chan mail.Message

func (c channelMailer) Send(_ context.Context, message mail.Message) error {
	c <- message
	return nil
}

func TestANewDepositEmailsEveryActiveAdministratorOnce(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	mailer := make(channelMailer, 4)
	server := httptest.NewServer(app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName: "gp_session", SessionTTL: time.Hour, AllowedOrigins: []string{webOrigin},
		MaxBodyBytes: 6 << 20, ProofDir: t.TempDir(), LoginsPerMinute: 100, ChatMessagesPerMinute: 100,
		PublicWebURL: "https://play.example.com",
	}, chat.NewHub(), mailer))
	t.Cleanup(server.Close)

	registerAdmin(t, db, server.URL, "first-admin@example.com")
	registerAdmin(t, db, server.URL, "second-admin@example.com")
	_, suspendedID := registerAdmin(t, db, server.URL, "suspended-admin@example.com")
	if _, err := db.Exec(`UPDATE users SET status = 'suspended' WHERE id = ($1::text)::uuid`, suspendedID); err != nil {
		t.Fatalf("suspend admin: %v", err)
	}

	player := clientWithCookies(t)
	if status, body := register(t, player, server.URL); status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	status, body := send(t, player, http.MethodGet, server.URL+"/api/payment-methods", nil)
	var methods []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &methods); status != http.StatusOK || err != nil || len(methods) == 0 {
		t.Fatalf("payment methods: status=%d err=%v (%s)", status, err, body)
	}

	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	status, body = sendDeposit(t, player, server.URL+"/api/deposits", methods[0].ID, "PHP", "123456", "GC-REF-1", "alert-key", "proof.png", png)
	if status != http.StatusCreated {
		t.Fatalf("create deposit: want 201, got %d (%s)", status, body)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode deposit: %v", err)
	}

	var message mail.Message
	select {
	case message = <-mailer:
	case <-time.After(5 * time.Second):
		t.Fatal("no admin alert was sent")
	}
	if !slices.Equal(message.To, []string{"first-admin@example.com", "second-admin@example.com"}) {
		t.Fatalf("recipients = %v", message.To)
	}
	if message.IdempotencyKey != "deposit-request-"+created.ID || message.Subject != "New deposit request: PHP 1,234.56" {
		t.Fatalf("unexpected alert: key=%q subject=%q", message.IdempotencyKey, message.Subject)
	}
	for _, want := range []string{testName, testEmail, "PHP 1,234.56", "GC-REF-1", created.ID, "https://play.example.com/admin/deposits"} {
		if !strings.Contains(message.Text, want) || !strings.Contains(message.HTML, want) {
			t.Fatalf("alert does not mention %q:\n%s\n%s", want, message.Text, message.HTML)
		}
	}

	status, body = sendDeposit(t, player, server.URL+"/api/deposits", methods[0].ID, "PHP", "123456", "GC-REF-1", "alert-key", "proof.png", png)
	if status != http.StatusOK {
		t.Fatalf("retry deposit: want 200, got %d (%s)", status, body)
	}
	select {
	case extra := <-mailer:
		t.Fatalf("a retried deposit sent another alert: %+v", extra)
	case <-time.After(300 * time.Millisecond):
	}
}
