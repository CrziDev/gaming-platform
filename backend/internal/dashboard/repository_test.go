package dashboard

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/testdb"
)

var (
	dashboardDBOnce sync.Once
	dashboardDB     *sql.DB
	dashboardDBErr  error
)

func dashboardTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dashboardDBOnce.Do(func() {
		dashboardDB, dashboardDBErr = testdb.Open()
	})
	if dashboardDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", dashboardDBErr)
		}
		t.Skipf("skipping dashboard database test: %v", dashboardDBErr)
	}
	return dashboardDB
}

func TestGetReturnsCurrencyScopedSummary(t *testing.T) {
	db := dashboardTestDB(t)
	removeDashboardFixtures(t, db)
	t.Cleanup(func() { removeDashboardFixtures(t, db) })

	if _, err := db.Exec(`INSERT INTO currencies (code, name, symbol, minor_units) VALUES ('DSH', 'Dashboard Test', 'D', 2)`); err != nil {
		t.Fatalf("create currency: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name) VALUES ('dashboard-test', 'Dashboard Test')`); err != nil {
		t.Fatalf("create category: %v", err)
	}

	firstUserID := insertDashboardUser(t, db, "dashboard-first@example.com")
	secondUserID := insertDashboardUser(t, db, "dashboard-second@example.com")
	firstWalletID := insertDashboardWallet(t, db, firstUserID)
	secondWalletID := insertDashboardWallet(t, db, secondUserID)

	var methodID string
	if err := db.QueryRow(`INSERT INTO payment_methods (name, description, pay_to) VALUES ('Dashboard Method', 'Test only', 'Test') RETURNING id::text`).Scan(&methodID); err != nil {
		t.Fatalf("create payment method: %v", err)
	}
	var approvedTransactionID string
	if err := db.QueryRow(`
		INSERT INTO wallet_transactions (wallet_id, user_id, currency, kind, amount_minor, balance_before, balance_after, created_at)
		VALUES (($1::text)::uuid, ($2::text)::uuid, 'DSH', 'deposit', 500, 0, 500, now())
		RETURNING id::text`, firstWalletID, firstUserID).Scan(&approvedTransactionID); err != nil {
		t.Fatalf("create approved transaction: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO deposit_requests (user_id, wallet_id, currency, method_id, amount_minor, reference, status, reviewed_by, reviewed_at, transaction_id, created_at)
		VALUES
			(($1::text)::uuid, ($2::text)::uuid, 'DSH', ($3::text)::uuid, 1000, 'pending-one', 'pending', NULL, NULL, NULL, now() - interval '1 hour'),
			(($1::text)::uuid, ($2::text)::uuid, 'DSH', ($3::text)::uuid, 2000, 'pending-two', 'pending', NULL, NULL, NULL, now() - interval '3 hours'),
			(($1::text)::uuid, ($2::text)::uuid, 'DSH', ($3::text)::uuid, 500, 'approved-today', 'approved', ($1::text)::uuid, now(), ($4::text)::uuid, now())`,
		firstUserID, firstWalletID, methodID, approvedTransactionID); err != nil {
		t.Fatalf("create deposits: %v", err)
	}

	insertDashboardMovement(t, db, firstWalletID, firstUserID, "wager", -100, 1000, 900, "now()")
	insertDashboardMovement(t, db, firstWalletID, firstUserID, "win", 80, 900, 980, "now()")
	insertDashboardMovement(t, db, secondWalletID, secondUserID, "wager", -300, 1000, 700, "now()")
	insertDashboardMovement(t, db, secondWalletID, secondUserID, "win", 150, 700, 850, "now()")
	insertDashboardMovement(t, db, firstWalletID, firstUserID, "wager", -900, 1000, 100, "now() - interval '2 days'")

	var gameID string
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ('dashboard-game', 'Dashboard Game', 'dashboard-test', 'Test', 'active', 'DSH', 100, 10000, 100)
		RETURNING id::text`).Scan(&gameID); err != nil {
		t.Fatalf("create game: %v", err)
	}
	var profileID string
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, observed_basis_points, verified_at)
		VALUES (($1::text)::uuid, 'Default', 1, 9400, 'active', 9400, now())
		RETURNING id::text`, gameID).Scan(&profileID); err != nil {
		t.Fatalf("create RTP profile: %v", err)
	}
	insertDashboardRound(t, db, "dashboard-round-one", firstUserID, gameID, firstWalletID, profileID, "now()")
	insertDashboardRound(t, db, "dashboard-round-two", secondUserID, gameID, secondWalletID, profileID, "now()")
	insertDashboardRound(t, db, "dashboard-round-old", firstUserID, gameID, firstWalletID, profileID, "now() - interval '2 days'")

	summary, err := Get(context.Background(), db, "DSH")
	if err != nil {
		t.Fatalf("get summary: %v", err)
	}
	if summary.PendingDeposits != 2 || summary.PendingHeldMinor != 3000 {
		t.Fatalf("pending count=%d held=%d, want 2/3000", summary.PendingDeposits, summary.PendingHeldMinor)
	}
	if summary.ApprovedTodayCount != 1 || summary.ApprovedTodayMinor != 500 {
		t.Fatalf("approved count=%d amount=%d, want 1/500", summary.ApprovedTodayCount, summary.ApprovedTodayMinor)
	}
	if summary.StakedTodayMinor != 400 || summary.ReturnedTodayMinor != 230 || summary.PlayersToday != 2 {
		t.Fatalf("stake=%d return=%d players=%d, want 400/230/2", summary.StakedTodayMinor, summary.ReturnedTodayMinor, summary.PlayersToday)
	}
	if summary.RoundsToday != 2 || summary.TargetRTPBasisPoints != 9400 || summary.EffectiveRTPBasisPts != 5750 {
		t.Fatalf("rounds=%d target=%d effective=%d, want 2/9400/5750", summary.RoundsToday, summary.TargetRTPBasisPoints, summary.EffectiveRTPBasisPts)
	}
	if summary.OldestPendingAt == nil {
		t.Fatal("oldest pending timestamp is missing")
	}
	oldestAge := time.Since(*summary.OldestPendingAt)
	if oldestAge < 2*time.Hour || oldestAge > 4*time.Hour {
		t.Fatalf("oldest pending age=%s, want about 3 hours", oldestAge)
	}
}

func TestGetRejectsUnknownAndDisabledCurrencies(t *testing.T) {
	db := dashboardTestDB(t)
	removeDashboardFixtures(t, db)
	t.Cleanup(func() { removeDashboardFixtures(t, db) })
	if _, err := db.Exec(`INSERT INTO currencies (code, name, symbol, minor_units, enabled) VALUES ('DSX', 'Disabled Test', 'D', 2, false)`); err != nil {
		t.Fatalf("create disabled currency: %v", err)
	}

	for _, currency := range []string{"DNE", "DSX"} {
		if _, err := Get(context.Background(), db, currency); !errors.Is(err, ErrCurrencyUnavailable) {
			t.Fatalf("%s: want unavailable currency, got %v", currency, err)
		}
	}
}

func insertDashboardUser(t *testing.T, db *sql.DB, email string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Dashboard Test') RETURNING id::text`, email).Scan(&id); err != nil {
		t.Fatalf("create user: %v", err)
	}
	return id
}

func insertDashboardWallet(t *testing.T, db *sql.DB, userID string) string {
	t.Helper()
	var id string
	if err := db.QueryRow(`INSERT INTO wallets (user_id, currency, balance_minor) VALUES (($1::text)::uuid, 'DSH', 1000) RETURNING id::text`, userID).Scan(&id); err != nil {
		t.Fatalf("create wallet: %v", err)
	}
	return id
}

func insertDashboardMovement(t *testing.T, db *sql.DB, walletID, userID, kind string, amount, before, after int64, createdAt string) {
	t.Helper()
	query := `INSERT INTO wallet_transactions (wallet_id, user_id, currency, kind, amount_minor, balance_before, balance_after, created_at)
		VALUES (($1::text)::uuid, ($2::text)::uuid, 'DSH', $3, $4, $5, $6, ` + createdAt + `)`
	if _, err := db.Exec(query, walletID, userID, kind, amount, before, after); err != nil {
		t.Fatalf("create %s movement: %v", kind, err)
	}
}

func insertDashboardRound(t *testing.T, db *sql.DB, key, userID, gameID, walletID, profileID, createdAt string) {
	t.Helper()
	query := `INSERT INTO game_rounds (round_key, user_id, game_id, wallet_id, currency, rtp_profile_id, status, stake_minor, created_at)
		VALUES ($1, ($2::text)::uuid, ($3::text)::uuid, ($4::text)::uuid, 'DSH', ($5::text)::uuid, 'open', 100, ` + createdAt + `)`
	if _, err := db.Exec(query, key, userID, gameID, walletID, profileID); err != nil {
		t.Fatalf("create round: %v", err)
	}
}

func removeDashboardFixtures(t *testing.T, db *sql.DB) {
	t.Helper()
	statements := []string{
		`DELETE FROM deposit_requests WHERE currency = 'DSH'`,
		`DELETE FROM game_rounds WHERE currency = 'DSH'`,
		`DELETE FROM rtp_profiles WHERE game_id IN (SELECT id FROM games WHERE currency = 'DSH')`,
		`DELETE FROM wallet_transactions WHERE currency = 'DSH'`,
		`DELETE FROM games WHERE currency = 'DSH'`,
		`DELETE FROM wallets WHERE currency = 'DSH'`,
		`DELETE FROM payment_methods WHERE name = 'Dashboard Method'`,
		`DELETE FROM users WHERE email IN ('dashboard-first@example.com', 'dashboard-second@example.com')`,
		`DELETE FROM game_categories WHERE slug = 'dashboard-test'`,
		`DELETE FROM currencies WHERE code IN ('DSH', 'DSX')`,
	}
	for _, statement := range statements {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("remove dashboard fixture: %v", err)
		}
	}
}
