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
	"github.com/gaming-platform/backend/internal/wallet"
)

type channelMailer chan mail.Message

func (c channelMailer) Send(_ context.Context, message mail.Message) error {
	c <- message
	return nil
}

type staffBody struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Status      string `json:"status"`
	AlertEmails bool   `json:"alert_emails"`
	CreatedAt   string `json:"created_at"`
}

func newAlertServer(t *testing.T, mailer mail.Sender) string {
	t.Helper()
	server := httptest.NewServer(app.New(requireDB(t), slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName: "gp_session", SessionTTL: time.Hour, AllowedOrigins: []string{webOrigin},
		MaxBodyBytes: 6 << 20, ProofDir: t.TempDir(), LoginsPerMinute: 100, ChatMessagesPerMinute: 100,
		PublicWebURL: "https://play.example.com",
	}, chat.NewHub(), mailer))
	t.Cleanup(server.Close)
	return server.URL
}

func setAlerts(t *testing.T, client *http.Client, base, id string, enabled bool) staffBody {
	t.Helper()
	status, body := send(t, client, http.MethodPatch, base+"/api/admin/staff/"+id+"/alerts", map[string]bool{"enabled": enabled})
	if status != http.StatusOK {
		t.Fatalf("set alerts: want 200, got %d (%s)", status, body)
	}
	var member staffBody
	if err := json.Unmarshal(body, &member); err != nil {
		t.Fatalf("decode staff: %v", err)
	}
	return member
}

// optInAlertAdmins leaves two active admins with alerts on, one active admin with
// alerts off, and one suspended admin with alerts on.
func optInAlertAdmins(t *testing.T, base string) {
	t.Helper()
	db := testDB
	first, firstID := registerAdmin(t, db, base, "first-admin@example.com")
	second, secondID := registerAdmin(t, db, base, "second-admin@example.com")
	registerAdmin(t, db, base, "quiet-admin@example.com")
	_, suspendedID := registerAdmin(t, db, base, "suspended-admin@example.com")

	setAlerts(t, second, base, firstID, true)
	setAlerts(t, second, base, secondID, true)
	setAlerts(t, first, base, suspendedID, true)
	if _, err := db.Exec(`UPDATE users SET status = 'suspended' WHERE id = ($1::text)::uuid`, suspendedID); err != nil {
		t.Fatalf("suspend admin: %v", err)
	}
}

func receiveAlert(t *testing.T, mailer channelMailer) mail.Message {
	t.Helper()
	select {
	case message := <-mailer:
		return message
	case <-time.After(5 * time.Second):
		t.Fatal("no admin alert was sent")
	}
	return mail.Message{}
}

func expectNoAlert(t *testing.T, mailer channelMailer) {
	t.Helper()
	select {
	case extra := <-mailer:
		t.Fatalf("an unexpected alert was sent: %+v", extra)
	case <-time.After(300 * time.Millisecond):
	}
}

func registerPlayerWithMethod(t *testing.T, base string) (*http.Client, string, string) {
	t.Helper()
	enableTestPaymentMethod(t, testDB)
	player := clientWithCookies(t)
	status, body := register(t, player, base)
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	var account struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &account); err != nil {
		t.Fatalf("decode player: %v", err)
	}
	status, body = send(t, player, http.MethodGet, base+"/api/payment-methods", nil)
	var methods []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &methods); status != http.StatusOK || err != nil || len(methods) == 0 {
		t.Fatalf("payment methods: status=%d err=%v (%s)", status, err, body)
	}
	return player, account.ID, methods[0].ID
}

func TestStaffListsEveryAdministratorWithAlertsOffUntilAnAdministratorTurnsThemOn(t *testing.T) {
	base := newAlertServer(t, nil)
	db := testDB
	first, firstID := registerAdmin(t, db, base, "first-admin@example.com")
	second, secondID := registerAdmin(t, db, base, "second-admin@example.com")
	player, playerID, _ := registerPlayerWithMethod(t, base)

	status, body := send(t, first, http.MethodGet, base+"/api/admin/staff", nil)
	var staff []staffBody
	if err := json.Unmarshal(body, &staff); status != http.StatusOK || err != nil {
		t.Fatalf("list staff: status=%d err=%v (%s)", status, err, body)
	}
	if len(staff) != 2 || staff[0].ID != firstID || staff[1].ID != secondID {
		t.Fatalf("staff = %+v", staff)
	}
	for _, member := range staff {
		if member.AlertEmails || member.Status != "active" || member.Email == "" {
			t.Fatalf("new admin %+v should be active with alerts off", member)
		}
	}

	if status, _ := send(t, player, http.MethodGet, base+"/api/admin/staff", nil); status != http.StatusForbidden {
		t.Fatalf("player list staff: want 403, got %d", status)
	}
	if status, _ := send(t, player, http.MethodPatch, base+"/api/admin/staff/"+firstID+"/alerts", map[string]bool{"enabled": true}); status != http.StatusForbidden {
		t.Fatalf("player set alerts: want 403, got %d", status)
	}
	if status, _ := send(t, first, http.MethodPatch, base+"/api/admin/staff/"+playerID+"/alerts", map[string]bool{"enabled": true}); status != http.StatusNotFound {
		t.Fatalf("set alerts on a player: want 404, got %d", status)
	}
	if status, _ := send(t, first, http.MethodPatch, base+"/api/admin/staff/not-a-uuid/alerts", map[string]bool{"enabled": true}); status != http.StatusNotFound {
		t.Fatalf("set alerts on a bad id: want 404, got %d", status)
	}
	if status, body := send(t, first, http.MethodPatch, base+"/api/admin/staff/"+secondID+"/alerts", map[string]string{}); status != http.StatusBadRequest || decodeError(t, body).Fields["enabled"] == "" {
		t.Fatalf("missing enabled: want 400 with fields.enabled, got %d (%s)", status, body)
	}
	if status, _ := send(t, first, http.MethodPatch, base+"/api/admin/staff/"+secondID+"/alerts", map[string]any{"enabled": true, "role": "player"}); status != http.StatusBadRequest {
		t.Fatalf("unknown field: want 400, got %d", status)
	}

	if member := setAlerts(t, first, base, secondID, true); !member.AlertEmails || member.ID != secondID {
		t.Fatalf("turn on another admin's alerts: %+v", member)
	}
	setAlerts(t, first, base, secondID, true)
	if member := setAlerts(t, second, base, secondID, false); member.AlertEmails {
		t.Fatalf("turn off own alerts: %+v", member)
	}

	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE action = 'user.alert_emails_change' AND entity_id = $1`, secondID).Scan(&audits); err != nil || audits != 2 {
		t.Fatalf("alert audit rows = %d (%v), want 2: an unchanged value writes none", audits, err)
	}
}

func TestANewDepositEmailsOnlyActiveAdministratorsWithAlertsOnOnce(t *testing.T) {
	mailer := make(channelMailer, 4)
	base := newAlertServer(t, mailer)
	optInAlertAdmins(t, base)
	player, _, methodID := registerPlayerWithMethod(t, base)

	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	status, body := sendDeposit(t, player, base+"/api/deposits", methodID, "PHP", "123456", "GC-REF-1", "alert-key", "proof.png", png)
	if status != http.StatusCreated {
		t.Fatalf("create deposit: want 201, got %d (%s)", status, body)
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode deposit: %v", err)
	}

	message := receiveAlert(t, mailer)
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

	status, body = sendDeposit(t, player, base+"/api/deposits", methodID, "PHP", "123456", "GC-REF-1", "alert-key", "proof.png", png)
	if status != http.StatusOK {
		t.Fatalf("retry deposit: want 200, got %d (%s)", status, body)
	}
	expectNoAlert(t, mailer)
}

func TestANewWithdrawalEmailsOnlyActiveAdministratorsWithAlertsOnOnce(t *testing.T) {
	mailer := make(channelMailer, 4)
	base := newAlertServer(t, mailer)
	optInAlertAdmins(t, base)
	player, playerID, methodID := registerPlayerWithMethod(t, base)
	phpBalance(t, player, base)
	if _, err := wallet.Move(context.Background(), testDB, playerID, "PHP", "adjustment", 200_000, "withdrawal-alert-credit", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}

	request := map[string]any{
		"method_id": methodID, "currency": "PHP", "amount_minor": 150_000,
		"account_name": "Juan Dela Cruz", "account_number": "0917 123 4567",
	}
	status, body := sendWithdrawal(t, player, base, "withdrawal-alert-key", request)
	if status != http.StatusCreated {
		t.Fatalf("create withdrawal: want 201, got %d (%s)", status, body)
	}
	created := decodeWithdrawal(t, body)

	message := receiveAlert(t, mailer)
	if !slices.Equal(message.To, []string{"first-admin@example.com", "second-admin@example.com"}) {
		t.Fatalf("recipients = %v", message.To)
	}
	if message.IdempotencyKey != "withdrawal-request-"+created.ID || message.Subject != "New withdrawal request: PHP 1,500.00" {
		t.Fatalf("unexpected alert: key=%q subject=%q", message.IdempotencyKey, message.Subject)
	}
	for _, want := range []string{testName, testEmail, "PHP 1,500.00", "Juan Dela Cruz", "0917 123 4567", created.ID, "https://play.example.com/admin/withdrawals"} {
		if !strings.Contains(message.Text, want) || !strings.Contains(message.HTML, want) {
			t.Fatalf("alert does not mention %q:\n%s\n%s", want, message.Text, message.HTML)
		}
	}

	if status, body := sendWithdrawal(t, player, base, "withdrawal-alert-key", request); status != http.StatusOK {
		t.Fatalf("retry withdrawal: want 200, got %d (%s)", status, body)
	}
	expectNoAlert(t, mailer)
}
