package auth_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/app"
	"github.com/gaming-platform/backend/internal/chat"
	"github.com/gaming-platform/backend/internal/mail"
)

const newPassword = "a-different-development-password"

type recordingMailer struct {
	mu       sync.Mutex
	messages []mail.Message
	err      error
}

func (s *recordingMailer) Send(_ context.Context, message mail.Message) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = append(s.messages, message)
	return s.err
}

func (s *recordingMailer) sent() []mail.Message {
	s.mu.Lock()
	defer s.mu.Unlock()
	return slices.Clone(s.messages)
}

var resetLinkToken = regexp.MustCompile(`/reset\?token=(\S+)`)

func resetToken(t *testing.T, message mail.Message) string {
	t.Helper()
	match := resetLinkToken.FindStringSubmatch(message.Text)
	if match == nil {
		t.Fatalf("reset email has no link: %q", message.Text)
	}
	token, err := url.QueryUnescape(match[1])
	if err != nil {
		t.Fatalf("reset link token: %v", err)
	}
	return token
}

func newPasswordServer(t *testing.T, db *sql.DB, sender mail.Sender) (string, *http.Client) {
	t.Helper()
	server := httptest.NewServer(app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName: "gp_session", SessionTTL: time.Hour, AllowedOrigins: []string{webOrigin},
		MaxBodyBytes: 6 << 20, LoginsPerMinute: 100, ChatMessagesPerMinute: 100,
	}, chat.NewHub(), sender))
	t.Cleanup(server.Close)
	return server.URL, clientWithCookies(t)
}

func requestReset(t *testing.T, client *http.Client, base, email string) (int, []byte) {
	t.Helper()
	return send(t, client, http.MethodPost, base+"/api/password-reset", map[string]string{"email": email})
}

func confirmReset(t *testing.T, client *http.Client, base, token, password string) (int, []byte) {
	t.Helper()
	return send(t, client, http.MethodPost, base+"/api/password-reset/confirm", map[string]string{
		"token": token, "password": password,
	})
}

func TestPasswordResetRequestDoesNotRevealAccounts(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, client := newPasswordServer(t, db, sender)
	if status, body := register(t, client, base); status != http.StatusCreated {
		t.Fatalf("register: %d %s", status, body)
	}

	started := time.Now()
	knownStatus, knownBody := requestReset(t, client, base, " OWNER@example.com ")
	knownDuration := time.Since(started)
	started = time.Now()
	unknownStatus, unknownBody := requestReset(t, client, base, "missing@example.com")
	unknownDuration := time.Since(started)
	if knownStatus != http.StatusNoContent || unknownStatus != http.StatusNoContent {
		t.Fatalf("known=%d unknown=%d, want both 204", knownStatus, unknownStatus)
	}
	if !bytes.Equal(knownBody, unknownBody) {
		t.Fatalf("responses differ: known=%q unknown=%q", knownBody, unknownBody)
	}
	if knownDuration < 280*time.Millisecond || unknownDuration < 280*time.Millisecond {
		t.Fatalf("minimum window missing: known=%s unknown=%s", knownDuration, unknownDuration)
	}
	difference := knownDuration - unknownDuration
	if difference < 0 {
		difference = -difference
	}
	if difference > 150*time.Millisecond {
		t.Fatalf("response windows diverged: known=%s unknown=%s", knownDuration, unknownDuration)
	}
	messages := sender.sent()
	if len(messages) != 1 || len(messages[0].To) != 1 || messages[0].To[0] != testEmail {
		t.Fatalf("deliveries = %+v, want one for the active account", messages)
	}

	if _, err := db.Exec(`UPDATE users SET status = 'suspended' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("suspend: %v", err)
	}
	if status, body := requestReset(t, client, base, testEmail); status != http.StatusNoContent {
		t.Fatalf("inactive request: want 204, got %d (%s)", status, body)
	}
	if len(sender.sent()) != 1 {
		t.Fatal("an inactive account received a reset email")
	}
}

func TestPasswordResetRequestStoresOnlyAThirtyMinuteHash(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, client := newPasswordServer(t, db, sender)
	register(t, client, base)
	if status, body := requestReset(t, client, base, testEmail); status != http.StatusNoContent {
		t.Fatalf("request: want 204, got %d (%s)", status, body)
	}
	message := sender.sent()[0]

	var stored []byte
	var createdAt, expiresAt time.Time
	if err := db.QueryRow(`SELECT token_hash, created_at, expires_at FROM password_reset_tokens`).Scan(&stored, &createdAt, &expiresAt); err != nil {
		t.Fatalf("read token: %v", err)
	}
	want := sha256.Sum256([]byte(resetToken(t, message)))
	if !bytes.Equal(stored, want[:]) {
		t.Fatal("the stored hash does not match the delivered token")
	}
	if bytes.Contains(stored, []byte(resetToken(t, message))) {
		t.Fatal("the raw reset token was stored")
	}
	if ttl := expiresAt.Sub(createdAt); ttl < 29*time.Minute+59*time.Second || ttl > 30*time.Minute+time.Second {
		t.Fatalf("reset TTL = %s, want 30 minutes", ttl)
	}
}

func TestANewerResetRequestSupersedesTheOldLink(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, client := newPasswordServer(t, db, sender)
	register(t, client, base)
	requestReset(t, client, base, testEmail)
	requestReset(t, client, base, testEmail)
	messages := sender.sent()
	if len(messages) != 2 {
		t.Fatalf("deliveries = %d, want 2", len(messages))
	}

	oldStatus, oldBody := confirmReset(t, clientWithCookies(t), base, resetToken(t, messages[0]), newPassword)
	if oldStatus != http.StatusBadRequest {
		t.Fatalf("old link: want 400, got %d (%s)", oldStatus, oldBody)
	}
	if status, body := confirmReset(t, clientWithCookies(t), base, resetToken(t, messages[1]), newPassword); status != http.StatusOK {
		t.Fatalf("new link: want 200, got %d (%s)", status, body)
	}
}

func TestInvalidResetLinksFailIdentically(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, client := newPasswordServer(t, db, sender)
	register(t, client, base)

	requestReset(t, client, base, testEmail)
	expiredToken := resetToken(t, sender.sent()[0])
	if _, err := db.Exec(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'`); err != nil {
		t.Fatalf("expire: %v", err)
	}
	expiredStatus, expiredBody := confirmReset(t, clientWithCookies(t), base, expiredToken, newPassword)
	if expiredStatus != http.StatusBadRequest {
		t.Fatalf("expired status = %d, want 400", expiredStatus)
	}

	requestReset(t, client, base, testEmail)
	usedToken := resetToken(t, sender.sent()[1])
	if status, body := confirmReset(t, clientWithCookies(t), base, usedToken, newPassword); status != http.StatusOK {
		t.Fatalf("first confirmation: want 200, got %d (%s)", status, body)
	}
	usedStatus, usedBody := confirmReset(t, clientWithCookies(t), base, usedToken, "another-valid-password")
	unknown := base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{0x7f}, 32))
	unknownStatus, unknownBody := confirmReset(t, clientWithCookies(t), base, unknown, "another-valid-password")
	malformedStatus, malformedBody := confirmReset(t, clientWithCookies(t), base, "malformed", "another-valid-password")
	requestReset(t, client, base, testEmail)
	inactiveToken := resetToken(t, sender.sent()[2])
	if _, err := db.Exec(`UPDATE users SET status = 'suspended' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("suspend: %v", err)
	}
	inactiveStatus, inactiveBody := confirmReset(t, clientWithCookies(t), base, inactiveToken, "another-valid-password")

	for name, result := range map[string]struct {
		status int
		body   []byte
	}{
		"used": {usedStatus, usedBody}, "unknown": {unknownStatus, unknownBody}, "malformed": {malformedStatus, malformedBody},
		"inactive account": {inactiveStatus, inactiveBody},
	} {
		if result.status != http.StatusBadRequest {
			t.Errorf("%s status = %d, want 400", name, result.status)
		}
		if !bytes.Equal(result.body, expiredBody) {
			t.Errorf("%s body = %q, expired body = %q", name, result.body, expiredBody)
		}
	}
}

func TestConcurrentResetConfirmationHasOneWinner(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, client := newPasswordServer(t, db, sender)
	register(t, client, base)
	requestReset(t, client, base, testEmail)
	token := resetToken(t, sender.sent()[0])

	type result struct {
		status int
		body   []byte
		err    error
	}
	results := make(chan result, 2)
	for range 2 {
		go func() {
			body, _ := json.Marshal(map[string]string{"token": token, "password": newPassword})
			req, _ := http.NewRequest(http.MethodPost, base+"/api/password-reset/confirm", bytes.NewReader(body))
			req.Header.Set("Origin", webOrigin)
			req.Header.Set("Content-Type", "application/json")
			response, err := clientWithCookies(t).Do(req)
			if err != nil {
				results <- result{err: err}
				return
			}
			defer response.Body.Close()
			responseBody, err := io.ReadAll(response.Body)
			results <- result{status: response.StatusCode, body: responseBody, err: err}
		}()
	}
	statuses := []int{(<-results).status, (<-results).status}
	slices.Sort(statuses)
	if !slices.Equal(statuses, []int{http.StatusOK, http.StatusBadRequest}) {
		t.Fatalf("statuses = %v, want one 200 and one 400", statuses)
	}

	var activeSessions int
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL`).Scan(&activeSessions); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if activeSessions != 1 {
		t.Fatalf("active sessions = %d, want 1", activeSessions)
	}
}

func TestPasswordResetRevokesEveryOldSessionAndKeepsTheConfirmingBrowser(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	base, first := newPasswordServer(t, db, sender)
	register(t, first, base)
	second := clientWithCookies(t)
	if status, body := login(t, second, base, testPassword); status != http.StatusOK {
		t.Fatalf("second login: %d %s", status, body)
	}
	requestReset(t, first, base, testEmail)
	confirming := clientWithCookies(t)
	if status, body := confirmReset(t, confirming, base, resetToken(t, sender.sent()[0]), newPassword); status != http.StatusOK {
		t.Fatalf("confirm: want 200, got %d (%s)", status, body)
	}

	for name, oldClient := range map[string]*http.Client{"first": first, "second": second} {
		if status, body := send(t, oldClient, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
			t.Errorf("%s old session: want 401, got %d (%s)", name, status, body)
		}
	}
	if status, body := send(t, confirming, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatalf("confirming session: want 200, got %d (%s)", status, body)
	}
	var activeSessions int
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL`).Scan(&activeSessions); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if activeSessions != 1 {
		t.Fatalf("active sessions = %d, want 1", activeSessions)
	}
	if status, _ := login(t, clientWithCookies(t), base, testPassword); status != http.StatusUnauthorized {
		t.Fatalf("old password login = %d, want 401", status)
	}
	if status, body := login(t, clientWithCookies(t), base, newPassword); status != http.StatusOK {
		t.Fatalf("new password login: want 200, got %d (%s)", status, body)
	}
}

func TestPasswordChangeIsAtomicAndRotatesEverySession(t *testing.T) {
	db := requireDB(t)
	base, first := newServer(t, db)
	register(t, first, base)
	second := clientWithCookies(t)
	login(t, second, base, testPassword)
	firstCookie := sessionCookie(t, first, base).Value

	status, body := send(t, first, http.MethodPost, base+"/api/password", map[string]string{
		"current_password": "wrong-password", "password": newPassword,
	})
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte("current_password")) {
		t.Fatalf("wrong current password: want field 400, got %d (%s)", status, body)
	}
	status, body = send(t, first, http.MethodPost, base+"/api/password", map[string]string{
		"current_password": testPassword, "password": "short",
	})
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"password"`)) {
		t.Fatalf("invalid new password: want field 400, got %d (%s)", status, body)
	}
	for name, current := range map[string]*http.Client{"first": first, "second": second} {
		if status, body := send(t, current, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
			t.Fatalf("%s session changed after failure: %d (%s)", name, status, body)
		}
	}
	if status, _ := login(t, clientWithCookies(t), base, testPassword); status != http.StatusOK {
		t.Fatalf("password changed after failed request: login = %d", status)
	}

	status, body = send(t, first, http.MethodPost, base+"/api/password", map[string]string{
		"current_password": testPassword, "password": newPassword,
	})
	if status != http.StatusNoContent {
		t.Fatalf("change: want 204, got %d (%s)", status, body)
	}
	if rotated := sessionCookie(t, first, base).Value; rotated == firstCookie {
		t.Fatal("the submitting browser kept its old session token")
	}
	if status, body := send(t, first, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatalf("submitting browser: want 200, got %d (%s)", status, body)
	}
	if status, body := send(t, second, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
		t.Fatalf("other browser: want 401, got %d (%s)", status, body)
	}
	var activeSessions int
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions WHERE revoked_at IS NULL`).Scan(&activeSessions); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if activeSessions != 1 {
		t.Fatalf("active sessions = %d, want 1", activeSessions)
	}
}

func TestDisabledPasswordDeliveryReturnsUnavailableWithoutADatabase(t *testing.T) {
	server := httptest.NewServer(app.New(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		AllowedOrigins: []string{webOrigin}, MaxBodyBytes: 1 << 20, LoginsPerMinute: 10,
	}, chat.NewHub()))
	t.Cleanup(server.Close)

	status, body := requestReset(t, clientWithCookies(t), server.URL, "player@example.com")
	if status != http.StatusServiceUnavailable || !bytes.Contains(body, []byte("unavailable")) {
		t.Fatalf("disabled delivery: want 503, got %d (%s)", status, body)
	}
}

func TestPasswordEndpointsShareTheCredentialRateLimit(t *testing.T) {
	db := requireDB(t)
	sender := &recordingMailer{}
	server := httptest.NewServer(app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName: "gp_session", SessionTTL: time.Hour, AllowedOrigins: []string{webOrigin},
		MaxBodyBytes: 1 << 20, LoginsPerMinute: 2,
	}, chat.NewHub(), sender))
	t.Cleanup(server.Close)
	client := clientWithCookies(t)
	register(t, client, server.URL)
	requestReset(t, client, server.URL, testEmail)

	if status, body := confirmReset(t, client, server.URL, resetToken(t, sender.sent()[0]), newPassword); status != http.StatusTooManyRequests {
		t.Fatalf("reset confirmation: want 429, got %d (%s)", status, body)
	}
	if status, body := send(t, client, http.MethodPost, server.URL+"/api/password", map[string]string{
		"current_password": testPassword, "password": newPassword,
	}); status != http.StatusTooManyRequests {
		t.Fatalf("password change: want 429, got %d (%s)", status, body)
	}
}

func TestPasswordResetDeliveryFailureDoesNotLeakTheTokenToLogs(t *testing.T) {
	db := requireDB(t)
	var logs bytes.Buffer
	sender := &recordingMailer{err: errors.New("provider unavailable")}
	server := httptest.NewServer(app.New(db, slog.New(slog.NewTextHandler(&logs, nil)), app.Config{
		CookieName: "gp_session", SessionTTL: time.Hour, AllowedOrigins: []string{webOrigin},
		MaxBodyBytes: 1 << 20, LoginsPerMinute: 100,
	}, chat.NewHub(), sender))
	t.Cleanup(server.Close)
	client := clientWithCookies(t)
	register(t, client, server.URL)
	if status, body := requestReset(t, client, server.URL, testEmail); status != http.StatusNoContent {
		t.Fatalf("request: want 204, got %d (%s)", status, body)
	}
	token := resetToken(t, sender.sent()[0])
	if bytes.Contains(logs.Bytes(), []byte(token)) {
		t.Fatalf("logs contain the reset token: %s", logs.Bytes())
	}
}
