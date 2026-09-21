package dashboard

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"reflect"
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

	// A refunded wager on a failed round must not count as stake.
	insertDashboardMovement(t, db, firstWalletID, firstUserID, "wager", -900, 1000, 100, "now()")
	insertDashboardMovement(t, db, firstWalletID, firstUserID, "refund", 900, 100, 1000, "now()")

	gameA := insertDashboardGame(t, db, "dashboard-game-a", "Dashboard Game A", 9400)
	gameB := insertDashboardGame(t, db, "dashboard-game-b", "Dashboard Game B", 9600)
	insertSettledDashboardRound(t, db, "dashboard-a-one", firstUserID, gameA, firstWalletID, 100, 80, 9400, "now()")
	insertSettledDashboardRound(t, db, "dashboard-a-two", secondUserID, gameA, secondWalletID, 300, 150, 9400, "now()")
	insertSettledDashboardRound(t, db, "dashboard-b-one", firstUserID, gameB, firstWalletID, 600, 500, 9600, "now()")
	insertSettledDashboardRound(t, db, "dashboard-a-old", firstUserID, gameA, firstWalletID, 900, 0, 9400, "now() - interval '2 days'")
	insertOpenDashboardRound(t, db, "dashboard-a-open", firstUserID, gameA, firstWalletID, 900)

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
	if summary.StakedTodayMinor != 1000 || summary.ReturnedTodayMinor != 730 || summary.HoldTodayMinor != 270 {
		t.Fatalf("stake=%d return=%d hold=%d, want 1000/730/270", summary.StakedTodayMinor, summary.ReturnedTodayMinor, summary.HoldTodayMinor)
	}
	if summary.RoundsToday != 3 || summary.PlayersToday != 2 {
		t.Fatalf("rounds=%d players=%d, want 3/2", summary.RoundsToday, summary.PlayersToday)
	}
	// Expected is weighted by stake: (400×9400 + 600×9600) / 1000, not the games' mean of 9500.
	if summary.EffectiveRTPBasisPts != 7300 || summary.ExpectedRTPBasisPts != 9520 {
		t.Fatalf("effective=%d expected=%d, want 7300/9520", summary.EffectiveRTPBasisPts, summary.ExpectedRTPBasisPts)
	}
	wantGames := []GameActivity{
		{GameID: gameB, Slug: "dashboard-game-b", Name: "Dashboard Game B", Rounds: 1, StakedMinor: 600, ReturnedMinor: 500, HoldMinor: 100, EffectiveRTPBasisPts: 8333, ExpectedRTPBasisPts: 9600},
		{GameID: gameA, Slug: "dashboard-game-a", Name: "Dashboard Game A", Rounds: 2, StakedMinor: 400, ReturnedMinor: 230, HoldMinor: 170, EffectiveRTPBasisPts: 5750, ExpectedRTPBasisPts: 9400},
	}
	if !reflect.DeepEqual(summary.Games, wantGames) {
		t.Fatalf("games=%+v, want %+v", summary.Games, wantGames)
	}
	if summary.OldestPendingAt == nil {
		t.Fatal("oldest pending timestamp is missing")
	}
	oldestAge := time.Since(*summary.OldestPendingAt)
	if oldestAge < 2*time.Hour || oldestAge > 4*time.Hour {
		t.Fatalf("oldest pending age=%s, want about 3 hours", oldestAge)
	}
}

func TestGetReportsZeroActivityWithoutSettledRounds(t *testing.T) {
	db := dashboardTestDB(t)
	removeDashboardFixtures(t, db)
	t.Cleanup(func() { removeDashboardFixtures(t, db) })

	if _, err := db.Exec(`INSERT INTO currencies (code, name, symbol, minor_units) VALUES ('DSH', 'Dashboard Test', 'D', 2)`); err != nil {
		t.Fatalf("create currency: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name) VALUES ('dashboard-test', 'Dashboard Test')`); err != nil {
		t.Fatalf("create category: %v", err)
	}
	userID := insertDashboardUser(t, db, "dashboard-first@example.com")
	walletID := insertDashboardWallet(t, db, userID)
	gameID := insertDashboardGame(t, db, "dashboard-game-a", "Dashboard Game A", 9400)
	insertOpenDashboardRound(t, db, "dashboard-a-open", userID, gameID, walletID, 100)

	summary, err := Get(context.Background(), db, "DSH")
	if err != nil {
		t.Fatalf("get summary: %v", err)
	}
	if summary.StakedTodayMinor != 0 || summary.ReturnedTodayMinor != 0 || summary.HoldTodayMinor != 0 {
		t.Fatalf("stake=%d return=%d hold=%d, want zeros", summary.StakedTodayMinor, summary.ReturnedTodayMinor, summary.HoldTodayMinor)
	}
	if summary.RoundsToday != 0 || summary.PlayersToday != 0 || summary.EffectiveRTPBasisPts != 0 || summary.ExpectedRTPBasisPts != 0 {
		t.Fatalf("rounds=%d players=%d effective=%d expected=%d, want zeros", summary.RoundsToday, summary.PlayersToday, summary.EffectiveRTPBasisPts, summary.ExpectedRTPBasisPts)
	}
	if summary.Games == nil || len(summary.Games) != 0 {
		t.Fatalf("games=%v, want an empty non-nil slice", summary.Games)
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

func insertDashboardGame(t *testing.T, db *sql.DB, slug, name string, rtpBasisPoints int) string {
	t.Helper()
	var id string
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, rtp_basis_points)
		VALUES ($1, $2, 'dashboard-test', 'Test', 'active', $3)
		RETURNING id::text`, slug, name, rtpBasisPoints).Scan(&id); err != nil {
		t.Fatalf("create game %s: %v", slug, err)
	}
	return id
}

func insertSettledDashboardRound(t *testing.T, db *sql.DB, key, userID, gameID, walletID string, stake, win int64, rtpBasisPoints int, settledAt string) {
	t.Helper()
	query := `INSERT INTO game_rounds (round_key, user_id, game_id, wallet_id, currency, rtp_basis_points, status, stake_minor, win_minor, started_at, settled_at, created_at)
		VALUES ($1, ($2::text)::uuid, ($3::text)::uuid, ($4::text)::uuid, 'DSH', $5, 'settled', $6, $7, ` + settledAt + `, ` + settledAt + `, ` + settledAt + `)`
	if _, err := db.Exec(query, key, userID, gameID, walletID, rtpBasisPoints, stake, win); err != nil {
		t.Fatalf("create settled round %s: %v", key, err)
	}
}

func insertOpenDashboardRound(t *testing.T, db *sql.DB, key, userID, gameID, walletID string, stake int64) {
	t.Helper()
	if _, err := db.Exec(`INSERT INTO game_rounds (round_key, user_id, game_id, wallet_id, currency, rtp_basis_points, status, stake_minor)
		VALUES ($1, ($2::text)::uuid, ($3::text)::uuid, ($4::text)::uuid, 'DSH', 9400, 'open', $5)`, key, userID, gameID, walletID, stake); err != nil {
		t.Fatalf("create open round %s: %v", key, err)
	}
}

func removeDashboardFixtures(t *testing.T, db *sql.DB) {
	t.Helper()
	statements := []string{
		`DELETE FROM deposit_requests WHERE currency = 'DSH'`,
		`DELETE FROM game_rounds WHERE currency = 'DSH'`,
		`DELETE FROM wallet_transactions WHERE currency = 'DSH'`,
		`DELETE FROM games WHERE category_slug = 'dashboard-test'`,
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
