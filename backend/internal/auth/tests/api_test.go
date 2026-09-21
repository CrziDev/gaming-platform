package auth_test

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/app"
	"github.com/gaming-platform/backend/internal/chat"
	"github.com/gaming-platform/backend/internal/testdb"
)

const (
	testEmail    = "owner@example.com"
	testPassword = "a-development-password"
	testName     = "Owner"
	webOrigin    = "http://localhost:5173"
)

var (
	dbOnce sync.Once
	testDB *sql.DB
	dbErr  error
)

func requireDB(t *testing.T) *sql.DB {
	t.Helper()

	dbOnce.Do(func() {
		testDB, dbErr = testdb.Open()
	})

	if dbErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("a test database is required but unreachable: %v", dbErr)
		}
		t.Skipf("skipping: no test database (%v)", dbErr)
	}

	if _, err := testDB.Exec(`TRUNCATE announcements, auth_sessions, users RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return testDB
}

func newServer(t *testing.T, db *sql.DB) (string, *http.Client) {
	t.Helper()
	base, client, _ := newServerWithProofDir(t, db)
	return base, client
}

func newServerWithProofDir(t *testing.T, db *sql.DB) (string, *http.Client, string) {
	t.Helper()
	proofDir := t.TempDir()

	server := httptest.NewServer(newHandlerWithProofDir(db, proofDir))
	t.Cleanup(server.Close)

	return server.URL, clientWithCookies(t), proofDir
}

func clientWithCookies(t *testing.T) *http.Client {
	t.Helper()
	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}
	return &http.Client{Jar: jar}
}

func newHandler(db *sql.DB) http.Handler {
	return newHandlerWithProofDir(db, "")
}

func newHandlerWithProofDir(db *sql.DB, proofDir string) http.Handler {
	return newHandlerWithSessionTTL(db, proofDir, time.Hour)
}

func newHandlerWithSessionTTL(db *sql.DB, proofDir string, sessionTTL time.Duration) http.Handler {
	return app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName:            "gp_session",
		SessionTTL:            sessionTTL,
		AllowedOrigins:        []string{webOrigin},
		MaxBodyBytes:          6 << 20,
		ProofDir:              proofDir,
		LoginsPerMinute:       100,
		ChatMessagesPerMinute: 100,
	}, chat.NewHub())
}

func enableTestPaymentMethod(t *testing.T, db *sql.DB) {
	t.Helper()
	var id string
	if err := db.QueryRow(`UPDATE payment_methods SET enabled = true, updated_at = now() WHERE name = 'GCash' AND pay_to = 'To be supplied' RETURNING id::text`).Scan(&id); err != nil {
		t.Fatalf("enable test payment method: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`UPDATE payment_methods SET enabled = false, updated_at = now() WHERE id = ($1::text)::uuid`, id)
	})
}

func send(t *testing.T, client *http.Client, method, url string, body any) (int, []byte) {
	t.Helper()

	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encode body: %v", err)
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Origin", webOrigin)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	return resp.StatusCode, responseBody
}

func sendDeposit(t *testing.T, client *http.Client, url, methodID, currency, amount, reference, idempotencyKey, filename string, proof []byte) (int, []byte) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"method_id": methodID, "currency": currency, "amount_minor": amount, "reference": reference,
	} {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write %s field: %v", key, err)
		}
	}
	part, err := writer.CreateFormFile("proof", filename)
	if err != nil {
		t.Fatalf("create proof part: %v", err)
	}
	if _, err := part.Write(proof); err != nil {
		t.Fatalf("write proof: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart body: %v", err)
	}

	req, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		t.Fatalf("build deposit request: %v", err)
	}
	req.Header.Set("Origin", webOrigin)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("submit deposit: %v", err)
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read deposit response: %v", err)
	}
	return resp.StatusCode, responseBody
}

func register(t *testing.T, client *http.Client, base string) (int, []byte) {
	t.Helper()
	return send(t, client, http.MethodPost, base+"/api/register", map[string]string{
		"email": testEmail, "password": testPassword, "display_name": testName,
	})
}

func login(t *testing.T, client *http.Client, base, password string) (int, []byte) {
	t.Helper()
	return send(t, client, http.MethodPost, base+"/api/login", map[string]string{
		"email": testEmail, "password": password,
	})
}

func TestRegisterCreatesAnAccountAndSignsItIn(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := register(t, client, base)
	if status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d (%s)", status, body)
	}

	var user struct {
		ID          string `json:"id"`
		Email       string `json:"email"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
	}
	if err := json.Unmarshal(body, &user); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if user.Email != testEmail || user.DisplayName != testName {
		t.Fatalf("unexpected account: %+v", user)
	}
	if user.ID == "" {
		t.Fatal("no id was returned")
	}
	if user.Role != "player" {
		t.Fatalf("role: want player, got %q", user.Role)
	}

	if status, body := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatalf("me after register: want 200, got %d (%s)", status, body)
	}
}

func TestRegisterRollsBackTheAccountWhenSessionCreationFails(t *testing.T) {
	db := requireDB(t)
	server := httptest.NewServer(newHandlerWithSessionTTL(db, "", -time.Hour))
	t.Cleanup(server.Close)

	status, body := register(t, clientWithCookies(t), server.URL)
	if status != http.StatusInternalServerError {
		t.Fatalf("register: want 500, got %d (%s)", status, body)
	}
	var users, sessions int
	if err := db.QueryRow(`SELECT count(*) FROM users`).Scan(&users); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions`).Scan(&sessions); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if users != 0 || sessions != 0 {
		t.Fatalf("partial registration remained: users=%d sessions=%d", users, sessions)
	}
}

func TestRegisterUsesCharacterLengthsForUnicodeInput(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	status, body := send(t, client, http.MethodPost, base+"/api/register", map[string]string{
		"email": "unicode@example.com", "password": strings.Repeat("🔐", 12), "display_name": strings.Repeat("界", 80),
	})
	if status != http.StatusCreated {
		t.Fatalf("register Unicode input: want 201, got %d (%s)", status, body)
	}
}

func TestRegisterRefusesADuplicateEmail(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	if status, body := register(t, client, base); status != http.StatusCreated {
		t.Fatalf("first register: want 201, got %d (%s)", status, body)
	}

	status, body := send(t, client, http.MethodPost, base+"/api/register", map[string]string{
		"email": "  Owner@Example.COM ", "password": testPassword, "display_name": "Someone Else",
	})
	if status != http.StatusConflict {
		t.Fatalf("duplicate register: want 409, got %d (%s)", status, body)
	}
	if !bytes.Contains(body, []byte("already registered")) {
		t.Fatalf("the duplicate was not reported: %s", body)
	}

	var count int
	if err := db.QueryRow(`SELECT count(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 1 {
		t.Fatalf("want 1 account, got %d", count)
	}
}

func TestRegisterRejectsInvalidInput(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	tests := map[string]struct {
		body      map[string]any
		wantField string
	}{
		"malformed email": {map[string]any{"email": "nope", "password": testPassword, "display_name": testName}, "email"},
		"short password":  {map[string]any{"email": testEmail, "password": "short", "display_name": testName}, "password"},
		"no display name": {map[string]any{"email": testEmail, "password": testPassword, "display_name": "   "}, "display_name"},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			status, body := send(t, client, http.MethodPost, base+"/api/register", test.body)
			if status != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", status, body)
			}

			var problem struct {
				Error  string            `json:"error"`
				Fields map[string]string `json:"fields"`
			}
			if err := json.Unmarshal(body, &problem); err != nil {
				t.Fatalf("decode: %v (%s)", err, body)
			}
			if _, rejected := problem.Fields[test.wantField]; !rejected {
				t.Fatalf("want %q rejected, got %v", test.wantField, problem.Fields)
			}
		})
	}

	var count int
	if err := db.QueryRow(`SELECT count(*) FROM users`).Scan(&count); err != nil {
		t.Fatalf("count users: %v", err)
	}
	if count != 0 {
		t.Fatalf("want no accounts, got %d", count)
	}
}

func TestRegisterRejectsUnknownFields(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodPost, base+"/api/register", map[string]any{
		"email": testEmail, "password": testPassword, "display_name": testName, "role": "admin",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("want 400, got %d (%s)", status, body)
	}
}

func TestLoginSetsAnHttpOnlySessionCookie(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	body, err := json.Marshal(map[string]string{"email": testEmail, "password": testPassword})
	if err != nil {
		t.Fatalf("encode body: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, base+"/api/login", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("build login request: %v", err)
	}
	req.Header.Set("Origin", webOrigin)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("login: want 200, got %d", resp.StatusCode)
	}

	var cookie *http.Cookie
	for _, candidate := range resp.Cookies() {
		if candidate.Name == "gp_session" {
			cookie = candidate
		}
	}
	if cookie == nil {
		t.Fatal("no session cookie was set")
	}
	if !cookie.HttpOnly {
		t.Error("the session cookie is readable by script")
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite: want Lax, got %v", cookie.SameSite)
	}
	if cookie.Value == "" {
		t.Error("the session cookie is empty")
	}
	if cookie.MaxAge <= 0 {
		t.Error("the session cookie has no expiry")
	}
}

func TestLoginRejectsTheWrongPassword(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	status, body := login(t, client, base, "not-the-password")
	if status != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d (%s)", status, body)
	}

	var count int
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions`).Scan(&count); err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if count != 1 {
		t.Fatalf("want only the session registration created, got %d", count)
	}
}

func TestAWrongPasswordAndAnUnknownEmailAreIndistinguishable(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	wrongStatus, wrongBody := send(t, client, http.MethodPost, base+"/api/login", map[string]string{
		"email": testEmail, "password": "not-the-password",
	})
	unknownStatus, unknownBody := send(t, client, http.MethodPost, base+"/api/login", map[string]string{
		"email": "nobody@example.com", "password": "not-the-password",
	})

	if wrongStatus != http.StatusUnauthorized {
		t.Fatalf("wrong password: want 401, got %d", wrongStatus)
	}
	if unknownStatus != wrongStatus {
		t.Fatalf("status differs: %d vs %d", wrongStatus, unknownStatus)
	}
	if !bytes.Equal(wrongBody, unknownBody) {
		t.Fatalf("the two answers differ:\n  wrong password: %s\n  unknown email:  %s", wrongBody, unknownBody)
	}
}

func TestMeRequiresASession(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodGet, base+"/api/me", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous: want 401, got %d (%s)", status, body)
	}

	register(t, client, base)

	status, body = send(t, client, http.MethodGet, base+"/api/me", nil)
	if status != http.StatusOK {
		t.Fatalf("with a session: want 200, got %d (%s)", status, body)
	}
	if !strings.Contains(string(body), testEmail) {
		t.Fatalf("the response is not the signed-in account: %s", body)
	}
}

func TestAdminUsersRequiresASession(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodGet, base+"/api/admin/users", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous: want 401, got %d (%s)", status, body)
	}
}

func TestAdminUsersRefusesAPlayer(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	status, body := send(t, client, http.MethodGet, base+"/api/admin/users", nil)
	if status != http.StatusForbidden {
		t.Fatalf("player: want 403, got %d (%s)", status, body)
	}
}

func TestAdminUsersListsRegisteredAccounts(t *testing.T) {
	db := requireDB(t)
	base, adminClient := newServer(t, db)
	register(t, adminClient, base)

	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("promote admin: %v", err)
	}

	_, playerClient := newServer(t, db)
	status, body := send(t, playerClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "player@example.com", "password": testPassword, "display_name": "Player One",
	})
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/users", nil)
	if status != http.StatusOK {
		t.Fatalf("admin list: want 200, got %d (%s)", status, body)
	}

	var page struct {
		Rows []struct {
			Email  string `json:"email"`
			Role   string `json:"role"`
			Status string `json:"status"`
		} `json:"rows"`
		Total int `json:"total"`
		Page  int `json:"page"`
		Size  int `json:"size"`
		Pages int `json:"pages"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	accounts := page.Rows
	if len(accounts) != 2 {
		t.Fatalf("want 2 accounts, got %d (%s)", len(accounts), body)
	}
	if page.Total != 2 || page.Page != 1 || page.Size != 20 || page.Pages != 1 {
		t.Fatalf("unexpected page metadata: %+v", page)
	}

	byEmail := make(map[string]struct {
		role   string
		status string
	}, len(accounts))
	for _, account := range accounts {
		byEmail[account.Email] = struct {
			role   string
			status string
		}{account.Role, account.Status}
	}
	if got := byEmail[testEmail]; got.role != "admin" || got.status != "active" {
		t.Fatalf("unexpected admin: %+v", got)
	}
	if got := byEmail["player@example.com"]; got.role != "player" || got.status != "active" {
		t.Fatalf("unexpected player: %+v", got)
	}
	if bytes.Contains(body, []byte("password")) || bytes.Contains(body, []byte("argon2")) {
		t.Fatalf("the admin list exposed password data: %s", body)
	}
}

func TestAdminUsersSupportsPagingSearchAndStatus(t *testing.T) {
	db := requireDB(t)
	base, adminClient := newServer(t, db)
	register(t, adminClient, base)

	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("promote admin: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO users (email, password_hash, display_name, status) VALUES
		('active@example.com', 'unused', 'Active Match', 'active'),
		('suspended@example.com', 'unused', 'Suspended Match', 'suspended'),
		('closed@example.com', 'unused', 'Closed Account', 'closed')`); err != nil {
		t.Fatalf("insert users: %v", err)
	}

	status, body := send(t, adminClient, http.MethodGet,
		base+"/api/admin/users?search=match&status=suspended&page=1&size=1", nil)
	if status != http.StatusOK {
		t.Fatalf("filtered list: want 200, got %d (%s)", status, body)
	}

	var page struct {
		Rows []struct {
			Email string `json:"email"`
		} `json:"rows"`
		Total int `json:"total"`
		Page  int `json:"page"`
		Size  int `json:"size"`
		Pages int `json:"pages"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if len(page.Rows) != 1 || page.Rows[0].Email != "suspended@example.com" {
		t.Fatalf("unexpected filtered rows: %+v", page.Rows)
	}
	if page.Total != 1 || page.Page != 1 || page.Size != 1 || page.Pages != 1 {
		t.Fatalf("unexpected page metadata: %+v", page)
	}

	var suspendedID string
	if err := db.QueryRow(`SELECT id::text FROM users WHERE email = 'suspended@example.com'`).Scan(&suspendedID); err != nil {
		t.Fatalf("read suspended user id: %v", err)
	}
	status, body = send(t, adminClient, http.MethodGet,
		base+"/api/admin/users?search="+suspendedID[:8], nil)
	if status != http.StatusOK {
		t.Fatalf("id search: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &page); err != nil || page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].Email != "suspended@example.com" {
		t.Fatalf("unexpected id search: page=%+v err=%v (%s)", page, err, body)
	}

	status, body = send(t, adminClient, http.MethodGet,
		base+"/api/admin/users?role=admin&search="+testEmail, nil)
	if status != http.StatusOK {
		t.Fatalf("role-filtered list: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &page); err != nil || page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].Email != testEmail {
		t.Fatalf("unexpected role-filtered list: page=%+v err=%v (%s)", page, err, body)
	}
}

func TestAdminUsersRejectsInvalidPagingAndStatus(t *testing.T) {
	db := requireDB(t)
	base, adminClient := newServer(t, db)
	register(t, adminClient, base)

	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("promote admin: %v", err)
	}

	tests := []string{
		"?page=0",
		"?size=101",
		"?status=unknown",
		"?role=unknown",
	}
	for _, query := range tests {
		status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/users"+query, nil)
		if status != http.StatusBadRequest {
			t.Errorf("%s: want 400, got %d (%s)", query, status, body)
		}
	}
}

func TestAdminDashboardHTTPContract(t *testing.T) {
	db := requireDB(t)
	base, adminClient := newServer(t, db)
	register(t, adminClient, base)

	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE email = $1`, testEmail); err != nil {
		t.Fatalf("promote admin: %v", err)
	}

	for name, path := range map[string]string{
		"missing currency": base + "/api/admin/dashboard",
		"unknown currency": base + "/api/admin/dashboard?currency=ZZZ",
	} {
		t.Run(name, func(t *testing.T) {
			status, body := send(t, adminClient, http.MethodGet, path, nil)
			if status != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", status, body)
			}
		})
	}

	status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/dashboard?currency=php", nil)
	if status != http.StatusOK {
		t.Fatalf("dashboard: want 200, got %d (%s)", status, body)
	}
	var summary struct {
		Currency                string           `json:"currency"`
		PendingDeposits         int              `json:"pending_deposits"`
		OldestPendingAt         *string          `json:"oldest_pending_at"`
		EffectiveRTPBasisPoints int              `json:"effective_rtp_basis_points"`
		ExpectedRTPBasisPoints  int              `json:"expected_rtp_basis_points"`
		Games                   *json.RawMessage `json:"games"`
	}
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("decode dashboard: %v (%s)", err, body)
	}
	if summary.Currency != "PHP" || summary.PendingDeposits != 0 || summary.OldestPendingAt != nil || summary.EffectiveRTPBasisPoints != 0 || summary.ExpectedRTPBasisPoints != 0 {
		t.Fatalf("unexpected dashboard summary: %+v", summary)
	}
	if summary.Games == nil || string(*summary.Games) != "[]" {
		t.Fatalf("games must be an empty array, got %s", body)
	}
}

func TestAdminAccountDetailStatusWalletsAndAuditFlow(t *testing.T) {
	db := requireDB(t)
	base, playerClient := newServer(t, db)
	anonymousClient := clientWithCookies(t)
	missingID := "00000000-0000-4000-8000-000000000000"
	for _, path := range []string{
		"/api/admin/users/" + missingID,
		"/api/admin/users/" + missingID + "/wallets",
		"/api/admin/audit-logs",
	} {
		if status, body := send(t, anonymousClient, http.MethodGet, base+path, nil); status != http.StatusUnauthorized {
			t.Fatalf("anonymous GET %s: want 401, got %d (%s)", path, status, body)
		}
	}
	if status, body := send(t, anonymousClient, http.MethodPatch, base+"/api/admin/users/"+missingID+"/status", map[string]string{"status": "suspended"}); status != http.StatusUnauthorized {
		t.Fatalf("anonymous status change: want 401, got %d (%s)", status, body)
	}

	status, body := register(t, playerClient, base)
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	var player struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &player); err != nil {
		t.Fatalf("decode player: %v", err)
	}

	adminPaths := []string{
		"/api/admin/users/" + player.ID,
		"/api/admin/users/" + player.ID + "/wallets",
		"/api/admin/audit-logs",
	}
	for _, path := range adminPaths {
		if status, body := send(t, playerClient, http.MethodGet, base+path, nil); status != http.StatusForbidden {
			t.Fatalf("player GET %s: want 403, got %d (%s)", path, status, body)
		}
	}
	if status, body := send(t, playerClient, http.MethodPatch, base+"/api/admin/users/"+player.ID+"/status", map[string]string{"status": "suspended"}); status != http.StatusForbidden {
		t.Fatalf("player status change: want 403, got %d (%s)", status, body)
	}

	adminClient := clientWithCookies(t)
	status, body = send(t, adminClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "account-admin@example.com", "password": testPassword, "display_name": "Account Admin",
	})
	if status != http.StatusCreated {
		t.Fatalf("register admin: want 201, got %d (%s)", status, body)
	}
	var admin struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &admin); err != nil {
		t.Fatalf("decode admin: %v", err)
	}
	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE id = ($1::text)::uuid`, admin.ID); err != nil {
		t.Fatalf("promote admin: %v", err)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/users/"+player.ID, nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(testEmail)) || bytes.Contains(body, []byte("password")) {
		t.Fatalf("account detail: want safe 200 response, got %d (%s)", status, body)
	}
	for _, path := range []string{
		"/api/admin/users/not-a-uuid",
		"/api/admin/users/" + missingID,
	} {
		if status, body := send(t, adminClient, http.MethodGet, base+path, nil); status != http.StatusNotFound {
			t.Fatalf("GET %s: want 404, got %d (%s)", path, status, body)
		}
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/users/"+player.ID+"/wallets", nil)
	if status != http.StatusOK {
		t.Fatalf("admin wallet list: want 200, got %d (%s)", status, body)
	}
	var wallets []struct {
		Currency     string `json:"currency"`
		BalanceMinor int64  `json:"balance_minor"`
	}
	if err := json.Unmarshal(body, &wallets); err != nil {
		t.Fatalf("decode wallets: %v (%s)", err, body)
	}
	if len(wallets) != 2 || wallets[0].Currency != "PHP" || wallets[1].Currency != "USD" {
		t.Fatalf("unexpected admin wallets: %+v", wallets)
	}
	for _, path := range []string{
		"/api/admin/users/not-a-uuid/wallets",
		"/api/admin/users/" + missingID + "/wallets",
	} {
		if status, body := send(t, adminClient, http.MethodGet, base+path, nil); status != http.StatusNotFound {
			t.Fatalf("GET %s: want 404, got %d (%s)", path, status, body)
		}
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+admin.ID+"/status", map[string]string{"status": "suspended"})
	if status != http.StatusConflict || !bytes.Contains(body, []byte("SELF_STATUS_CHANGE")) {
		t.Fatalf("self status change: want coded 409, got %d (%s)", status, body)
	}
	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+strings.ToUpper(admin.ID)+"/status", map[string]string{"status": "suspended"})
	if status != http.StatusConflict || !bytes.Contains(body, []byte("SELF_STATUS_CHANGE")) {
		t.Fatalf("case-varied self status change: want coded 409, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+player.ID+"/status", map[string]string{"status": "closed"}); status != http.StatusBadRequest {
		t.Fatalf("invalid status: want 400, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+missingID+"/status", map[string]string{"status": "active"}); status != http.StatusNotFound {
		t.Fatalf("missing account status: want 404, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPatch, base+"/api/admin/users/not-a-uuid/status", map[string]string{"status": "active"}); status != http.StatusNotFound {
		t.Fatalf("invalid account status id: want 404, got %d (%s)", status, body)
	}
	if _, err := db.Exec(`UPDATE users SET status = 'closed' WHERE id = ($1::text)::uuid`, player.ID); err != nil {
		t.Fatalf("close player: %v", err)
	}
	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+player.ID+"/status", map[string]string{"status": "active"})
	if status != http.StatusConflict || !bytes.Contains(body, []byte("ACCOUNT_CLOSED")) {
		t.Fatalf("closed account status: want coded 409, got %d (%s)", status, body)
	}
	if _, err := db.Exec(`UPDATE users SET status = 'active' WHERE id = ($1::text)::uuid`, player.ID); err != nil {
		t.Fatalf("restore player fixture: %v", err)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+player.ID+"/status", map[string]string{"status": "suspended"})
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"status":"suspended"`)) {
		t.Fatalf("suspend account: want 200, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
		t.Fatalf("suspended session: want 401, got %d (%s)", status, body)
	}
	var activeSessions int
	if err := db.QueryRow(`SELECT count(*) FROM auth_sessions WHERE user_id = ($1::text)::uuid AND revoked_at IS NULL`, player.ID).Scan(&activeSessions); err != nil {
		t.Fatalf("count active sessions: %v", err)
	}
	if activeSessions != 0 {
		t.Fatalf("active sessions after suspension=%d, want 0", activeSessions)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/audit-logs?user_id=not-a-uuid", nil); status != http.StatusBadRequest {
		t.Fatalf("invalid audit actor filter: want 400, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/audit-logs?page=1&size=1&type=user.suspend&user_id="+admin.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("audit list: want 200, got %d (%s)", status, body)
	}
	var auditPage struct {
		Rows []struct {
			ActorUserID      string         `json:"actor_user_id"`
			ActorDisplayName string         `json:"actor_display_name"`
			Action           string         `json:"action"`
			EntityID         string         `json:"entity_id"`
			BeforeData       map[string]any `json:"before_data"`
			AfterData        map[string]any `json:"after_data"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &auditPage); err != nil {
		t.Fatalf("decode audit page: %v (%s)", err, body)
	}
	if auditPage.Total != 1 || len(auditPage.Rows) != 1 {
		t.Fatalf("unexpected audit page: %+v", auditPage)
	}
	entry := auditPage.Rows[0]
	if entry.ActorUserID != admin.ID || entry.ActorDisplayName != "Account Admin" || entry.Action != "user.suspend" || entry.EntityID != player.ID || entry.BeforeData["status"] != "active" || entry.AfterData["status"] != "suspended" {
		t.Fatalf("unexpected status audit: %+v", entry)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/users/"+player.ID+"/status", map[string]string{"status": "active"})
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"status":"active"`)) {
		t.Fatalf("reinstate account: want 200, got %d (%s)", status, body)
	}
	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/audit-logs?page=1&size=10&user_id="+admin.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("audit list after reinstate: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &auditPage); err != nil || auditPage.Total != 2 {
		t.Fatalf("status audit count: total=%d err=%v (%s)", auditPage.Total, err, body)
	}
}

func TestAdminWalletAdjustmentAndTransactionHTTPFlow(t *testing.T) {
	db := requireDB(t)
	base, playerClient := newServer(t, db)
	status, body := register(t, playerClient, base)
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	var player struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &player); err != nil {
		t.Fatalf("decode player: %v", err)
	}

	adjustment := map[string]any{
		"direction": "credit", "currency": "PHP", "amount_minor": 15_000, "reason": "Verified manual credit",
	}
	if status, body := send(t, playerClient, http.MethodPost, base+"/api/admin/users/"+player.ID+"/wallet-adjustments", adjustment); status != http.StatusForbidden {
		t.Fatalf("player adjustment: want 403, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/admin/transactions", nil); status != http.StatusForbidden {
		t.Fatalf("player transaction list: want 403, got %d (%s)", status, body)
	}

	adminClient := clientWithCookies(t)
	status, body = send(t, adminClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "wallet-admin@example.com", "password": testPassword, "display_name": "Wallet Admin",
	})
	if status != http.StatusCreated {
		t.Fatalf("register future admin: want 201, got %d (%s)", status, body)
	}
	var admin struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &admin); err != nil {
		t.Fatalf("decode admin: %v", err)
	}
	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE id = ($1::text)::uuid`, admin.ID); err != nil {
		t.Fatalf("promote admin: %v", err)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/users/not-a-uuid/wallet-adjustments", adjustment); status != http.StatusNotFound {
		t.Fatalf("invalid adjustment target: want 404, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/users/790ea15c-6c37-4af6-8b8d-65aab8f02f42/wallet-adjustments", adjustment); status != http.StatusNotFound {
		t.Fatalf("unknown adjustment target: want 404, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/wallets/PH", nil); status != http.StatusNotFound {
		t.Fatalf("malformed wallet currency: want 404, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodPost, base+"/api/admin/users/"+player.ID+"/wallet-adjustments", adjustment)
	if status != http.StatusCreated {
		t.Fatalf("credit wallet: want 201, got %d (%s)", status, body)
	}
	var credit struct {
		ID            string `json:"id"`
		Kind          string `json:"kind"`
		AmountMinor   int64  `json:"amount_minor"`
		BalanceBefore int64  `json:"balance_before"`
		BalanceAfter  int64  `json:"balance_after"`
	}
	if err := json.Unmarshal(body, &credit); err != nil {
		t.Fatalf("decode credit: %v", err)
	}
	if credit.ID == "" || credit.Kind != "adjustment" || credit.AmountMinor != 15_000 || credit.BalanceBefore != 0 || credit.BalanceAfter != 15_000 {
		t.Fatalf("unexpected credit: %+v", credit)
	}
	status, body = send(t, adminClient, http.MethodPost, base+"/api/admin/users/"+player.ID+"/wallet-adjustments", map[string]any{
		"direction": "debit", "currency": "PHP", "amount_minor": 3_000, "reason": "Verified manual debit",
	})
	if status != http.StatusCreated {
		t.Fatalf("debit wallet: want 201, got %d (%s)", status, body)
	}
	var debit struct {
		ID            string `json:"id"`
		AmountMinor   int64  `json:"amount_minor"`
		BalanceBefore int64  `json:"balance_before"`
		BalanceAfter  int64  `json:"balance_after"`
	}
	if err := json.Unmarshal(body, &debit); err != nil {
		t.Fatalf("decode debit: %v", err)
	}
	if debit.ID == "" || debit.AmountMinor != -3_000 || debit.BalanceBefore != 15_000 || debit.BalanceAfter != 12_000 {
		t.Fatalf("unexpected debit: %+v", debit)
	}

	status, body = send(t, adminClient, http.MethodPost, base+"/api/admin/users/"+player.ID+"/wallet-adjustments", map[string]any{
		"direction": "debit", "currency": "PHP", "amount_minor": 20_000, "reason": "Too large",
	})
	if status != http.StatusConflict {
		t.Fatalf("excessive debit: want 409, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/transactions?user_id="+player.ID+"&currency=PHP&type=adjustment&page=1&size=10", nil)
	if status != http.StatusOK {
		t.Fatalf("filtered transactions: want 200, got %d (%s)", status, body)
	}
	var page struct {
		Rows []struct {
			ID       string `json:"id"`
			UserID   string `json:"user_id"`
			WalletID string `json:"wallet_id"`
			Currency string `json:"currency"`
			Kind     string `json:"kind"`
		} `json:"rows"`
		Total int `json:"total"`
		Page  int `json:"page"`
		Size  int `json:"size"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode transaction page: %v (%s)", err, body)
	}
	if page.Total != 2 || page.Page != 1 || page.Size != 10 || len(page.Rows) != 2 {
		t.Fatalf("unexpected transaction page: %+v", page)
	}
	seen := map[string]bool{}
	for _, row := range page.Rows {
		seen[row.ID] = true
		if row.UserID != player.ID || row.WalletID == "" || row.Currency != "PHP" || row.Kind != "adjustment" {
			t.Fatalf("unexpected transaction row: %+v", row)
		}
	}
	if !seen[credit.ID] || !seen[debit.ID] {
		t.Fatalf("filtered page omitted an adjustment: seen=%v", seen)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/transactions?user_id=not-a-uuid", nil); status != http.StatusBadRequest {
		t.Fatalf("invalid transaction filter: want 400, got %d (%s)", status, body)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/wallets/PHP", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"balance_minor":12000`)) {
		t.Fatalf("player wallet after adjustments: want balance 12000, got %d (%s)", status, body)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/wallets/PHP/transactions?page=1&size=10", nil)
	if status != http.StatusOK {
		t.Fatalf("player transactions after adjustments: want 200, got %d (%s)", status, body)
	}
	var playerPage struct {
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &playerPage); err != nil || playerPage.Total != 2 {
		t.Fatalf("player transaction page: total=%d err=%v (%s)", playerPage.Total, err, body)
	}

	playerTotal := func(t *testing.T, query string) int {
		t.Helper()
		status, body := send(t, playerClient, http.MethodGet, base+"/api/transactions?"+query, nil)
		if status != http.StatusOK {
			t.Fatalf("player transactions %q: want 200, got %d (%s)", query, status, body)
		}
		var page struct {
			Total int `json:"total"`
		}
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatalf("decode player transactions %q: %v (%s)", query, err, body)
		}
		return page.Total
	}
	future := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	past := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	if got := playerTotal(t, "type=adjustment"); got != 2 {
		t.Fatalf("player type=adjustment: want 2, got %d", got)
	}
	if got := playerTotal(t, "type=deposit"); got != 0 {
		t.Fatalf("player type=deposit: want 0, got %d", got)
	}
	if got := playerTotal(t, "from="+past); got != 2 {
		t.Fatalf("player from=past: want 2, got %d", got)
	}
	if got := playerTotal(t, "from="+future); got != 0 {
		t.Fatalf("player from=future: want 0, got %d", got)
	}
	if got := playerTotal(t, "to="+past); got != 0 {
		t.Fatalf("player to=past: want 0, got %d", got)
	}
	if got := playerTotal(t, "currency=USD"); got != 0 {
		t.Fatalf("player currency=USD: want 0, got %d", got)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/transactions?type=bonus", nil); status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"type"`)) {
		t.Fatalf("player invalid type filter: want 400 with a type field error, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/transactions?from=yesterday", nil); status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"from"`)) {
		t.Fatalf("player invalid from filter: want 400 with a from field error, got %d (%s)", status, body)
	}

	status, body = send(t, playerClient, http.MethodGet, base+"/api/transactions/summary?from="+past, nil)
	if status != http.StatusOK {
		t.Fatalf("player summary: want 200, got %d (%s)", status, body)
	}
	var summary []struct {
		Currency       string `json:"currency"`
		DepositedMinor int64  `json:"deposited_minor"`
		StakedMinor    int64  `json:"staked_minor"`
		ReturnedMinor  int64  `json:"returned_minor"`
	}
	if err := json.Unmarshal(body, &summary); err != nil || len(summary) == 0 {
		t.Fatalf("decode player summary: len=%d err=%v (%s)", len(summary), err, body)
	}
	for _, row := range summary {
		if row.DepositedMinor != 0 || row.StakedMinor != 0 || row.ReturnedMinor != 0 {
			t.Fatalf("adjustments must not count as deposits, stakes, or returns: %+v", row)
		}
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/transactions/summary?currency=PHP", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`[{"currency":"PHP"`)) || bytes.Contains(body, []byte(`"USD"`)) {
		t.Fatalf("player summary for one currency: want one PHP row, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/transactions/summary?currency=XXX", nil); status != http.StatusNotFound {
		t.Fatalf("player summary for an unknown currency: want 404, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/transactions/summary?to=yesterday", nil); status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"to"`)) {
		t.Fatalf("player summary with an invalid to filter: want 400 with a to field error, got %d (%s)", status, body)
	}

	var balance int64
	var movements, audits int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, player.ID).Scan(&balance); err != nil {
		t.Fatalf("read adjusted balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, player.ID).Scan(&movements); err != nil {
		t.Fatalf("count adjustment movements: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE actor_user_id = ($1::text)::uuid AND entity_type = 'wallet'`, admin.ID).Scan(&audits); err != nil {
		t.Fatalf("count adjustment audits: %v", err)
	}
	if balance != 12_000 || movements != 2 || audits != 2 {
		t.Fatalf("balance=%d movements=%d audits=%d, want 12000/2/2", balance, movements, audits)
	}
}

func TestCurrenciesListsEnabledMetadata(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodGet, base+"/api/currencies", nil)
	if status != http.StatusOK {
		t.Fatalf("currencies: want 200, got %d (%s)", status, body)
	}

	var currencies []struct {
		Code            string `json:"code"`
		Name            string `json:"name"`
		Symbol          string `json:"symbol"`
		MinorUnits      int    `json:"minor_units"`
		DepositMinMinor int64  `json:"deposit_min_minor"`
		DepositMaxMinor int64  `json:"deposit_max_minor"`
	}
	if err := json.Unmarshal(body, &currencies); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if len(currencies) != 2 {
		t.Fatalf("want PHP and USD, got %+v", currencies)
	}
	if currencies[0].Code != "PHP" || currencies[0].Name != "Philippine Peso" ||
		currencies[0].Symbol != "₱" || currencies[0].MinorUnits != 2 ||
		currencies[0].DepositMinMinor <= 0 ||
		currencies[0].DepositMaxMinor < currencies[0].DepositMinMinor {
		t.Fatalf("unexpected PHP metadata: %+v", currencies[0])
	}
	if currencies[1].Code != "USD" || currencies[1].Name != "US Dollar" ||
		currencies[1].Symbol != "$" || currencies[1].MinorUnits != 2 ||
		currencies[1].DepositMinMinor <= 0 ||
		currencies[1].DepositMaxMinor < currencies[1].DepositMinMinor {
		t.Fatalf("unexpected USD metadata: %+v", currencies[1])
	}
}

func TestPaymentMethodsRequireASession(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodGet, base+"/api/payment-methods", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous: want 401, got %d (%s)", status, body)
	}

	register(t, client, base)
	status, body = send(t, client, http.MethodGet, base+"/api/payment-methods", nil)
	if status != http.StatusOK {
		t.Fatalf("with a session: want 200, got %d (%s)", status, body)
	}

	var methods []struct {
		ID                string `json:"id"`
		Name              string `json:"name"`
		PayTo             string `json:"pay_to"`
		ReferenceRequired bool   `json:"reference_required"`
	}
	if err := json.Unmarshal(body, &methods); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if len(methods) == 0 || methods[0].ID == "" || methods[0].Name == "" || methods[0].PayTo == "" {
		t.Fatalf("enabled payment methods are incomplete: %+v", methods)
	}
}

func TestAdminPaymentMethodManagementRequiresAdminAndPersistsChanges(t *testing.T) {
	db := requireDB(t)
	base, anonymous := newServer(t, db)

	status, body := send(t, anonymous, http.MethodGet, base+"/api/admin/payment-methods", nil)
	if status != http.StatusUnauthorized {
		t.Fatalf("anonymous list: want 401, got %d (%s)", status, body)
	}

	player := clientWithCookies(t)
	status, body = send(t, player, http.MethodPost, base+"/api/register", map[string]string{
		"email": "method-player@example.com", "password": testPassword, "display_name": "Method Player",
	})
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	status, body = send(t, player, http.MethodGet, base+"/api/admin/payment-methods", nil)
	if status != http.StatusForbidden {
		t.Fatalf("player list: want 403, got %d (%s)", status, body)
	}

	admin, _ := registerAdmin(t, db, base, "method-admin@example.com")
	status, body = send(t, admin, http.MethodGet, base+"/api/admin/payment-methods", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"name":"GCash"`)) || !bytes.Contains(body, []byte(`"enabled":false`)) {
		t.Fatalf("admin list: got %d (%s)", status, body)
	}

	name := "Bank Transfer Test"
	status, body = send(t, admin, http.MethodPost, base+"/api/admin/payment-methods", map[string]any{
		"name": name, "description": "Send a bank transfer", "pay_to": "Account 123",
		"reference_required": true, "enabled": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("create method: want 201, got %d (%s)", status, body)
	}
	var created struct {
		ID      string `json:"id"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.ID == "" || created.Enabled {
		t.Fatalf("decode created method: method=%+v err=%v (%s)", created, err, body)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_type = 'payment_method' AND entity_id = $1`, created.ID)
		_, _ = db.Exec(`DELETE FROM payment_methods WHERE id = ($1::text)::uuid`, created.ID)
	})

	status, body = send(t, admin, http.MethodPost, base+"/api/admin/payment-methods", map[string]any{
		"name": strings.ToLower(name), "description": "Duplicate", "pay_to": "Account 456",
		"reference_required": false, "enabled": false,
	})
	if status != http.StatusConflict || !bytes.Contains(body, []byte(`"name":"Already taken"`)) {
		t.Fatalf("duplicate method: want 409 field error, got %d (%s)", status, body)
	}

	status, body = send(t, admin, http.MethodPatch, base+"/api/admin/payment-methods/"+created.ID, map[string]any{
		"enabled": true, "pay_to": "Account 789",
	})
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"enabled":true`)) || !bytes.Contains(body, []byte(`"pay_to":"Account 789"`)) {
		t.Fatalf("update method: got %d (%s)", status, body)
	}

	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE entity_type = 'payment_method' AND entity_id = $1`, created.ID).Scan(&audits); err != nil || audits != 2 {
		t.Fatalf("payment method audits: count=%d err=%v", audits, err)
	}
}

func TestDepositHTTPWorkflowIsPrivateIdempotentAndReviewedOnce(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	base, playerClient, proofDir := newServerWithProofDir(t, db)
	status, body := register(t, playerClient, base)
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	var player struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &player); err != nil {
		t.Fatalf("decode player: %v", err)
	}

	status, body = send(t, playerClient, http.MethodGet, base+"/api/payment-methods", nil)
	if status != http.StatusOK {
		t.Fatalf("payment methods: want 200, got %d (%s)", status, body)
	}
	var methods []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &methods); err != nil || len(methods) == 0 {
		t.Fatalf("decode methods: methods=%+v err=%v", methods, err)
	}

	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	status, body = sendDeposit(t, playerClient, base+"/api/deposits", methods[0].ID, "PHP", "10000", strings.Repeat("界", 120), "http-deposit-key", "untrusted-name.png", png)
	if status != http.StatusCreated {
		t.Fatalf("create deposit: want 201, got %d (%s)", status, body)
	}
	var created struct {
		ID          string `json:"id"`
		AmountMinor int64  `json:"amount_minor"`
		Status      string `json:"status"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode deposit: %v (%s)", err, body)
	}
	if created.ID == "" || created.AmountMinor != 10_000 || created.Status != "pending" {
		t.Fatalf("unexpected deposit: %+v", created)
	}

	status, body = sendDeposit(t, playerClient, base+"/api/deposits", methods[0].ID, "PHP", "20000", "changed-reference", "http-deposit-key", "second-name.png", png)
	if status != http.StatusOK {
		t.Fatalf("retry deposit: want 200, got %d (%s)", status, body)
	}
	var retried struct {
		ID          string `json:"id"`
		AmountMinor int64  `json:"amount_minor"`
	}
	if err := json.Unmarshal(body, &retried); err != nil {
		t.Fatalf("decode retry: %v", err)
	}
	if retried.ID != created.ID || retried.AmountMinor != created.AmountMinor {
		t.Fatalf("retry did not return original: created=%+v retried=%+v", created, retried)
	}
	proofs, err := os.ReadDir(proofDir)
	if err != nil {
		t.Fatalf("read proof directory: %v", err)
	}
	if len(proofs) != 1 || proofs[0].Name() == "untrusted-name.png" || filepath.Ext(proofs[0].Name()) != ".png" {
		t.Fatalf("stored proofs=%v, want one server-named PNG", proofs)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/deposits?page=1&size=1", nil)
	if status != http.StatusOK {
		t.Fatalf("deposit list: want 200, got %d (%s)", status, body)
	}
	var depositPage struct {
		Rows []struct {
			ID string `json:"id"`
		} `json:"rows"`
		Total int `json:"total"`
		Page  int `json:"page"`
		Size  int `json:"size"`
	}
	if err := json.Unmarshal(body, &depositPage); err != nil {
		t.Fatalf("decode deposit page: %v (%s)", err, body)
	}
	if depositPage.Total != 1 || depositPage.Page != 1 || depositPage.Size != 1 || len(depositPage.Rows) != 1 || depositPage.Rows[0].ID != created.ID {
		t.Fatalf("unexpected deposit page: %+v", depositPage)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/deposits?status=approved", nil); status != http.StatusOK || !strings.Contains(string(body), `"total":0`) {
		t.Fatalf("approved filter on a pending request: want an empty page, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/deposits?status=pending", nil); status != http.StatusOK || !strings.Contains(string(body), created.ID) {
		t.Fatalf("pending filter: want the request, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/deposits?status=cancelled", nil); status != http.StatusBadRequest {
		t.Fatalf("unknown status filter: want 400, got %d (%s)", status, body)
	}

	if status, body := send(t, playerClient, http.MethodGet, base+"/api/deposits/"+created.ID, nil); status != http.StatusOK {
		t.Fatalf("owner read: want 200, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/deposits/not-a-uuid", nil); status != http.StatusNotFound {
		t.Fatalf("invalid deposit id: want 404, got %d (%s)", status, body)
	}

	adminClient := clientWithCookies(t)
	status, body = send(t, adminClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "deposit-admin@example.com", "password": testPassword, "display_name": "Deposit Admin",
	})
	if status != http.StatusCreated {
		t.Fatalf("register future admin: want 201, got %d (%s)", status, body)
	}
	var admin struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &admin); err != nil {
		t.Fatalf("decode admin: %v", err)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/deposits/"+created.ID, nil); status != http.StatusNotFound {
		t.Fatalf("other player read: want 404, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/deposits/"+created.ID+"/proof", nil); status != http.StatusForbidden {
		t.Fatalf("player proof read: want 403, got %d (%s)", status, body)
	}
	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE id = ($1::text)::uuid`, admin.ID); err != nil {
		t.Fatalf("promote admin: %v", err)
	}
	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/deposits?page=1&size=1", nil)
	if status != http.StatusOK {
		t.Fatalf("admin deposit queue: want 200, got %d (%s)", status, body)
	}
	var queuePage struct {
		Rows []struct {
			ID     string `json:"id"`
			UserID string `json:"user_id"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &queuePage); err != nil {
		t.Fatalf("decode queue page: %v (%s)", err, body)
	}
	if queuePage.Total != 1 || len(queuePage.Rows) != 1 || queuePage.Rows[0].ID != created.ID || queuePage.Rows[0].UserID != player.ID {
		t.Fatalf("unexpected queue page: %+v", queuePage)
	}

	request, err := http.NewRequest(http.MethodGet, base+"/api/admin/deposits/"+created.ID+"/proof", nil)
	if err != nil {
		t.Fatalf("build proof request: %v", err)
	}
	response, err := adminClient.Do(request)
	if err != nil {
		t.Fatalf("get proof: %v", err)
	}
	proofBody, readErr := io.ReadAll(response.Body)
	response.Body.Close()
	if readErr != nil {
		t.Fatalf("read proof: %v", readErr)
	}
	if response.StatusCode != http.StatusOK || response.Header.Get("Content-Type") != "image/png" || !bytes.Equal(proofBody, png) {
		t.Fatalf("proof response: status=%d type=%q body-match=%v", response.StatusCode, response.Header.Get("Content-Type"), bytes.Equal(proofBody, png))
	}

	if status, body := send(t, playerClient, http.MethodPost, base+"/api/admin/deposits/"+created.ID+"/review", map[string]any{"action": "approve"}); status != http.StatusForbidden {
		t.Fatalf("player review: want 403, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/deposits/"+created.ID+"/review", map[string]any{"action": "approve", "amount_minor": 12_000}); status != http.StatusBadRequest {
		t.Fatalf("edited approval without reason: want 400, got %d (%s)", status, body)
	}
	status, body = send(t, adminClient, http.MethodPost, base+"/api/admin/deposits/"+created.ID+"/review", map[string]any{"action": "approve", "amount_minor": 12_000, "reason": "Verified proof amount"})
	if status != http.StatusOK {
		t.Fatalf("approve deposit: want 200, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/deposits/"+created.ID+"/review", map[string]any{"action": "approve"}); status != http.StatusConflict || !bytes.Contains(body, []byte("DEPOSIT_ALREADY_REVIEWED")) {
		t.Fatalf("second approval: want coded 409, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/deposits?page=1&size=10&status=approved&user_id="+player.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("filtered approved deposits: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &queuePage); err != nil {
		t.Fatalf("decode filtered deposit page: %v (%s)", err, body)
	}
	if queuePage.Total != 1 || len(queuePage.Rows) != 1 || queuePage.Rows[0].ID != created.ID {
		t.Fatalf("unexpected filtered deposit page: %+v", queuePage)
	}
	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/deposits?page=1&size=5&status=all&search="+created.ID[:8], nil)
	if status != http.StatusOK {
		t.Fatalf("search deposits: want 200, got %d (%s)", status, body)
	}
	if err := json.Unmarshal(body, &queuePage); err != nil || queuePage.Total != 1 || len(queuePage.Rows) != 1 || queuePage.Rows[0].ID != created.ID {
		t.Fatalf("unexpected deposit search: page=%+v err=%v (%s)", queuePage, err, body)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/deposits?status=unknown", nil); status != http.StatusBadRequest {
		t.Fatalf("invalid deposit status filter: want 400, got %d (%s)", status, body)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/deposits?user_id=not-a-uuid", nil); status != http.StatusBadRequest {
		t.Fatalf("invalid deposit user filter: want 400, got %d (%s)", status, body)
	}

	var balance int64
	var movements, audits int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, player.ID).Scan(&balance); err != nil {
		t.Fatalf("read approved balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE reference_id = ($1::text)::uuid AND kind = 'deposit'`, created.ID).Scan(&movements); err != nil {
		t.Fatalf("count deposit movements: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE entity_type = 'deposit_request' AND entity_id = $1`, created.ID).Scan(&audits); err != nil {
		t.Fatalf("count deposit audits: %v", err)
	}
	if balance != 12_000 || movements != 1 || audits != 1 {
		t.Fatalf("balance=%d movements=%d audits=%d, want 12000/1/1", balance, movements, audits)
	}

	if status, body := send(t, adminClient, http.MethodGet, base+"/api/notifications", nil); status != http.StatusOK || !bytes.Contains(body, []byte(`"total":0`)) {
		t.Fatalf("the reviewer's own bell must stay empty: %d (%s)", status, body)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/notifications", nil)
	if status != http.StatusOK {
		t.Fatalf("player notifications: want 200, got %d (%s)", status, body)
	}
	var bell struct {
		Rows []struct {
			Kind        string  `json:"kind"`
			AmountMinor *int64  `json:"amount_minor"`
			Currency    *string `json:"currency"`
			Detail      *string `json:"detail"`
			ReferenceID string  `json:"reference_id"`
			Read        bool    `json:"read"`
			CreatedAt   string  `json:"created_at"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(body, &bell); err != nil || bell.Total != 1 || len(bell.Rows) != 1 {
		t.Fatalf("decode notifications: err=%v total=%d (%s)", err, bell.Total, body)
	}
	got := bell.Rows[0]
	if got.Kind != "deposit_approved" || got.AmountMinor == nil || *got.AmountMinor != 12_000 || got.Currency == nil || *got.Currency != "PHP" || got.Detail != nil || got.ReferenceID != created.ID || got.Read {
		t.Fatalf("unexpected approval notification: %+v", got)
	}
	if _, err := time.Parse(time.RFC3339, got.CreatedAt); err != nil {
		t.Fatalf("created_at is not RFC 3339: %q", got.CreatedAt)
	}
	if status, body := send(t, playerClient, http.MethodPost, base+"/api/notifications/read", nil); status != http.StatusNoContent {
		t.Fatalf("mark read: want 204, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/notifications", nil); status != http.StatusOK || !bytes.Contains(body, []byte(`"read":true`)) {
		t.Fatalf("after marking read: %d (%s)", status, body)
	}
}

func TestDepositHTTPRejectsNonImageProofWithoutPersistingIt(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	base, client, proofDir := newServerWithProofDir(t, db)
	if status, body := register(t, client, base); status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d (%s)", status, body)
	}
	status, body := send(t, client, http.MethodGet, base+"/api/payment-methods", nil)
	if status != http.StatusOK {
		t.Fatalf("payment methods: want 200, got %d (%s)", status, body)
	}
	var methods []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &methods); err != nil || len(methods) == 0 {
		t.Fatalf("decode methods: methods=%+v err=%v", methods, err)
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	status, body = sendDeposit(t, client, base+"/api/deposits", methods[0].ID, "PHP", "10000", "reference", "", "proof.png", png)
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"idempotency_key"`)) {
		t.Fatalf("missing idempotency key: want field error, got %d (%s)", status, body)
	}

	status, body = sendDeposit(t, client, base+"/api/deposits", methods[0].ID, "PHP", "10000", "reference", "bad-proof-key", "pretend.png", []byte("this is not an image"))
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"proof"`)) {
		t.Fatalf("invalid proof: want proof field error, got %d (%s)", status, body)
	}
	status, body = sendDeposit(t, client, base+"/api/deposits", "not-a-uuid", "PHP", "10000", "reference", "bad-method-key", "proof.png", png)
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"method_id"`)) {
		t.Fatalf("malformed method ID: want method field error, got %d (%s)", status, body)
	}
	entries, err := os.ReadDir(proofDir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("read proof directory: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("invalid proof left files behind: %v", entries)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM deposit_requests`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("deposit requests=%d err=%v, want zero", count, err)
	}
}

func TestDepositHTTPRejectionPreservesReasonWithoutMovingMoney(t *testing.T) {
	db := requireDB(t)
	enableTestPaymentMethod(t, db)
	base, playerClient := newServer(t, db)
	status, body := register(t, playerClient, base)
	if status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	var player struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &player); err != nil {
		t.Fatalf("decode player: %v", err)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/payment-methods", nil)
	if status != http.StatusOK {
		t.Fatalf("payment methods: want 200, got %d (%s)", status, body)
	}
	var methods []struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &methods); err != nil || len(methods) == 0 {
		t.Fatalf("decode methods: methods=%+v err=%v", methods, err)
	}
	png := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 32)...)
	status, body = sendDeposit(t, playerClient, base+"/api/deposits", methods[0].ID, "PHP", "10000", "rejected-reference", "reject-http-key", "proof.png", png)
	if status != http.StatusCreated {
		t.Fatalf("create deposit: want 201, got %d (%s)", status, body)
	}
	var request struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &request); err != nil {
		t.Fatalf("decode request: %v", err)
	}

	adminClient := clientWithCookies(t)
	status, body = send(t, adminClient, http.MethodPost, base+"/api/register", map[string]string{
		"email": "reject-admin@example.com", "password": testPassword, "display_name": "Reject Admin",
	})
	if status != http.StatusCreated {
		t.Fatalf("register future admin: want 201, got %d (%s)", status, body)
	}
	var admin struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &admin); err != nil {
		t.Fatalf("decode admin: %v", err)
	}
	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE id = ($1::text)::uuid`, admin.ID); err != nil {
		t.Fatalf("promote admin: %v", err)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/deposits/"+request.ID+"/review", map[string]any{"action": "reject", "reason": "Reference not found"}); status != http.StatusOK {
		t.Fatalf("reject deposit: want 200, got %d (%s)", status, body)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/deposits/"+request.ID, nil)
	if status != http.StatusOK {
		t.Fatalf("read rejected deposit: want 200, got %d (%s)", status, body)
	}
	var rejected struct {
		Status string  `json:"status"`
		Reason *string `json:"reason"`
	}
	if err := json.Unmarshal(body, &rejected); err != nil {
		t.Fatalf("decode rejected request: %v", err)
	}
	if rejected.Status != "rejected" || rejected.Reason == nil || *rejected.Reason != "Reference not found" {
		t.Fatalf("unexpected rejected request: %+v", rejected)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/notifications", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"kind":"deposit_rejected"`)) || !bytes.Contains(body, []byte(`"detail":"Reference not found"`)) || !bytes.Contains(body, []byte(`"reference_id":"`+request.ID+`"`)) {
		t.Fatalf("rejection notification: %d (%s)", status, body)
	}

	var balance int64
	var movements, audits int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, player.ID).Scan(&balance); err != nil {
		t.Fatalf("read wallet: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, player.ID).Scan(&movements); err != nil {
		t.Fatalf("count movements: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE actor_user_id = ($1::text)::uuid AND entity_id = $2`, admin.ID, request.ID).Scan(&audits); err != nil {
		t.Fatalf("count audits: %v", err)
	}
	if balance != 0 || movements != 0 || audits != 1 {
		t.Fatalf("balance=%d movements=%d audits=%d, want 0/0/1", balance, movements, audits)
	}
}

func TestCurrenciesExcludesDisabledRows(t *testing.T) {
	db := requireDB(t)
	if _, err := db.Exec(`UPDATE currencies SET enabled = false WHERE code = 'USD'`); err != nil {
		t.Fatalf("disable USD: %v", err)
	}
	t.Cleanup(func() {
		if _, err := db.Exec(`UPDATE currencies SET enabled = true WHERE code = 'USD'`); err != nil {
			t.Errorf("restore USD: %v", err)
		}
	})

	base, client := newServer(t, db)
	status, body := send(t, client, http.MethodGet, base+"/api/currencies", nil)
	if status != http.StatusOK {
		t.Fatalf("currencies: want 200, got %d (%s)", status, body)
	}

	var currencies []struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &currencies); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if len(currencies) != 1 || currencies[0].Code != "PHP" {
		t.Fatalf("disabled USD was returned: %+v", currencies)
	}
}

func TestMeRejectsAForgedCookie(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	req, err := http.NewRequest(http.MethodGet, base+"/api/me", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: "gp_session", Value: strings.Repeat("A", 43)})

	resp, err := (&http.Client{}).Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", resp.StatusCode)
	}
}

func TestLogoutRevokesTheSession(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	status, body := send(t, client, http.MethodPost, base+"/api/logout", nil)
	if status != http.StatusNoContent {
		t.Fatalf("logout: want 204, got %d (%s)", status, body)
	}

	if status, _ := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
		t.Fatalf("after logout: want 401, got %d", status)
	}

	var revoked sql.NullTime
	if err := db.QueryRow(`SELECT revoked_at FROM auth_sessions`).Scan(&revoked); err != nil {
		t.Fatalf("read session: %v", err)
	}
	if !revoked.Valid {
		t.Fatal("the session row was not revoked")
	}
}

func TestLogoutIsAcceptedWithoutASession(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	if status, body := send(t, client, http.MethodPost, base+"/api/logout", nil); status != http.StatusNoContent {
		t.Fatalf("anonymous logout: want 204, got %d (%s)", status, body)
	}
}

func TestAnExpiredSessionIsRefused(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	if status, _ := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatal("the session did not work before it was expired")
	}

	_, err := db.Exec(`UPDATE auth_sessions
		SET issued_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'`)
	if err != nil {
		t.Fatalf("expire session: %v", err)
	}

	if status, body := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
		t.Fatalf("expired session: want 401, got %d (%s)", status, body)
	}
}

func TestSuspendingAnAccountEndsItsLiveSessions(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	if _, err := db.Exec(`UPDATE users SET status = 'suspended'`); err != nil {
		t.Fatalf("suspend: %v", err)
	}

	if status, body := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusUnauthorized {
		t.Fatalf("suspended account: want 401, got %d (%s)", status, body)
	}
}

func TestTheSessionTokenIsStoredOnlyAsAHash(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	token := sessionCookie(t, client, base).Value

	var stored []byte
	if err := db.QueryRow(`SELECT token_hash FROM auth_sessions`).Scan(&stored); err != nil {
		t.Fatalf("read session: %v", err)
	}

	if len(stored) != 32 {
		t.Fatalf("token_hash: want 32 bytes, got %d", len(stored))
	}
	if string(stored) == token {
		t.Fatal("the raw token was stored; a leaked table would be a leaked session")
	}
	want := sha256.Sum256([]byte(token))
	if !bytes.Equal(stored, want[:]) {
		t.Fatal("the stored value is not the SHA-256 of the issued token")
	}
}

func TestNoResponseLeaksTheTokenThePasswordOrItsHash(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	_, registerBody := register(t, client, base)
	token := sessionCookie(t, client, base).Value
	_, meBody := send(t, client, http.MethodGet, base+"/api/me", nil)
	_, loginBody := login(t, client, base, testPassword)

	for _, body := range [][]byte{registerBody, meBody, loginBody} {
		if bytes.Contains(body, []byte(testPassword)) {
			t.Fatalf("the password was echoed back: %s", body)
		}
		if bytes.Contains(body, []byte("argon2")) {
			t.Fatalf("a password hash reached a client: %s", body)
		}
		if bytes.Contains(body, []byte(token)) {
			t.Fatalf("the session token appeared in a body; it belongs in the cookie alone: %s", body)
		}
	}
}

func TestAStateChangeFromAnotherOriginIsRefused(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	req, err := http.NewRequest(http.MethodPost, base+"/api/logout", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Origin", "http://evil.test")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin logout: want 403, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("a refused origin was echoed back: %q", got)
	}

	if status, _ := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatal("the refused request ended the session anyway")
	}
}

func TestAStateChangeWithoutAnOriginIsRefused(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	req, err := http.NewRequest(http.MethodPost, base+"/api/logout", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("logout without Origin: want 403, got %d", resp.StatusCode)
	}
	if status, _ := send(t, client, http.MethodGet, base+"/api/me", nil); status != http.StatusOK {
		t.Fatal("the refused request ended the session anyway")
	}

	read, err := http.NewRequest(http.MethodGet, base+"/api/me", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	resp, err = client.Do(read)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("read without Origin: want 200, got %d", resp.StatusCode)
	}
}

func TestTheWebAppOriginIsAllowedWithCredentials(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)
	register(t, client, base)

	req, err := http.NewRequest(http.MethodPost, base+"/api/logout", nil)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Origin", "http://localhost:5173")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("want 204, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("allow-origin: want the exact origin, got %q", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow-credentials: want true, got %q", got)
	}
}

func TestUnknownPathsReturnJSON(t *testing.T) {
	base, client := newServer(t, nil)

	status, body := send(t, client, http.MethodGet, base+"/nope", nil)
	if status != http.StatusNotFound {
		t.Fatalf("want 404, got %d", status)
	}
	if !bytes.Contains(body, []byte(`"error"`)) {
		t.Fatalf("want a JSON error body, got %s", body)
	}
}

func sessionCookie(t *testing.T, client *http.Client, base string) *http.Cookie {
	t.Helper()

	parsed, err := http.NewRequest(http.MethodGet, base, nil)
	if err != nil {
		t.Fatalf("parse base url: %v", err)
	}
	for _, cookie := range client.Jar.Cookies(parsed.URL) {
		if cookie.Name == "gp_session" {
			return cookie
		}
	}
	t.Fatal("no session cookie was set")
	return nil
}

type catalogueGame struct {
	ID           string   `json:"id"`
	Slug         string   `json:"slug"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	CategorySlug string   `json:"category_slug"`
	CategoryName string   `json:"category_name"`
	Provider     string   `json:"provider"`
	Status       string   `json:"status"`
	Currency     string   `json:"currency"`
	MinWager     int64    `json:"min_wager_minor"`
	MaxWager     int64    `json:"max_wager_minor"`
	WagerStep    int64    `json:"wager_step_minor"`
	ThumbnailURL *string  `json:"thumbnail_url"`
	Flags        []string `json:"flags"`
	CreatedAt    string   `json:"created_at"`
}

type cataloguePage struct {
	Rows  []catalogueGame `json:"rows"`
	Total int             `json:"total"`
	Page  int             `json:"page"`
	Size  int             `json:"size"`
	Pages int             `json:"pages"`
}

func seedCatalogueFixture(t *testing.T, db *sql.DB) (categoryA, categoryB, suffix string) {
	t.Helper()
	suffix = strconv.FormatInt(time.Now().UnixNano(), 36)
	categoryA = "test-cat-a-" + suffix
	categoryB = "test-cat-b-" + suffix

	for _, category := range []struct {
		slug, name string
		sortOrder  int
	}{
		{categoryA, "Test Category A " + suffix, 9001},
		{categoryB, "Test Category B " + suffix, 9002},
	} {
		if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ($1, $2, $3)`, category.slug, category.name, category.sortOrder); err != nil {
			t.Fatalf("insert category %s: %v", category.slug, err)
		}
	}

	insertGame := `INSERT INTO games (slug, name, description, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor, thumbnail_path, created_at)
	               VALUES ($1, $2, $3, $4, $5, $6, 'supported', 'PHP', 100, 500000, 100, $7, $8)`
	for _, item := range []struct {
		slug, name, category, status string
		thumbnail                    *string
		createdAt                    time.Time
	}{
		{"test-a-zebra-" + suffix, "Zebra Test " + suffix, categoryA, "active", ptr("https://example.test/zebra.png"), time.Now()},
		{"test-a-alpha-" + suffix, "Alpha Test " + suffix, categoryA, "active", nil, time.Now().Add(-60 * 24 * time.Hour)},
		{"test-a-draft-" + suffix, "Draft Test " + suffix, categoryA, "draft", nil, time.Now()},
		{"test-a-maint-" + suffix, "Maintenance Test " + suffix, categoryA, "maintenance", nil, time.Now()},
		{"test-a-retired-" + suffix, "Retired Test " + suffix, categoryA, "retired", nil, time.Now()},
		{"test-b-draft-" + suffix, "Hidden Test " + suffix, categoryB, "draft", nil, time.Now()},
	} {
		if _, err := db.Exec(insertGame, item.slug, item.name, "Description of "+item.name, item.category, "Test Studio "+suffix, item.status, item.thumbnail, item.createdAt); err != nil {
			t.Fatalf("insert game %s: %v", item.slug, err)
		}
	}

	t.Cleanup(func() {
		if _, err := db.Exec(`DELETE FROM games WHERE category_slug IN ($1, $2)`, categoryA, categoryB); err != nil {
			t.Errorf("delete catalogue fixture games: %v", err)
		}
		if _, err := db.Exec(`DELETE FROM game_categories WHERE slug IN ($1, $2)`, categoryA, categoryB); err != nil {
			t.Errorf("delete catalogue fixture categories: %v", err)
		}
	})
	return categoryA, categoryB, suffix
}

func ptr(value string) *string { return &value }

func fetchCatalogue(t *testing.T, client *http.Client, url string) cataloguePage {
	t.Helper()
	status, body := send(t, client, http.MethodGet, url, nil)
	if status != http.StatusOK {
		t.Fatalf("GET %s: want 200, got %d (%s)", url, status, body)
	}
	var page cataloguePage
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode %s: %v (%s)", url, err, body)
	}
	return page
}

func TestCatalogueServesOnlyActiveGamesWithFiltersAndCategories(t *testing.T) {
	db := requireDB(t)
	categoryA, categoryB, suffix := seedCatalogueFixture(t, db)
	base, client := newServer(t, db)

	page := fetchCatalogue(t, client, base+"/api/games?category="+categoryA+"&size=100")
	if page.Total != 2 || len(page.Rows) != 2 || page.Pages != 1 {
		t.Fatalf("active games in category: want 2, got total=%d rows=%d pages=%d", page.Total, len(page.Rows), page.Pages)
	}
	if page.Rows[0].Name != "Alpha Test "+suffix || page.Rows[1].Name != "Zebra Test "+suffix {
		t.Fatalf("default sort should be by name: %q, %q", page.Rows[0].Name, page.Rows[1].Name)
	}
	for _, row := range page.Rows {
		if row.Status != "active" || row.CategoryName != "Test Category A "+suffix || row.Currency != "PHP" || row.MinWager != 100 || row.MaxWager != 500_000 || row.WagerStep != 100 {
			t.Fatalf("unexpected catalogue row: %+v", row)
		}
		if row.ID == "" || row.CreatedAt == "" || row.Description == "" {
			t.Fatalf("catalogue row is missing identity fields: %+v", row)
		}
	}
	alpha, zebra := page.Rows[0], page.Rows[1]
	if len(alpha.Flags) != 0 || len(zebra.Flags) != 1 || zebra.Flags[0] != "new" {
		t.Fatalf("flags: alpha=%v zebra=%v, want alpha none and zebra new", alpha.Flags, zebra.Flags)
	}
	if alpha.ThumbnailURL != nil || zebra.ThumbnailURL == nil || *zebra.ThumbnailURL != "https://example.test/zebra.png" {
		t.Fatalf("thumbnail: alpha=%v zebra=%v", alpha.ThumbnailURL, zebra.ThumbnailURL)
	}

	page = fetchCatalogue(t, client, base+"/api/games?category="+categoryA+"&sort=newest")
	if len(page.Rows) != 2 || page.Rows[0].Slug != zebra.Slug {
		t.Fatalf("sort=newest should list the newest game first: %+v", page.Rows)
	}

	page = fetchCatalogue(t, client, base+"/api/games?category="+categoryA+"&flag=new")
	if page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].Slug != zebra.Slug {
		t.Fatalf("flag=new: want only the recent game, got %+v", page.Rows)
	}

	page = fetchCatalogue(t, client, base+"/api/games?category="+categoryA+"&size=1&page=2")
	if page.Total != 2 || page.Pages != 2 || page.Page != 2 || page.Size != 1 || len(page.Rows) != 1 || page.Rows[0].Slug != zebra.Slug {
		t.Fatalf("second page of one: got total=%d pages=%d page=%d rows=%+v", page.Total, page.Pages, page.Page, page.Rows)
	}

	page = fetchCatalogue(t, client, base+"/api/games?search=ZEBRA+test+"+suffix)
	if page.Total != 1 || page.Rows[0].Slug != zebra.Slug {
		t.Fatalf("search by name: want the zebra game, got %+v", page.Rows)
	}
	page = fetchCatalogue(t, client, base+"/api/games?search=test+studio+"+suffix)
	if page.Total != 2 {
		t.Fatalf("search by provider: want 2 active games, got %d", page.Total)
	}
	page = fetchCatalogue(t, client, base+"/api/games?search=draft+test+"+suffix)
	if page.Total != 0 {
		t.Fatalf("search must not surface a draft game, got %d", page.Total)
	}

	page = fetchCatalogue(t, client, base+"/api/games?category="+categoryB)
	if page.Total != 0 || page.Rows == nil || len(page.Rows) != 0 || page.Pages != 1 {
		t.Fatalf("category without active games: want an empty page, got %+v", page)
	}
	page = fetchCatalogue(t, client, base+"/api/games?category=no-such-category-"+suffix)
	if page.Total != 0 || len(page.Rows) != 0 {
		t.Fatalf("unknown category: want an empty page, got %+v", page)
	}

	status, body := send(t, client, http.MethodGet, base+"/api/games/"+zebra.Slug, nil)
	if status != http.StatusOK {
		t.Fatalf("get active game: want 200, got %d (%s)", status, body)
	}
	var single catalogueGame
	if err := json.Unmarshal(body, &single); err != nil {
		t.Fatalf("decode game: %v (%s)", err, body)
	}
	if single.ID != zebra.ID || single.CategorySlug != categoryA || single.CategoryName != "Test Category A "+suffix || len(single.Flags) != 1 {
		t.Fatalf("unexpected game body: %+v", single)
	}
	for _, slug := range []string{"test-a-draft-" + suffix, "test-a-maint-" + suffix, "test-a-retired-" + suffix, "test-b-draft-" + suffix, "no-such-game-" + suffix} {
		if status, body := send(t, client, http.MethodGet, base+"/api/games/"+slug, nil); status != http.StatusNotFound || !bytes.Contains(body, []byte(`"error"`)) {
			t.Fatalf("get %s: want 404 with an error body, got %d (%s)", slug, status, body)
		}
	}

	status, body = send(t, client, http.MethodGet, base+"/api/categories", nil)
	if status != http.StatusOK {
		t.Fatalf("categories: want 200, got %d (%s)", status, body)
	}
	var categories []struct {
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		GameCount int    `json:"game_count"`
		Available bool   `json:"available"`
	}
	if err := json.Unmarshal(body, &categories); err != nil {
		t.Fatalf("decode categories: %v (%s)", err, body)
	}
	indexA, indexB := -1, -1
	for index, category := range categories {
		switch category.Slug {
		case categoryA:
			indexA = index
			if category.GameCount != 2 || !category.Available || category.Name != "Test Category A "+suffix {
				t.Fatalf("category A: want 2 active games and available, got %+v", category)
			}
		case categoryB:
			indexB = index
			if category.GameCount != 0 || category.Available {
				t.Fatalf("category B: want no active games and unavailable, got %+v", category)
			}
		}
	}
	if indexA == -1 || indexB == -1 || indexA > indexB {
		t.Fatalf("categories must both be listed in sort order: a=%d b=%d (%s)", indexA, indexB, body)
	}
}

// registerAdmin signs a fresh account in on its own client and promotes it, so
// a test can act as an operator beside the default player registration.
func registerAdmin(t *testing.T, db *sql.DB, base, email string) (*http.Client, string) {
	t.Helper()
	client := clientWithCookies(t)
	status, body := send(t, client, http.MethodPost, base+"/api/register", map[string]string{
		"email": email, "password": testPassword, "display_name": "Operator",
	})
	if status != http.StatusCreated {
		t.Fatalf("register admin %s: want 201, got %d (%s)", email, status, body)
	}
	var account struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &account); err != nil {
		t.Fatalf("decode admin: %v", err)
	}
	if _, err := db.Exec(`UPDATE users SET role = 'admin' WHERE id = ($1::text)::uuid`, account.ID); err != nil {
		t.Fatalf("promote admin: %v", err)
	}
	return client, account.ID
}

type adminGameBody struct {
	catalogueGame
	Integration    string `json:"integration"`
	RTPBasisPoints *int   `json:"rtp_basis_points"`
	RTPOptions     []int  `json:"rtp_options"`
	Rounds30d      int    `json:"rounds_30d"`
	UpdatedAt      string `json:"updated_at"`
}

func TestAdminGameAdministrationCreatesEditsAndAudits(t *testing.T) {
	db := requireDB(t)
	categoryA, _, suffix := seedCatalogueFixture(t, db)
	base, playerClient := newServer(t, db)
	if status, body := register(t, playerClient, base); status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	adminClient, adminID := registerAdmin(t, db, base, "games-admin-"+suffix+"@example.com")

	newGame := map[string]any{
		"slug": "test-created-" + suffix, "name": "Created Test " + suffix, "description": "Made by the admin API",
		"category_slug": categoryA, "provider": "Test Studio " + suffix, "currency": "PHP",
		"min_wager_minor": 100, "max_wager_minor": 10_000, "wager_step_minor": 100,
	}
	if status, body := send(t, clientWithCookies(t), http.MethodPost, base+"/api/admin/games", newGame); status != http.StatusUnauthorized {
		t.Fatalf("anonymous create: want 401, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodPost, base+"/api/admin/games", newGame); status != http.StatusForbidden {
		t.Fatalf("player create: want 403, got %d (%s)", status, body)
	}
	if status, body := send(t, playerClient, http.MethodGet, base+"/api/admin/games", nil); status != http.StatusForbidden {
		t.Fatalf("player list: want 403, got %d (%s)", status, body)
	}

	rejects := map[string]struct {
		change map[string]any
		field  string
	}{
		"bad slug":            {map[string]any{"slug": "Bad Slug"}, "slug"},
		"missing name":        {map[string]any{"name": " "}, "name"},
		"unknown category":    {map[string]any{"category_slug": "no-such-category-" + suffix}, "category_slug"},
		"disabled currency":   {map[string]any{"currency": "EUR"}, "currency"},
		"fractional units":    {map[string]any{"min_wager_minor": 150, "wager_step_minor": 50}, "wager_step_minor"},
		"max below min":       {map[string]any{"max_wager_minor": 50}, "max_wager_minor"},
		"max off the step":    {map[string]any{"max_wager_minor": 10_050, "wager_step_minor": 100}, "max_wager_minor"},
		"zero step":           {map[string]any{"wager_step_minor": 0}, "wager_step_minor"},
		"unknown status":      {map[string]any{"status": "live"}, "status"},
		"unknown body field":  {map[string]any{"integration": "integrated"}, ""},
		"fractional min only": {map[string]any{"min_wager_minor": 120, "max_wager_minor": 10_020}, "wager_step_minor"},
	}
	for name, tc := range rejects {
		t.Run("create rejects "+name, func(t *testing.T) {
			body := map[string]any{}
			for key, value := range newGame {
				body[key] = value
			}
			for key, value := range tc.change {
				body[key] = value
			}
			status, response := send(t, adminClient, http.MethodPost, base+"/api/admin/games", body)
			if status != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", status, response)
			}
			if tc.field != "" && !bytes.Contains(response, []byte(`"`+tc.field+`"`)) {
				t.Fatalf("field %s missing from %s", tc.field, response)
			}
		})
	}

	status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/games", newGame)
	if status != http.StatusCreated {
		t.Fatalf("create game: want 201, got %d (%s)", status, body)
	}
	var created adminGameBody
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode created: %v (%s)", err, body)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_type = 'game' AND entity_id = $1`, created.ID)
	})
	if created.ID == "" || created.Status != "draft" || created.Integration != "unreviewed" || created.CategoryName != "Test Category A "+suffix || created.RTPBasisPoints != nil || created.RTPOptions == nil || len(created.RTPOptions) != 0 || created.Rounds30d != 0 {
		t.Fatalf("unexpected created game: %+v", created)
	}
	if status, body := send(t, adminClient, http.MethodPost, base+"/api/admin/games", newGame); status != http.StatusConflict || !bytes.Contains(body, []byte(`"slug"`)) {
		t.Fatalf("duplicate slug: want 409 naming slug, got %d (%s)", status, body)
	}

	if status, body := send(t, playerClient, http.MethodGet, base+"/api/games/"+created.Slug, nil); status != http.StatusNotFound {
		t.Fatalf("draft game must be hidden from the catalogue: want 404, got %d (%s)", status, body)
	}

	page := fetchAdminGames(t, adminClient, base+"/api/admin/games?category="+categoryA+"&size=100")
	if page.Total != 6 {
		t.Fatalf("admin list in category: want every status (5 fixtures plus the created game), got %d", page.Total)
	}
	page = fetchAdminGames(t, adminClient, base+"/api/admin/games?category="+categoryA+"&status=draft")
	if page.Total != 2 {
		t.Fatalf("admin list status=draft: want 2, got %d", page.Total)
	}
	page = fetchAdminGames(t, adminClient, base+"/api/admin/games?search="+created.Slug)
	if page.Total != 1 || page.Rows[0].ID != created.ID {
		t.Fatalf("admin search by slug: want the created game, got %+v", page.Rows)
	}
	if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/games?status=live", nil); status != http.StatusBadRequest {
		t.Fatalf("admin list bad status: want 400, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodGet, base+"/api/admin/games/"+created.ID, nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(created.Slug)) {
		t.Fatalf("admin get: want 200 with the game, got %d (%s)", status, body)
	}
	for _, id := range []string{"not-a-uuid", "00000000-0000-4000-8000-000000000000"} {
		if status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/games/"+id, nil); status != http.StatusNotFound {
			t.Fatalf("admin get %s: want 404, got %d (%s)", id, status, body)
		}
		if status, body := send(t, adminClient, http.MethodPatch, base+"/api/admin/games/"+id, map[string]any{"name": "x"}); status != http.StatusNotFound {
			t.Fatalf("admin patch %s: want 404, got %d (%s)", id, status, body)
		}
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/games/"+created.ID, map[string]any{"max_wager_minor": 10_050})
	if status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"max_wager_minor"`)) {
		t.Fatalf("patch off-step max: want 400, got %d (%s)", status, body)
	}
	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/games/"+created.ID, map[string]any{"slug": "renamed"})
	if status != http.StatusBadRequest {
		t.Fatalf("patch slug must be refused as an unknown field: want 400, got %d (%s)", status, body)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/games/"+created.ID, map[string]any{"name": "Renamed Test " + suffix, "max_wager_minor": 20_000})
	if status != http.StatusOK {
		t.Fatalf("patch metadata: want 200, got %d (%s)", status, body)
	}
	var edited adminGameBody
	if err := json.Unmarshal(body, &edited); err != nil {
		t.Fatalf("decode edited: %v (%s)", err, body)
	}
	if edited.Name != "Renamed Test "+suffix || edited.MaxWager != 20_000 || edited.Status != "draft" || edited.MinWager != 100 {
		t.Fatalf("unexpected edited game: %+v", edited)
	}

	status, body = send(t, adminClient, http.MethodPatch, base+"/api/admin/games/"+created.ID, map[string]any{"status": "active"})
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"status":"active"`)) {
		t.Fatalf("activate game: want 200 active, got %d (%s)", status, body)
	}
	status, body = send(t, playerClient, http.MethodGet, base+"/api/games/"+created.Slug, nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"name":"Renamed Test `+suffix+`"`)) {
		t.Fatalf("activated game must reach the catalogue: got %d (%s)", status, body)
	}

	var actions []string
	rows, err := db.Query(`SELECT action FROM audit_logs WHERE entity_type = 'game' AND entity_id = $1 AND actor_user_id = ($2::text)::uuid ORDER BY created_at ASC`, created.ID, adminID)
	if err != nil {
		t.Fatalf("query audit: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			t.Fatalf("scan audit: %v", err)
		}
		actions = append(actions, action)
	}
	if strings.Join(actions, ",") != "game.create,game.update,game.status_change" {
		t.Fatalf("audit actions: want create, update, status_change; got %v", actions)
	}
}

func fetchAdminGames(t *testing.T, client *http.Client, url string) struct {
	Rows  []adminGameBody `json:"rows"`
	Total int             `json:"total"`
} {
	t.Helper()
	status, body := send(t, client, http.MethodGet, url, nil)
	if status != http.StatusOK {
		t.Fatalf("GET %s: want 200, got %d (%s)", url, status, body)
	}
	var page struct {
		Rows  []adminGameBody `json:"rows"`
		Total int             `json:"total"`
	}
	if err := json.Unmarshal(body, &page); err != nil {
		t.Fatalf("decode %s: %v (%s)", url, err, body)
	}
	return page
}

func TestAdminGameRTPIsSetFromTheEngineOptionsAndAudited(t *testing.T) {
	db := requireDB(t)
	_, _, suffix := seedCatalogueFixture(t, db)
	createPlinko(t, db)
	base, playerClient := newServer(t, db)
	if status, body := register(t, playerClient, base); status != http.StatusCreated {
		t.Fatalf("register player: want 201, got %d (%s)", status, body)
	}
	adminClient, adminID := registerAdmin(t, db, base, "rtp-admin-"+suffix+"@example.com")

	var plinkoID, fixtureID string
	if err := db.QueryRow(`SELECT id::text FROM games WHERE slug = 'plinko'`).Scan(&plinkoID); err != nil {
		t.Fatalf("find plinko: %v", err)
	}
	if err := db.QueryRow(`SELECT id::text FROM games WHERE slug = $1`, "test-a-zebra-"+suffix).Scan(&fixtureID); err != nil {
		t.Fatalf("find fixture game: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_type = 'game' AND entity_id IN ($1, $2)`, plinkoID, fixtureID)
	})
	rtpPath := func(id string) string { return base + "/api/admin/games/" + id + "/rtp" }

	if status, body := send(t, playerClient, http.MethodPut, rtpPath(plinkoID), map[string]any{"rtp_basis_points": 9500}); status != http.StatusForbidden {
		t.Fatalf("player: want 403, got %d (%s)", status, body)
	}
	status, body := send(t, adminClient, http.MethodGet, base+"/api/admin/games/"+plinkoID, nil)
	var plinko adminGameBody
	if err := json.Unmarshal(body, &plinko); status != http.StatusOK || err != nil {
		t.Fatalf("get plinko: %d %v (%s)", status, err, body)
	}
	if plinko.RTPBasisPoints == nil || *plinko.RTPBasisPoints != 9500 || !slices.Equal(plinko.RTPOptions, []int{9000, 9500, 10500, 11000}) {
		t.Fatalf("plinko rtp %v options %v", plinko.RTPBasisPoints, plinko.RTPOptions)
	}

	configurationPath := base + "/api/admin/games/" + plinkoID + "/rtp-configuration?rtp_basis_points=9500&rows=8&risk=normal"
	if status, body := send(t, playerClient, http.MethodGet, configurationPath, nil); status != http.StatusForbidden {
		t.Fatalf("player configuration: want 403, got %d (%s)", status, body)
	}
	status, body = send(t, adminClient, http.MethodGet, configurationPath, nil)
	var configuration struct {
		ConfigurationRef string `json:"configuration_ref"`
		RTPBasisPoints   int    `json:"rtp_basis_points"`
		SelectedBoard    struct {
			Rows                      int    `json:"rows"`
			Risk                      string `json:"risk"`
			TheoreticalRTPBasisPoints int    `json:"theoretical_rtp_basis_points"`
			Slots                     []struct {
				Slot                     int `json:"slot"`
				MultiplierHundredths     int `json:"multiplier_hundredths"`
				ChanceThousandthsPercent int `json:"chance_thousandths_percent"`
			} `json:"slots"`
		} `json:"selected_board"`
	}
	if err := json.Unmarshal(body, &configuration); status != http.StatusOK || err != nil {
		t.Fatalf("get configuration: %d %v (%s)", status, err, body)
	}
	chanceTotal := 0
	for slot, outcome := range configuration.SelectedBoard.Slots {
		chanceTotal += outcome.ChanceThousandthsPercent
		if outcome.Slot != slot || outcome.MultiplierHundredths <= 0 {
			t.Fatalf("bad slot %d: %+v", slot, outcome)
		}
	}
	if configuration.ConfigurationRef != "plinko/9500" || configuration.RTPBasisPoints != 9500 ||
		configuration.SelectedBoard.Rows != 8 || configuration.SelectedBoard.Risk != "normal" ||
		configuration.SelectedBoard.TheoreticalRTPBasisPoints != 9500 || len(configuration.SelectedBoard.Slots) != 9 || chanceTotal != 100000 {
		t.Fatalf("unexpected configuration: %+v, chance total %d", configuration, chanceTotal)
	}

	for name, c := range map[string]struct {
		id    string
		body  any
		field string
	}{
		"not an option":         {plinkoID, map[string]any{"rtp_basis_points": 9700}, "rtp_basis_points"},
		"game without engine":   {fixtureID, map[string]any{"rtp_basis_points": 9500}, "rtp_basis_points"},
		"missing value":         {plinkoID, map[string]any{}, "rtp_basis_points"},
		"unknown field refused": {plinkoID, map[string]any{"rtp_basis_points": 9500, "effective_until": "2030-01-01T00:00:00Z"}, ""},
	} {
		status, body := send(t, adminClient, http.MethodPut, rtpPath(c.id), c.body)
		if status != http.StatusBadRequest {
			t.Fatalf("%s: want 400, got %d (%s)", name, status, body)
		}
		var failure struct {
			Fields map[string]string `json:"fields"`
		}
		if c.field != "" && (json.Unmarshal(body, &failure) != nil || failure.Fields[c.field] == "") {
			t.Fatalf("%s: want fields.%s, got %s", name, c.field, body)
		}
	}
	if status, body := send(t, adminClient, http.MethodPut, rtpPath("00000000-0000-0000-0000-000000000000"), map[string]any{"rtp_basis_points": 9500}); status != http.StatusNotFound {
		t.Fatalf("unknown game: want 404, got %d (%s)", status, body)
	}

	set := func(basisPoints int) adminGameBody {
		t.Helper()
		status, body := send(t, adminClient, http.MethodPut, rtpPath(plinkoID), map[string]any{"rtp_basis_points": basisPoints})
		var updated adminGameBody
		if err := json.Unmarshal(body, &updated); status != http.StatusOK || err != nil || updated.RTPBasisPoints == nil || *updated.RTPBasisPoints != basisPoints {
			t.Fatalf("set %d: %d %v (%s)", basisPoints, status, err, body)
		}
		return updated
	}
	set(9000)
	set(9000)
	set(11000)

	_, body = send(t, adminClient, http.MethodGet, base+"/api/games/plinko/manifest", nil)
	var manifest struct {
		RTPBasisPoints int `json:"rtp_basis_points"`
	}
	if err := json.Unmarshal(body, &manifest); err != nil || manifest.RTPBasisPoints != 11000 {
		t.Fatalf("manifest after the switch: %s", body)
	}

	var actions []string
	rows, err := db.Query(`SELECT action || ':' || COALESCE(before_data->>'rtp_basis_points', '-') || '>' || (after_data->>'rtp_basis_points') FROM audit_logs WHERE entity_type = 'game' AND entity_id = $1 AND actor_user_id = ($2::text)::uuid ORDER BY created_at ASC`, plinkoID, adminID)
	if err != nil {
		t.Fatalf("query audit: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var action string
		if err := rows.Scan(&action); err != nil {
			t.Fatalf("scan audit: %v", err)
		}
		actions = append(actions, action)
	}
	if strings.Join(actions, ",") != "game.rtp_change:9500>9000,game.rtp_change:9000>11000" {
		t.Fatalf("audit actions: got %v", actions)
	}
}
