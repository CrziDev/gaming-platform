package main

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine/plinko"
	"github.com/gaming-platform/backend/internal/testdb"
)

func openSeedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := testdb.Open()
	if err != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", err)
		}
		t.Skipf("skipping seed database test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// beginSeed runs the catalogue seed inside a transaction the test never
// commits, so the test database is left exactly as it was found.
func beginSeed(t *testing.T, db *sql.DB) (context.Context, *sql.Tx) {
	t.Helper()
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed catalogue: %v", err)
	}
	return ctx, tx
}

// offersRTP is the lookup a round would make for the seeded return; a fixture
// set to a return no engine ships would fail every round.
func offersRTP(gameSlug string, basisPoints int) bool {
	switch gameSlug {
	case "plinko":
		_, ok := plinko.ProfileByBasisPoints(basisPoints)
		return ok
	default:
		return false
	}
}

func TestSeedCatalogueGivesEachIntegratedGameAReturnItsEngineOffers(t *testing.T) {
	db := openSeedTestDB(t)
	ctx, tx := beginSeed(t, db)

	read := func() map[string]sql.NullInt64 {
		rows, err := tx.QueryContext(ctx, `SELECT slug, rtp_basis_points FROM games WHERE integration = 'integrated' AND status = 'active'`)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		out := map[string]sql.NullInt64{}
		for rows.Next() {
			var slug string
			var rtp sql.NullInt64
			if err := rows.Scan(&slug, &rtp); err != nil {
				t.Fatal(err)
			}
			out[slug] = rtp
		}
		return out
	}
	first := read()
	if len(first) == 0 {
		t.Fatal("no integrated game was seeded")
	}
	for slug, rtp := range first {
		if !rtp.Valid || !offersRTP(slug, int(rtp.Int64)) {
			t.Fatalf("%s: seeded return %v is not one its engine offers", slug, rtp)
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE games SET rtp_basis_points = NULL WHERE slug = 'plinko'`); err != nil {
		t.Fatal(err)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("second seed: %v", err)
	}
	if again := read(); again["plinko"] != first["plinko"] {
		t.Fatalf("a second seed left plinko at %v, want %v restored", again["plinko"], first["plinko"])
	}
}

func TestSeedCatalogueRemovesTheLegacyPlinkoOnlyWhenNothingReferencesIt(t *testing.T) {
	db := openSeedTestDB(t)
	ctx, tx := beginSeed(t, db)
	const insertLegacy = `
		INSERT INTO games (slug, name, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ('plinko-drop', 'Plinko Drop', 'originals', 'In-house', 'active', 'supported', 'PHP', 100, 500000, 100)
		RETURNING id::text`
	legacyCount := func() int {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM games WHERE slug = 'plinko-drop'`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	var unreferenced string
	if err := tx.QueryRowContext(ctx, insertLegacy).Scan(&unreferenced); err != nil {
		t.Fatal(err)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed with an unreferenced legacy row: %v", err)
	}
	if legacyCount() != 0 {
		t.Fatal("an unreferenced plinko-drop row survived the seed")
	}

	var referenced string
	if err := tx.QueryRowContext(ctx, insertLegacy).Scan(&referenced); err != nil {
		t.Fatal(err)
	}
	var userID, walletID string
	if err := tx.QueryRowContext(ctx, `INSERT INTO users (email, password_hash, display_name) VALUES ('seed-legacy@example.com', 'test-hash', 'Legacy') RETURNING id::text`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRowContext(ctx, `INSERT INTO wallets (user_id, currency) VALUES (($1::text)::uuid, 'PHP') RETURNING id::text`, userID).Scan(&walletID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO game_rounds (round_key, user_id, game_id, wallet_id, currency, rtp_basis_points, stake_minor)
		VALUES ('seed-legacy-round', ($1::text)::uuid, ($2::text)::uuid, ($3::text)::uuid, 'PHP', 9600, 100)`, userID, referenced, walletID); err != nil {
		t.Fatal(err)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed with a legacy row that has a round: %v", err)
	}
	if legacyCount() != 1 {
		t.Fatal("a plinko-drop row with a round was removed")
	}
}

func TestSeedPlayersFundsEachWalletOnceThroughTheLedger(t *testing.T) {
	db := openSeedTestDB(t)
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })

	const adminEmail = "seed-test-owner@example.com"
	adminID, err := seedAdmin(ctx, tx, adminEmail, "seed-test-password", "Owner")
	if err != nil {
		t.Fatal(err)
	}
	if err := fundWallets(ctx, tx, adminID, adminID, adminOpeningMinor); err != nil {
		t.Fatal(err)
	}
	if _, err := seedPlayers(ctx, tx, adminEmail, adminID, "seed-test-password"); err != nil {
		t.Fatal(err)
	}
	if _, err := seedPlayers(ctx, tx, adminEmail, adminID, "seed-test-password"); err != nil {
		t.Fatalf("second seed: %v", err)
	}

	balance := func(email, currency string) (int64, int) {
		var got int64
		var movements int
		if err := tx.QueryRowContext(ctx, `
			SELECT w.balance_minor, (SELECT count(*) FROM wallet_transactions t WHERE t.wallet_id = w.id)
			  FROM wallets w JOIN users u ON u.id = w.user_id
			 WHERE u.email = $1 AND w.currency = $2`, email, currency).Scan(&got, &movements); err != nil {
			t.Fatalf("%s %s: %v", email, currency, err)
		}
		return got, movements
	}

	for _, p := range players {
		for currency, want := range p.openingMinor {
			got, movements := balance(p.email, currency)
			if got != want || movements != 1 {
				t.Fatalf("%s %s: balance %d after %d movements, want %d after 1", p.email, currency, got, movements, want)
			}
		}
	}
	for currency, want := range adminOpeningMinor {
		if got, movements := balance(adminEmail, currency); got != want || movements != 1 {
			t.Fatalf("admin %s: balance %d after %d movements, want %d after 1", currency, got, movements, want)
		}
	}

	var unfunded int
	if err := tx.QueryRowContext(ctx, `
		SELECT count(*) FROM wallets w JOIN users u ON u.id = w.user_id
		 WHERE u.email = 'tess.ocampo@example.com'`).Scan(&unfunded); err != nil {
		t.Fatal(err)
	}
	if unfunded != 0 {
		t.Fatalf("the closed player was given %d wallets", unfunded)
	}

	var actor string
	if err := tx.QueryRowContext(ctx, `
		SELECT DISTINCT actor_user_id::text FROM wallet_transactions WHERE idempotency_key = $1`, openingBalanceKey).Scan(&actor); err != nil {
		t.Fatal(err)
	}
	if actor != adminID {
		t.Fatalf("opening balances were credited by %s, want the admin %s", actor, adminID)
	}
}

func TestSeedPaymentMethodsEnablesEachMethodOnceWithoutARealDestination(t *testing.T) {
	db := openSeedTestDB(t)
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })

	// GCash takes the update path; Maya is renamed away so the insert path runs too.
	var legacyBefore bool
	if err := tx.QueryRowContext(ctx, `UPDATE payment_methods SET name = 'Legacy Maya' WHERE name = 'Maya' RETURNING enabled`).Scan(&legacyBefore); err != nil {
		t.Fatal(err)
	}

	for run := 1; run <= 2; run++ {
		if err := seedPaymentMethods(ctx, tx); err != nil {
			t.Fatalf("seed %d: %v", run, err)
		}
		for _, want := range paymentMethods {
			var count int
			var payTo string
			var enabled bool
			if err := tx.QueryRowContext(ctx, `
				SELECT count(*), min(pay_to), bool_and(enabled)
				  FROM payment_methods WHERE name = $1`, want.name).Scan(&count, &payTo, &enabled); err != nil {
				t.Fatalf("%s: %v", want.name, err)
			}
			if count != 1 {
				t.Fatalf("seed %d: %d rows named %s, want 1", run, count, want.name)
			}
			if !enabled || payTo != want.payTo {
				t.Fatalf("seed %d: %s enabled %t pay_to %q, want enabled with %q", run, want.name, enabled, payTo, want.payTo)
			}
			if payTo == "To be supplied" || !strings.Contains(payTo, "development placeholder") {
				t.Fatalf("%s destination %q could be read as a real account", want.name, payTo)
			}
		}
	}

	var legacyAfter bool
	if err := tx.QueryRowContext(ctx, `SELECT enabled FROM payment_methods WHERE name = 'Legacy Maya'`).Scan(&legacyAfter); err != nil {
		t.Fatal(err)
	}
	if legacyAfter != legacyBefore {
		t.Fatal("the seed changed a method it does not define")
	}
}
