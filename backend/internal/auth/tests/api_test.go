package auth_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
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

	server := httptest.NewServer(newHandler(db))
	t.Cleanup(server.Close)

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}
	return server.URL, &http.Client{Jar: jar}
}

func newHandler(db *sql.DB) http.Handler {
	return app.New(db, slog.New(slog.NewTextHandler(io.Discard, nil)), app.Config{
		CookieName:      "gp_session",
		SessionTTL:      time.Hour,
		AllowedOrigins:  []string{"http://localhost:5173"},
		MaxBodyBytes:    1 << 20,
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

func TestCurrenciesListsEnabledMetadata(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	status, body := send(t, client, http.MethodGet, base+"/api/currencies", nil)
	if status != http.StatusOK {
		t.Fatalf("currencies: want 200, got %d (%s)", status, body)
	}

	var currencies []struct {
		Code       string `json:"code"`
		Name       string `json:"name"`
		Symbol     string `json:"symbol"`
		MinorUnits int    `json:"minor_units"`
	}
	if err := json.Unmarshal(body, &currencies); err != nil {
		t.Fatalf("decode: %v (%s)", err, body)
	}
	if len(currencies) != 2 {
		t.Fatalf("want PHP and USD, got %+v", currencies)
	}
	if currencies[0].Code != "PHP" || currencies[0].Name != "Philippine Peso" ||
		currencies[0].Symbol != "₱" || currencies[0].MinorUnits != 2 {
		t.Fatalf("unexpected PHP metadata: %+v", currencies[0])
	}
	if currencies[1].Code != "USD" || currencies[1].Name != "US Dollar" ||
		currencies[1].Symbol != "$" || currencies[1].MinorUnits != 2 {
		t.Fatalf("unexpected USD metadata: %+v", currencies[1])
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
