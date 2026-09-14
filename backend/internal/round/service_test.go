package round

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/money"
	"github.com/gaming-platform/backend/internal/testdb"
	"github.com/gaming-platform/backend/internal/wallet"
)

var (
	roundTestDBOnce sync.Once
	roundTestDB     *sql.DB
	roundTestDBErr  error
)

func openRoundTestDB(t *testing.T) *sql.DB {
	t.Helper()
	roundTestDBOnce.Do(func() {
		roundTestDB, roundTestDBErr = testdb.Open()
	})
	if roundTestDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", roundTestDBErr)
		}
		t.Skipf("skipping round database test: %v", roundTestDBErr)
	}
	return roundTestDB
}

var roundTestSequence atomic.Uint64

type roundFixture struct {
	UserID    string
	GameID    string
	ProfileID string
	Suffix    string
}

func createRoundFixture(t *testing.T, db *sql.DB, balanceMinor int64) roundFixture {
	t.Helper()
	sequence := roundTestSequence.Add(1)
	suffix := fmt.Sprintf("%d-%d", time.Now().UnixNano(), sequence)
	email := "round-test-" + suffix + "@example.com"
	category := "round-test-" + suffix
	gameSlug := "round-game-" + suffix

	var fixture roundFixture
	fixture.Suffix = suffix
	if err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Round Test') RETURNING id::text`, email).Scan(&fixture.UserID); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ($1, $2, 999)`, category, "Round Test "+suffix); err != nil {
		t.Fatalf("create category: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ($1, $2, $3, 'Test', 'active', 'integrated', 'PHP', 100, 1000, 100)
		RETURNING id::text`, gameSlug, "Round Game "+suffix, category).Scan(&fixture.GameID); err != nil {
		t.Fatalf("create game: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref, observed_basis_points, verified_at)
		VALUES (($1::text)::uuid, 'Test Profile', 1, 9600, 'active', 'test:v1', 9600, now())
		RETURNING id::text`, fixture.GameID).Scan(&fixture.ProfileID); err != nil {
		t.Fatalf("create profile: %v", err)
	}
	if _, err := wallet.List(context.Background(), db, fixture.UserID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}
	if balanceMinor > 0 {
		if _, err := wallet.Move(context.Background(), db, fixture.UserID, "PHP", "adjustment", balanceMinor, "round-fixture:"+suffix, "round test credit"); err != nil {
			t.Fatalf("credit wallet: %v", err)
		}
	}

	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM game_rounds WHERE game_id = ($1::text)::uuid`, fixture.GameID)
		_, _ = db.Exec(`DELETE FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, fixture.UserID)
		_, _ = db.Exec(`DELETE FROM rtp_profiles WHERE game_id = ($1::text)::uuid`, fixture.GameID)
		_, _ = db.Exec(`DELETE FROM games WHERE id = ($1::text)::uuid`, fixture.GameID)
		_, _ = db.Exec(`DELETE FROM wallets WHERE user_id = ($1::text)::uuid`, fixture.UserID)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, fixture.UserID)
		_, _ = db.Exec(`DELETE FROM game_categories WHERE slug = $1`, category)
	})
	return fixture
}

func TestOpenDebitsWagerAndBindsRoundAtomically(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)

	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "open-round-once-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 200,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}
	if opened.Status != StatusOpen || opened.Currency != "PHP" || opened.StakeMinor != 200 {
		t.Fatalf("unexpected round: %+v", opened)
	}
	if opened.UserID != fixture.UserID || opened.GameID != fixture.GameID || opened.RTPProfileID != fixture.ProfileID {
		t.Fatalf("round bindings are wrong: %+v", opened)
	}

	var balance int64
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if balance != 800 {
		t.Fatalf("balance = %d, want 800", balance)
	}

	var kind, referenceType, referenceID, idempotencyKey string
	var amountMinor, before, after int64
	if err := db.QueryRow(`
		SELECT kind, amount_minor, balance_before, balance_after, reference_type, reference_id::text, idempotency_key
		FROM wallet_transactions
		WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid`, opened.ID).Scan(
		&kind, &amountMinor, &before, &after, &referenceType, &referenceID, &idempotencyKey,
	); err != nil {
		t.Fatalf("read wager movement: %v", err)
	}
	if kind != "wager" || amountMinor != -200 || before != 1_000 || after != 800 || referenceType != "round" || referenceID != opened.ID || idempotencyKey != "round:"+opened.ID+":wager" {
		t.Fatalf("unexpected wager: kind=%q amount=%d before=%d after=%d reference=%q/%q key=%q", kind, amountMinor, before, after, referenceType, referenceID, idempotencyKey)
	}
}

func TestOpenDuplicateRoundKeyReturnsOneRoundAndDebitsOnce(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	input := OpenInput{RoundKey: "duplicate-open-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 300}

	start := make(chan struct{})
	results := make(chan Round, 2)
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			item, err := Open(context.Background(), db, input)
			results <- item
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("duplicate open: %v", err)
		}
	}
	var roundID string
	for item := range results {
		if roundID == "" {
			roundID = item.ID
		}
		if item.ID != roundID {
			t.Fatalf("duplicate returned round %q, want %q", item.ID, roundID)
		}
	}

	var balance int64
	var rounds, wagers int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM game_rounds WHERE round_key = $1`, input.RoundKey).Scan(&rounds); err != nil {
		t.Fatalf("count rounds: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND kind = 'wager'`, fixture.UserID).Scan(&wagers); err != nil {
		t.Fatalf("count wagers: %v", err)
	}
	if balance != 700 || rounds != 1 || wagers != 1 {
		t.Fatalf("balance=%d rounds=%d wagers=%d, want 700/1/1", balance, rounds, wagers)
	}
}

func TestOpenRejectsConflictingRoundKeyWithoutAnotherDebit(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	input := OpenInput{RoundKey: "conflicting-open-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 200}
	if _, err := Open(context.Background(), db, input); err != nil {
		t.Fatalf("first open: %v", err)
	}
	input.StakeMinor = 300
	if _, err := Open(context.Background(), db, input); !errors.Is(err, ErrRoundKeyConflict) {
		t.Fatalf("conflicting open: want %v, got %v", ErrRoundKeyConflict, err)
	}

	var balance int64
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if balance != 800 {
		t.Fatalf("balance = %d, want 800", balance)
	}
}

func TestOpenConcurrentStartsDoNotOverspendOrDeadlock(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for _, key := range []string{"concurrent-open-a", "concurrent-open-b"} {
		key := key + "-" + fixture.Suffix
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := Open(ctx, db, OpenInput{RoundKey: key, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 800})
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errs)

	var succeeded, insufficient int
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, wallet.ErrInsufficientFunds):
			insufficient++
		default:
			t.Fatalf("concurrent open: %v", err)
		}
	}
	if succeeded != 1 || insufficient != 1 {
		t.Fatalf("succeeded=%d insufficient=%d, want 1/1", succeeded, insufficient)
	}

	var balance int64
	var rounds, wagers int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM game_rounds WHERE user_id = ($1::text)::uuid`, fixture.UserID).Scan(&rounds); err != nil {
		t.Fatalf("count rounds: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND kind = 'wager'`, fixture.UserID).Scan(&wagers); err != nil {
		t.Fatalf("count wagers: %v", err)
	}
	if balance != 200 || rounds != 1 || wagers != 1 {
		t.Fatalf("balance=%d rounds=%d wagers=%d, want 200/1/1", balance, rounds, wagers)
	}
}

func TestOpenRejectsUnavailableGameProfileAndInvalidWagersWithoutMovingMoney(t *testing.T) {
	tests := []struct {
		name    string
		stake   int64
		prepare func(*testing.T, *sql.DB, roundFixture)
		want    error
	}{
		{name: "below minimum", stake: 99, want: ErrInvalidWager},
		{name: "above maximum", stake: 1_100, want: ErrInvalidWager},
		{name: "outside exact step", stake: 150, want: ErrInvalidWager},
		{name: "outside JSON exact range", stake: money.MaxSafeMinor + 1, want: ErrInvalidWager},
		{
			name: "inactive game", stake: 100, want: ErrGameUnavailable,
			prepare: func(t *testing.T, db *sql.DB, fixture roundFixture) {
				t.Helper()
				if _, err := db.Exec(`UPDATE games SET status = 'maintenance' WHERE id = ($1::text)::uuid`, fixture.GameID); err != nil {
					t.Fatalf("disable game: %v", err)
				}
			},
		},
		{
			name: "no active profile", stake: 100, want: ErrProfileUnavailable,
			prepare: func(t *testing.T, db *sql.DB, fixture roundFixture) {
				t.Helper()
				if _, err := db.Exec(`UPDATE rtp_profiles SET status = 'verified' WHERE id = ($1::text)::uuid`, fixture.ProfileID); err != nil {
					t.Fatalf("deactivate profile: %v", err)
				}
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := openRoundTestDB(t)
			fixture := createRoundFixture(t, db, 1_000)
			if test.prepare != nil {
				test.prepare(t, db, fixture)
			}
			_, err := Open(context.Background(), db, OpenInput{
				RoundKey: "rejected-" + test.name + "-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: test.stake,
			})
			if !errors.Is(err, test.want) {
				t.Fatalf("open: want %v, got %v", test.want, err)
			}

			var balance int64
			var rounds, wagers int
			if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, fixture.UserID).Scan(&balance); err != nil {
				t.Fatalf("read balance: %v", err)
			}
			if err := db.QueryRow(`SELECT count(*) FROM game_rounds WHERE user_id = ($1::text)::uuid`, fixture.UserID).Scan(&rounds); err != nil {
				t.Fatalf("count rounds: %v", err)
			}
			if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND kind = 'wager'`, fixture.UserID).Scan(&wagers); err != nil {
				t.Fatalf("count wagers: %v", err)
			}
			if balance != 1_000 || rounds != 0 || wagers != 0 {
				t.Fatalf("balance=%d rounds=%d wagers=%d, want 1000/0/0", balance, rounds, wagers)
			}
		})
	}
}

func TestOpenSnapshotsActiveProfile(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "profile-snapshot-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 100,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}

	if _, err := db.Exec(`UPDATE rtp_profiles SET status = 'verified' WHERE id = ($1::text)::uuid`, fixture.ProfileID); err != nil {
		t.Fatalf("retire original profile: %v", err)
	}
	var replacementID string
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref, observed_basis_points, verified_at)
		VALUES (($1::text)::uuid, 'Replacement', 2, 9400, 'active', 'test:v2', 9400, now())
		RETURNING id::text`, fixture.GameID).Scan(&replacementID); err != nil {
		t.Fatalf("activate replacement profile: %v", err)
	}

	var storedProfileID string
	if err := db.QueryRow(`SELECT rtp_profile_id::text FROM game_rounds WHERE id = ($1::text)::uuid`, opened.ID).Scan(&storedProfileID); err != nil {
		t.Fatalf("read round profile: %v", err)
	}
	if storedProfileID != fixture.ProfileID || storedProfileID == replacementID {
		t.Fatalf("round profile = %q, want original %q", storedProfileID, fixture.ProfileID)
	}
}

func TestSettleCreditsPositiveWinAndClosesRoundAtomically(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "settle-positive-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 200,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}

	settled, err := Settle(context.Background(), db, SettleInput{
		RoundID: opened.ID, WinMinor: 350, MultiplierHundredths: 175,
		EngineReference: "engine:" + fixture.Suffix,
		ResultData:      json.RawMessage(`{"outcome":"win"}`),
	})
	if err != nil {
		t.Fatalf("settle round: %v", err)
	}
	if settled.Status != StatusSettled || settled.WinMinor == nil || *settled.WinMinor != 350 || settled.MultiplierHundredths == nil || *settled.MultiplierHundredths != 175 || settled.SettledAt == nil {
		t.Fatalf("unexpected settled round: %+v", settled)
	}
	if settled.EngineReference != "engine:"+fixture.Suffix {
		t.Fatalf("engine reference = %q", settled.EngineReference)
	}
	var result map[string]string
	if err := json.Unmarshal(settled.ResultData, &result); err != nil || result["outcome"] != "win" {
		t.Fatalf("result data = %s, error = %v", settled.ResultData, err)
	}

	var balance int64
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	var amount int64
	var count int
	if err := db.QueryRow(`
		SELECT COALESCE(sum(amount_minor), 0), count(*)
		FROM wallet_transactions
		WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid AND kind = 'win'`, opened.ID).Scan(&amount, &count); err != nil {
		t.Fatalf("read win movement: %v", err)
	}
	if balance != 1_150 || amount != 350 || count != 1 {
		t.Fatalf("balance=%d win amount=%d count=%d, want 1150/350/1", balance, amount, count)
	}
}

func TestSettleRecordsZeroWinWithoutMovement(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "settle-zero-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 100,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}
	settled, err := Settle(context.Background(), db, SettleInput{RoundID: opened.ID, WinMinor: 0, MultiplierHundredths: 0})
	if err != nil {
		t.Fatalf("settle zero win: %v", err)
	}
	if settled.Status != StatusSettled || settled.WinMinor == nil || *settled.WinMinor != 0 {
		t.Fatalf("unexpected settled round: %+v", settled)
	}

	var balance int64
	var wins int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid AND kind = 'win'`, opened.ID).Scan(&wins); err != nil {
		t.Fatalf("count win movements: %v", err)
	}
	if balance != 900 || wins != 0 {
		t.Fatalf("balance=%d wins=%d, want 900/0", balance, wins)
	}
}

func TestConcurrentSettlementCreditsAtMostOnce(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "concurrent-settle-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 200,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	start := make(chan struct{})
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := Settle(ctx, db, SettleInput{RoundID: opened.ID, WinMinor: 500, MultiplierHundredths: 250})
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errs)

	var settled, alreadySettled int
	for err := range errs {
		switch {
		case err == nil:
			settled++
		case errors.Is(err, ErrRoundSettled):
			alreadySettled++
		default:
			t.Fatalf("concurrent settlement: %v", err)
		}
	}
	if settled != 1 || alreadySettled != 1 {
		t.Fatalf("settled=%d already settled=%d, want 1/1", settled, alreadySettled)
	}

	var balance int64
	var wins int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid AND kind = 'win'`, opened.ID).Scan(&wins); err != nil {
		t.Fatalf("count win movements: %v", err)
	}
	if balance != 1_300 || wins != 1 {
		t.Fatalf("balance=%d wins=%d, want 1300/1", balance, wins)
	}
}

func TestSettleRollsBackBalanceAndStatusWhenWinLedgerInsertFails(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "settle-rollback-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 100,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}
	if _, err := db.Exec(`
		INSERT INTO wallet_transactions (
			wallet_id, user_id, currency, kind, amount_minor, balance_before, balance_after,
			reference_type, reference_id, idempotency_key, reason
		) VALUES (
			($1::text)::uuid, ($2::text)::uuid, 'PHP', 'win', 1, 0, 1,
			'round', ($3::text)::uuid, $4, 'force settlement conflict'
		)`, opened.WalletID, fixture.UserID, opened.ID, "forced-win:"+fixture.Suffix); err != nil {
		t.Fatalf("insert conflicting win: %v", err)
	}

	if _, err := Settle(context.Background(), db, SettleInput{RoundID: opened.ID, WinMinor: 200, MultiplierHundredths: 200}); err == nil {
		t.Fatal("settlement unexpectedly succeeded")
	}

	var status string
	var winMinor sql.NullInt64
	var balance int64
	if err := db.QueryRow(`SELECT status, win_minor FROM game_rounds WHERE id = ($1::text)::uuid`, opened.ID).Scan(&status, &winMinor); err != nil {
		t.Fatalf("read round: %v", err)
	}
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if status != StatusOpen || winMinor.Valid || balance != 900 {
		t.Fatalf("status=%q win=%v balance=%d, want open/null/900", status, winMinor, balance)
	}
}

func TestCancelAndFailRefundOnceAndBecomeTerminal(t *testing.T) {
	tests := []struct {
		name       string
		status     string
		terminate  func(context.Context, *sql.DB, TerminateInput) (Round, error)
		otherClose func(context.Context, *sql.DB, TerminateInput) (Round, error)
	}{
		{name: "cancel", status: StatusCancelled, terminate: Cancel, otherClose: Fail},
		{name: "fail", status: StatusFailed, terminate: Fail, otherClose: Cancel},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db := openRoundTestDB(t)
			fixture := createRoundFixture(t, db, 1_000)
			opened, err := Open(context.Background(), db, OpenInput{
				RoundKey: test.name + "-refund-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 300,
			})
			if err != nil {
				t.Fatalf("open round: %v", err)
			}
			input := TerminateInput{
				RoundID: opened.ID, EngineReference: "engine:" + fixture.Suffix,
				ResultData: json.RawMessage(`{"reason":"engine unavailable"}`),
			}

			for attempt := 1; attempt <= 2; attempt++ {
				closed, err := test.terminate(context.Background(), db, input)
				if err != nil {
					t.Fatalf("%s attempt %d: %v", test.name, attempt, err)
				}
				if closed.Status != test.status || closed.WinMinor != nil || closed.SettledAt != nil {
					t.Fatalf("unexpected terminal round: %+v", closed)
				}
			}

			var balance, refunded int64
			var refunds int
			if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
				t.Fatalf("read balance: %v", err)
			}
			if err := db.QueryRow(`
				SELECT COALESCE(sum(amount_minor), 0), count(*)
				FROM wallet_transactions
				WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid AND kind = 'refund'`, opened.ID).Scan(&refunded, &refunds); err != nil {
				t.Fatalf("read refunds: %v", err)
			}
			if balance != 1_000 || refunded != 300 || refunds != 1 {
				t.Fatalf("balance=%d refunded=%d refunds=%d, want 1000/300/1", balance, refunded, refunds)
			}

			if _, err := test.otherClose(context.Background(), db, input); !errors.Is(err, ErrRoundClosed) {
				t.Fatalf("other terminal transition: want %v, got %v", ErrRoundClosed, err)
			}
			if _, err := Settle(context.Background(), db, SettleInput{RoundID: opened.ID, WinMinor: 100, MultiplierHundredths: 100}); !errors.Is(err, ErrRoundClosed) {
				t.Fatalf("settle terminal round: want %v, got %v", ErrRoundClosed, err)
			}
		})
	}
}

func TestLifecycleRejectsInvalidOutcomeWithoutMovingMoney(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 1_000)
	opened, err := Open(context.Background(), db, OpenInput{
		RoundKey: "invalid-outcome-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 100,
	})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}

	invalidSettlements := []SettleInput{
		{RoundID: opened.ID, WinMinor: -1},
		{RoundID: opened.ID, WinMinor: money.MaxSafeMinor + 1},
		{RoundID: opened.ID, MultiplierHundredths: -1},
		{RoundID: opened.ID, ResultData: json.RawMessage(`{"broken"`)},
	}
	for _, input := range invalidSettlements {
		if _, err := Settle(context.Background(), db, input); !errors.Is(err, ErrInvalidOutcome) {
			t.Fatalf("invalid settlement: want %v, got %v", ErrInvalidOutcome, err)
		}
	}
	if _, err := Cancel(context.Background(), db, TerminateInput{RoundID: opened.ID, ResultData: json.RawMessage(`not-json`)}); !errors.Is(err, ErrInvalidOutcome) {
		t.Fatalf("invalid cancellation: want %v, got %v", ErrInvalidOutcome, err)
	}

	var status string
	var balance int64
	var outcomeMovements int
	if err := db.QueryRow(`SELECT status FROM game_rounds WHERE id = ($1::text)::uuid`, opened.ID).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE id = ($1::text)::uuid`, opened.WalletID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE reference_type = 'round' AND reference_id = ($1::text)::uuid AND kind IN ('win', 'refund')`, opened.ID).Scan(&outcomeMovements); err != nil {
		t.Fatalf("count outcome movements: %v", err)
	}
	if status != StatusOpen || balance != 900 || outcomeMovements != 0 {
		t.Fatalf("status=%q balance=%d outcome movements=%d, want open/900/0", status, balance, outcomeMovements)
	}
}

func TestValidWager(t *testing.T) {
	config := gameConfig{MinWagerMinor: 100, MaxWagerMinor: 1_000, WagerStepMinor: 100}
	for _, stake := range []int64{100, 200, 1_000} {
		if !validWager(config, stake) {
			t.Fatalf("stake %d should be valid", stake)
		}
	}
	for _, stake := range []int64{-100, 0, 99, 150, 1_001, money.MaxSafeMinor + 1} {
		if validWager(config, stake) {
			t.Fatalf("stake %d should be invalid", stake)
		}
	}
	config.WagerStepMinor = 0
	if validWager(config, 100) {
		t.Fatal("zero wager step should be invalid")
	}
}
