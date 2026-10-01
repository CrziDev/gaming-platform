package main

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/auth"
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
	case "plinko", "plinko-billiards":
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
	if again := read(); again["plinko"].Valid {
		t.Fatalf("a second bootstrap overwrote the operator-managed return with %v", again["plinko"])
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
	adminID, _, err := seedAdmin(ctx, tx, adminEmail, "seed-test-password", "Owner")
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

func TestBootstrapDoesNotResetAnExistingAdmin(t *testing.T) {
	db := openSeedTestDB(t)
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })

	const email = "seed-existing-owner@example.com"
	id, created, err := seedAdmin(ctx, tx, email, "first-password-value", "First Owner")
	if err != nil || !created {
		t.Fatalf("first bootstrap: id=%q created=%t err=%v", id, created, err)
	}
	again, created, err := seedAdmin(ctx, tx, email, "replacement-password", "Replacement Owner")
	if err != nil || created || again != id {
		t.Fatalf("second bootstrap: id=%q created=%t err=%v", again, created, err)
	}

	var hash, displayName, status string
	if err := tx.QueryRowContext(ctx, `SELECT password_hash, display_name, status FROM users WHERE id = ($1::text)::uuid`, id).Scan(&hash, &displayName, &status); err != nil {
		t.Fatal(err)
	}
	matchesFirst, err := auth.VerifyPassword(hash, "first-password-value")
	if err != nil {
		t.Fatal(err)
	}
	matchesReplacement, err := auth.VerifyPassword(hash, "replacement-password")
	if err != nil {
		t.Fatal(err)
	}
	if !matchesFirst || matchesReplacement || displayName != "First Owner" || status != "active" {
		t.Fatalf("existing admin changed: first=%t replacement=%t name=%q status=%q", matchesFirst, matchesReplacement, displayName, status)
	}
}

func TestDemoSeedRequiresAnExplicitSafeEnvironment(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"missing environment": {"ALLOW_DEMO_SEED": "true"},
		"production":          {"APP_ENV": "production", "ALLOW_DEMO_SEED": "true"},
		"missing permission":  {"APP_ENV": "staging"},
		"false permission":    {"APP_ENV": "development", "ALLOW_DEMO_SEED": "false"},
	} {
		t.Run(name, func(t *testing.T) {
			if err := allowDemoSeed(func(key string) string { return env[key] }); err == nil {
				t.Fatal("unsafe demo seed configuration was accepted")
			}
		})
	}
	for _, environment := range []string{"development", "staging"} {
		env := map[string]string{"APP_ENV": environment, "ALLOW_DEMO_SEED": "true"}
		if err := allowDemoSeed(func(key string) string { return env[key] }); err != nil {
			t.Fatalf("%s rejected: %v", environment, err)
		}
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
