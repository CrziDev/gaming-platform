package auth_test

import (
	"bytes"
	"context"
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
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/app"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	testEmail    = "owner@example.com"
	testPassword = "a-development-password"
	testName     = "Owner"
)

var (
	dbOnce sync.Once
	testDB *sql.DB
	dbErr  error
)

func requireDB(t *testing.T) *sql.DB {
	t.Helper()

	dbOnce.Do(func() {
		url := os.Getenv("TEST_DATABASE_URL")
		if url == "" {
			url = os.Getenv("DATABASE_URL")
		}
		if url == "" {
			dbErr = errNoDatabaseURL{}
			return
		}
		if testDB, dbErr = sql.Open("pgx", url); dbErr != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		dbErr = testDB.PingContext(ctx)
	})

	if dbErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("a test database is required but unreachable: %v", dbErr)
		}
		t.Skipf("skipping: no test database (%v)", dbErr)
	}

	if _, err := testDB.Exec(`TRUNCATE auth_sessions, users RESTART IDENTITY CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return testDB
}

type errNoDatabaseURL struct{}

func (errNoDatabaseURL) Error() string { return "neither TEST_DATABASE_URL nor DATABASE_URL is set" }

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
	return app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName:      "gp_session",
		SessionTTL:      time.Hour,
		AllowedOrigins:  []string{"http://localhost:5173"},
		MaxBodyBytes:    6 << 20,
		ProofDir:        proofDir,
		LoginsPerMinute: 100,
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
	resp, err := http.Post(base+"/api/login", "application/json", bytes.NewReader(body))
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
		Currency                string  `json:"currency"`
		PendingDeposits         int     `json:"pending_deposits"`
		OldestPendingAt         *string `json:"oldest_pending_at"`
		EffectiveRTPBasisPoints int     `json:"effective_rtp_basis_points"`
	}
	if err := json.Unmarshal(body, &summary); err != nil {
		t.Fatalf("decode dashboard: %v (%s)", err, body)
	}
	if summary.Currency != "PHP" || summary.PendingDeposits != 0 || summary.OldestPendingAt != nil || summary.EffectiveRTPBasisPoints != 0 {
		t.Fatalf("unexpected dashboard summary: %+v", summary)
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

func TestDepositHTTPWorkflowIsPrivateIdempotentAndReviewedOnce(t *testing.T) {
	db := requireDB(t)
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
	status, body = sendDeposit(t, playerClient, base+"/api/deposits", methods[0].ID, "PHP", "10000", "payment-reference", "http-deposit-key", "untrusted-name.png", png)
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
}

func TestDepositHTTPRejectsNonImageProofWithoutPersistingIt(t *testing.T) {
	db := requireDB(t)
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
