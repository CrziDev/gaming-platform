package round

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

type playCall struct {
	slug string
	key  string
	body string
}

func (h *Handler) play(t *testing.T, account user.User, call playCall) (int, map[string]any) {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/api/games/"+call.slug+"/rounds", strings.NewReader(call.body))
	request.SetPathValue("slug", call.slug)
	if call.key != "" {
		request.Header.Set("Idempotency-Key", call.key)
	}
	recorder := httptest.NewRecorder()
	h.Play(recorder, request, account)
	var decoded map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode %d response %q: %v", recorder.Code, recorder.Body.String(), err)
	}
	return recorder.Code, decoded
}

func fieldError(body map[string]any, field string) string {
	fields, _ := body["fields"].(map[string]any)
	message, _ := fields[field].(string)
	return message
}

func TestPlayHandlerSettlesAndReplays(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	slug := "round-game-" + fixture.Suffix
	handler := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{slug: winningEngine(340, 170)}, 0)
	account := user.User{ID: fixture.UserID}
	call := playCall{slug: slug, key: "http-" + fixture.Suffix, body: `{"stake_minor": 200, "currency": "PHP", "params": {"rows": 8, "risk": "normal"}}`}

	code, body := handler.play(t, account, call)
	if code != http.StatusOK {
		t.Fatalf("want 200, got %d: %v", code, body)
	}
	round := body["round"].(map[string]any)
	if round["status"] != "settled" || round["stake_minor"] != float64(200) || round["win_minor"] != float64(340) || round["multiplier_hundredths"] != float64(170) || round["currency"] != "PHP" || round["game_slug"] != slug || round["rtp_basis_points"] != float64(9600) || round["settled_at"] == nil {
		t.Fatalf("round = %v", round)
	}
	if _, exposed := round["result_data"]; exposed {
		t.Fatal("result_data must not be on the wire")
	}
	result := body["result"].(map[string]any)
	if result["slot"] != float64(2) {
		t.Fatalf("result = %v", result)
	}
	wallet := body["wallet"].(map[string]any)
	if wallet["currency"] != "PHP" || wallet["balance_minor"] != float64(1_140) || len(wallet) != 2 {
		t.Fatalf("wallet = %v", wallet)
	}

	code, replay := handler.play(t, account, call)
	if code != http.StatusOK || replay["round"].(map[string]any)["id"] != round["id"] {
		t.Fatalf("replay: %d %v", code, replay)
	}
	changed := call
	changed.body = `{"stake_minor": 300, "currency": "PHP", "params": {"rows": 8, "risk": "normal"}}`
	if code, body := handler.play(t, account, changed); code != http.StatusBadRequest || fieldError(body, "idempotency_key") == "" {
		t.Fatalf("changed retry: %d %v", code, body)
	}
}

func TestPlayHandlerAnswers404ForAnUnplayableGame(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	slug := "round-game-" + fixture.Suffix
	body := `{"stake_minor": 200, "currency": "PHP", "params": {}}`
	account := user.User{ID: fixture.UserID}

	noEngine := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{}, 0)
	if code, _ := noEngine.play(t, account, playCall{slug: slug, key: "k", body: body}); code != http.StatusNotFound {
		t.Fatalf("no engine: want 404, got %d", code)
	}
	handler := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{slug: winningEngine(0, 0), "ghost": winningEngine(0, 0)}, 0)
	if code, _ := handler.play(t, account, playCall{slug: "ghost", key: "k", body: body}); code != http.StatusNotFound {
		t.Fatalf("no game row: want 404, got %d", code)
	}
	if _, err := db.Exec(`UPDATE games SET status = 'maintenance' WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	if code, _ := handler.play(t, account, playCall{slug: slug, key: "k", body: body}); code != http.StatusNotFound {
		t.Fatalf("maintenance: want 404, got %d", code)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Balance: 1_000}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayHandlerRejectsBadInput(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	slug := "round-game-" + fixture.Suffix
	handler := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{slug: winningEngine(340, 170)}, 0)
	account := user.User{ID: fixture.UserID}
	good := `{"stake_minor": 200, "currency": "PHP", "params": {"rows": 8, "risk": "normal"}}`

	cases := map[string]struct {
		call  playCall
		field string
	}{
		"missing key":   {playCall{slug: slug, body: good}, "idempotency_key"},
		"long key":      {playCall{slug: slug, key: strings.Repeat("k", 201), body: good}, "idempotency_key"},
		"unknown field": {playCall{slug: slug, key: "k1", body: `{"stake_minor": 200, "currency": "PHP", "params": {}, "user_id": "x"}`}, ""},
		"not json":      {playCall{slug: slug, key: "k2", body: `{"stake_minor":`}, ""},
		"zero stake":    {playCall{slug: slug, key: "k3", body: `{"stake_minor": 0, "currency": "PHP", "params": {}}`}, "stake_minor"},
		"float stake":   {playCall{slug: slug, key: "k4", body: `{"stake_minor": 2.5, "currency": "PHP", "params": {}}`}, ""},
		"off step":      {playCall{slug: slug, key: "k5", body: `{"stake_minor": 150, "currency": "PHP", "params": {}}`}, "stake_minor"},
		"bad currency":  {playCall{slug: slug, key: "k6", body: `{"stake_minor": 200, "currency": "PESO", "params": {}}`}, "currency"},
	}
	for name, c := range cases {
		code, body := handler.play(t, account, c.call)
		if code != http.StatusBadRequest {
			t.Fatalf("%s: want 400, got %d: %v", name, code, body)
		}
		if c.field != "" && fieldError(body, c.field) == "" {
			t.Fatalf("%s: want a %s field error, got %v", name, c.field, body)
		}
	}
	refusing := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{slug: &stubEngine{err: engine.ErrInvalidParams}}, 0)
	if code, body := refusing.play(t, account, playCall{slug: slug, key: "k7", body: good}); code != http.StatusBadRequest || fieldError(body, "params") == "" {
		t.Fatalf("engine refusal: %d %v", code, body)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Balance: 1_000}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayHandlerConflictCodes(t *testing.T) {
	db := openRoundTestDB(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	good := `{"stake_minor": 200, "currency": "PHP", "params": {}}`

	poor := createRoundFixture(t, db, 100)
	poorSlug := "round-game-" + poor.Suffix
	handler := NewHandler(db, logger, Engines{poorSlug: winningEngine(340, 170)}, 0)
	if code, body := handler.play(t, user.User{ID: poor.UserID}, playCall{slug: poorSlug, key: "k1", body: good}); code != http.StatusConflict || body["code"] != "INSUFFICIENT_BALANCE" {
		t.Fatalf("insufficient: %d %v", code, body)
	}

	fixture := createRoundFixture(t, db, 1_000)
	slug := "round-game-" + fixture.Suffix
	account := user.User{ID: fixture.UserID}
	handler = NewHandler(db, logger, Engines{slug: winningEngine(340, 170)}, 0)
	// Every game is configured with both currencies, so unsupported means the
	// game's own configuration is missing one, not a player picking freely.
	if _, err := db.Exec(`DELETE FROM game_wager_limits WHERE game_id = ($1::text)::uuid AND currency = 'USD'`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	if code, body := handler.play(t, account, playCall{slug: slug, key: "k2", body: `{"stake_minor": 200, "currency": "USD", "params": {}}`}); code != http.StatusConflict || body["code"] != "UNSUPPORTED_CURRENCY" {
		t.Fatalf("currency: %d %v", code, body)
	}
	overflowing := NewHandler(db, logger, Engines{slug: &stubEngine{err: engine.ErrPayoutOverflow}}, 0)
	if code, body := overflowing.play(t, account, playCall{slug: slug, key: "k3", body: good}); code != http.StatusConflict || body["code"] != "AMOUNT_OVERFLOW" {
		t.Fatalf("overflow: %d %v", code, body)
	}
	if _, err := db.Exec(`UPDATE wallets SET status = 'frozen' WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID); err != nil {
		t.Fatal(err)
	}
	if code, body := handler.play(t, account, playCall{slug: slug, key: "k4", body: good}); code != http.StatusConflict || body["code"] != "WALLET_FROZEN" {
		t.Fatalf("frozen: %d %v", code, body)
	}
	if _, err := db.Exec(`UPDATE wallets SET status = 'active' WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE games SET rtp_basis_points = NULL WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	if code, body := handler.play(t, account, playCall{slug: slug, key: "k5", body: good}); code != http.StatusConflict || body["code"] != "GAME_UNAVAILABLE" {
		t.Fatalf("no rtp: %d %v", code, body)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Balance: 1_000}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestPlayHandlerAnswersUnsupportedCurrencyWhenNoWalletCanBeProvisioned(t *testing.T) {
	db := openRoundTestDB(t)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	// A currency disabled after its game was created: provisioning creates no
	// wallet in it, so the play route cannot fall back to a fresh wallet.
	if _, err := db.Exec(`INSERT INTO currencies (code, name, symbol, minor_units, enabled) VALUES ('RDX', 'Round Disabled', 'R', 2, false) ON CONFLICT (code) DO UPDATE SET enabled = false`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM currencies WHERE code = 'RDX'`) })
	fixture := createRoundFixture(t, db, 1_000)
	if _, err := db.Exec(`INSERT INTO game_wager_limits (game_id, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES (($1::text)::uuid, 'RDX', 100, 1000, 100)`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	slug := "round-game-" + fixture.Suffix
	handler := NewHandler(db, logger, Engines{slug: winningEngine(340, 170)}, 0)
	code, body := handler.play(t, user.User{ID: fixture.UserID}, playCall{slug: slug, key: "k-disabled", body: `{"stake_minor": 200, "currency": "RDX", "params": {}}`})
	if code != http.StatusConflict || body["code"] != "UNSUPPORTED_CURRENCY" {
		t.Fatalf("disabled currency: want 409 UNSUPPORTED_CURRENCY, got %d %v", code, body)
	}
	if l := ledgerFor(t, fixture); l != (ledger{Balance: 1_000}) {
		t.Fatalf("ledger = %+v", l)
	}
}

func TestManifestHandler(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 0)
	slug := "round-game-" + fixture.Suffix
	handler := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)), Engines{slug: winningEngine(0, 0)}, 0)

	manifest := func(slug string) (int, string) {
		request := httptest.NewRequest(http.MethodGet, "/api/games/"+slug+"/manifest", nil)
		request.SetPathValue("slug", slug)
		recorder := httptest.NewRecorder()
		handler.Manifest(recorder, request)
		return recorder.Code, recorder.Body.String()
	}
	if code, body := manifest(slug); code != http.StatusOK || strings.TrimSpace(body) != `{"config":"test:v1","rtp_basis_points":9600}` {
		t.Fatalf("manifest: %d %s", code, body)
	}
	if _, err := db.Exec(`UPDATE games SET rtp_basis_points = 9400 WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	if code, body := manifest(slug); code != http.StatusOK || strings.TrimSpace(body) != `{"config":"test:v2","rtp_basis_points":9400}` {
		t.Fatalf("manifest after switch: %d %s", code, body)
	}
	if code, _ := manifest("nothing"); code != http.StatusNotFound {
		t.Fatalf("unknown: want 404, got %d", code)
	}
	if _, err := db.Exec(`UPDATE games SET rtp_basis_points = NULL WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
		t.Fatal(err)
	}
	code, body := manifest(slug)
	var failure httpx.ErrorResponse
	if err := json.Unmarshal([]byte(body), &failure); err != nil {
		t.Fatal(err)
	}
	if code != http.StatusConflict || failure.Code != "GAME_UNAVAILABLE" {
		t.Fatalf("no rtp: %d %s", code, body)
	}
}
