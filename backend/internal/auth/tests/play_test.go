package auth_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gaming-platform/backend/internal/wallet"
)

// The Plinko catalogue row at the seed's return; the engine registry in app.New
// is keyed by this slug.
func createPlinko(t *testing.T, db *sql.DB) {
	t.Helper()
	createPlinkoGame(t, db, "plinko", "Plinko", 9500)
}

// A catalogue row played by the Plinko engine, which app.New registers under more
// than one slug. The test database may carry a seeded catalogue; the test owns the
// row it plays.
func createPlinkoGame(t *testing.T, db *sql.DB, slug, name string, rtpBasisPoints int) string {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ('originals', 'Originals', 10) ON CONFLICT (slug) DO NOTHING`); err != nil {
		t.Fatalf("create category: %v", err)
	}
	for _, statement := range []string{
		`DELETE FROM game_favorites WHERE game_id IN (SELECT id FROM games WHERE slug = $1)`,
		`DELETE FROM game_rounds WHERE game_id IN (SELECT id FROM games WHERE slug = $1)`,
		`DELETE FROM games WHERE slug = $1`,
	} {
		if _, err := db.Exec(statement, slug); err != nil {
			t.Fatalf("clear %s: %v", slug, err)
		}
	}
	var gameID string
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, integration, rtp_basis_points)
		VALUES ($1, $2, 'originals', 'In-house', 'active', 'integrated', $3)
		RETURNING id::text`, slug, name, rtpBasisPoints).Scan(&gameID); err != nil {
		t.Fatalf("create %s: %v", slug, err)
	}
	if _, err := db.Exec(`INSERT INTO game_wager_limits (game_id, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		SELECT ($1::text)::uuid, currency, 100, 500000, 100 FROM (VALUES ('PHP'), ('USD')) currencies(currency)`, gameID); err != nil {
		t.Fatalf("create %s limits: %v", slug, err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM game_favorites WHERE game_id = ($1::text)::uuid`, gameID)
		_, _ = db.Exec(`DELETE FROM game_rounds WHERE game_id = ($1::text)::uuid`, gameID)
		_, _ = db.Exec(`DELETE FROM games WHERE id = ($1::text)::uuid`, gameID)
	})
	return gameID
}

func sendPlay(t *testing.T, client *http.Client, base, slug, key string, body string) (int, map[string]any) {
	t.Helper()
	req, err := http.NewRequest(http.MethodPost, base+"/api/games/"+slug+"/rounds", bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", webOrigin)
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode %d %q: %v", resp.StatusCode, raw, err)
	}
	return resp.StatusCode, decoded
}

func TestPlinkoRoundHTTPFlow(t *testing.T) {
	db := requireDB(t)
	createPlinko(t, db)
	base, client := newServer(t, db)
	body := `{"stake_minor": 300, "currency": "PHP", "params": {"rows": 12, "risk": "high"}}`

	if code, _ := sendPlay(t, client, base, "plinko", "anon", body); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: want 401, got %d", code)
	}
	if code, _ := register(t, client, base); code != http.StatusCreated {
		t.Fatalf("register: %d", code)
	}
	var me struct {
		ID string `json:"id"`
	}
	if _, raw := send(t, client, http.MethodGet, base+"/api/me", nil); json.Unmarshal(raw, &me) != nil || me.ID == "" {
		t.Fatalf("me: %s", raw)
	}

	// A fresh account has no wallet row yet; the play route provisions it.
	if code, out := sendPlay(t, client, base, "plinko", "broke", body); code != http.StatusConflict || out["code"] != "INSUFFICIENT_BALANCE" {
		t.Fatalf("empty wallet: %d %v", code, out)
	}
	if _, err := wallet.Move(context.Background(), db, me.ID, "PHP", "adjustment", 10_000, "play-test-credit", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}

	code, out := sendPlay(t, client, base, "plinko", "first", body)
	if code != http.StatusOK {
		t.Fatalf("play: %d %v", code, out)
	}
	round := out["round"].(map[string]any)
	result := out["result"].(map[string]any)
	walletOut := out["wallet"].(map[string]any)
	multiplier := round["multiplier_hundredths"].(float64)
	win := round["win_minor"].(float64)
	slot := result["slot"].(float64)
	if round["status"] != "settled" || round["game_slug"] != "plinko" || round["rtp_basis_points"] != float64(9500) || slot < 0 || slot > 12 || win != float64(int64(300*multiplier)/100) {
		t.Fatalf("round %v result %v", round, result)
	}
	if walletOut["balance_minor"] != 10_000-300+win {
		t.Fatalf("wallet %v after win %v", walletOut, win)
	}

	if code, again := sendPlay(t, client, base, "plinko", "first", body); code != http.StatusOK || again["round"].(map[string]any)["id"] != round["id"] {
		t.Fatalf("retry: %d %v", code, again)
	}
	var wagers, wins int
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE kind = 'wager'), count(*) FILTER (WHERE kind = 'win') FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, me.ID).Scan(&wagers, &wins); err != nil {
		t.Fatal(err)
	}
	if wagers != 1 || (win > 0 && wins != 1) || (win == 0 && wins != 0) {
		t.Fatalf("ledger: %d wagers, %d wins for a %v win", wagers, wins, win)
	}

	if code, out := sendPlay(t, client, base, "plinko", "bad-params", `{"stake_minor": 300, "currency": "PHP", "params": {"rows": 7, "risk": "high"}}`); code != http.StatusBadRequest || out["fields"].(map[string]any)["params"] == nil {
		t.Fatalf("bad params: %d %v", code, out)
	}
	if code, _ := sendPlay(t, client, base, "aurora-dice", "other", body); code != http.StatusNotFound {
		t.Fatalf("game without an engine: want 404, got %d", code)
	}

	_, raw := send(t, client, http.MethodGet, base+"/api/games/plinko/manifest", nil)
	var manifest struct {
		RTPBasisPoints        int                         `json:"rtp_basis_points"`
		Rows                  []int                       `json:"rows"`
		MultipliersHundredths map[string]map[string][]int `json:"multipliers_hundredths"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil || manifest.RTPBasisPoints != 9500 || len(manifest.Rows) != 9 || len(manifest.MultipliersHundredths["12"]["high"]) != 13 {
		t.Fatalf("manifest: %s (%v)", raw, err)
	}
	if manifest.MultipliersHundredths["12"]["high"][int(slot)] != int(multiplier) {
		t.Fatalf("the manifest says slot %v pays %d, the round paid %v", slot, manifest.MultipliersHundredths["12"]["high"][int(slot)], multiplier)
	}

	_, raw = send(t, client, http.MethodGet, base+"/api/rounds", nil)
	var page struct {
		Total int `json:"total"`
	}
	if err := json.Unmarshal(raw, &page); err != nil || page.Total != 1 {
		t.Fatalf("rounds: %s", raw)
	}

	_, raw = send(t, client, http.MethodGet, base+"/api/recent-games", nil)
	var recent struct {
		Rows []struct {
			Slug string `json:"slug"`
		} `json:"rows"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(raw, &recent); err != nil || recent.Total != 1 || len(recent.Rows) != 1 || recent.Rows[0].Slug != "plinko" {
		t.Fatalf("recent games: %s (%v)", raw, err)
	}
}

func TestPlinkoVariantsShareTheEngineButKeepTheirOwnRoundsAndReturn(t *testing.T) {
	db := requireDB(t)
	variants := []struct {
		slug, name string
		rtp        int
		plays      bool
		id         string
	}{
		{slug: "plinko", name: "Plinko", rtp: 9500},
		{slug: "plinko-billiards", name: "Plinko Billiards", rtp: 10500, plays: true},
		{slug: "plinko-tropical", name: "Plinko Tropical", rtp: 9000, plays: true},
	}
	for i := range variants {
		variants[i].id = createPlinkoGame(t, db, variants[i].slug, variants[i].name, variants[i].rtp)
	}
	base, client := newServer(t, db)

	if code, _ := register(t, client, base); code != http.StatusCreated {
		t.Fatalf("register: %d", code)
	}
	var me struct {
		ID string `json:"id"`
	}
	if _, raw := send(t, client, http.MethodGet, base+"/api/me", nil); json.Unmarshal(raw, &me) != nil || me.ID == "" {
		t.Fatalf("me: %s", raw)
	}
	if code, _ := send(t, client, http.MethodGet, base+"/api/wallets/PHP", nil); code != http.StatusOK {
		t.Fatalf("provision wallet: %d", code)
	}
	if _, err := wallet.Move(context.Background(), db, me.ID, "PHP", "adjustment", 10_000, "variant-test-credit", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}

	body := `{"stake_minor": 300, "currency": "PHP", "params": {"rows": 8, "risk": "normal"}}`
	for _, variant := range variants {
		if !variant.plays {
			continue
		}
		code, out := sendPlay(t, client, base, variant.slug, "variant-"+variant.slug, body)
		if code != http.StatusOK {
			t.Fatalf("play %s: %d %v", variant.slug, code, out)
		}
		round := out["round"].(map[string]any)
		if round["game_slug"] != variant.slug || round["game_id"] != variant.id || round["rtp_basis_points"] != float64(variant.rtp) {
			t.Fatalf("%s round %v", variant.slug, round)
		}
	}

	for _, variant := range variants {
		_, raw := send(t, client, http.MethodGet, base+"/api/games/"+variant.slug+"/manifest", nil)
		var manifest struct {
			RTPBasisPoints int `json:"rtp_basis_points"`
		}
		if err := json.Unmarshal(raw, &manifest); err != nil || manifest.RTPBasisPoints != variant.rtp {
			t.Fatalf("%s manifest: %s (%v)", variant.slug, raw, err)
		}

		_, raw = send(t, client, http.MethodGet, base+"/api/rounds?game_id="+variant.id, nil)
		var page struct {
			Total int `json:"total"`
		}
		want := 0
		if variant.plays {
			want = 1
		}
		if err := json.Unmarshal(raw, &page); err != nil || page.Total != want {
			t.Fatalf("rounds for %s: want %d, got %s", variant.slug, want, raw)
		}
	}
}
