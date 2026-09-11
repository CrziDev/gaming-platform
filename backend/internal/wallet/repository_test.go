package wallet

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	testDBOnce sync.Once
	testDB     *sql.DB
	testDBErr  error
)

func walletTestDB(t *testing.T) *sql.DB {
	t.Helper()
	testDBOnce.Do(func() {
		url := os.Getenv("TEST_DATABASE_URL")
		if url == "" {
			url = os.Getenv("DATABASE_URL")
		}
		if url == "" {
			testDBErr = fmt.Errorf("no test database URL")
			return
		}
		testDB, testDBErr = sql.Open("pgx", url)
		if testDBErr != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		testDBErr = testDB.PingContext(ctx)
	})
	if testDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", testDBErr)
		}
		t.Skipf("skipping wallet database test: %v", testDBErr)
	}
	return testDB
}

var testUserSequence atomic.Uint64

func createWalletTestUser(t *testing.T, db *sql.DB) string {
	t.Helper()
	sequence := testUserSequence.Add(1)
	var id string
	err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Wallet Test') RETURNING id::text`, fmt.Sprintf("wallet-test-%d@example.com", sequence)).Scan(&id)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE actor_user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallets WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func TestMoveCreditsAndDebitsAtomically(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}

	credit, err := Move(context.Background(), db, userID, "PHP", "deposit", 10_000, "credit-1", "test credit")
	if err != nil {
		t.Fatalf("credit: %v", err)
	}
	if credit.BalanceBefore != 0 || credit.BalanceAfter != 10_000 || credit.AmountMinor != 10_000 {
		t.Fatalf("unexpected credit: %+v", credit)
	}

	debit, err := Move(context.Background(), db, userID, "PHP", "wager", -2_500, "debit-1", "test debit")
	if err != nil {
		t.Fatalf("debit: %v", err)
	}
	if debit.BalanceBefore != 10_000 || debit.BalanceAfter != 7_500 {
		t.Fatalf("unexpected debit: %+v", debit)
	}

	item, err := Get(context.Background(), db, userID, "PHP")
	if err != nil || item.BalanceMinor != 7_500 {
		t.Fatalf("wallet balance = %d, err = %v", item.BalanceMinor, err)
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, userID).Scan(&count); err != nil || count != 2 {
		t.Fatalf("ledger rows = %d, err = %v", count, err)
	}
}

func TestMoveRollsBackBalanceWhenLedgerInsertFails(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}

	if _, err := Move(context.Background(), db, userID, "PHP", "not-a-kind", 100, "broken-1", "should roll back"); err == nil {
		t.Fatal("invalid transaction kind unexpectedly succeeded")
	}
	item, err := Get(context.Background(), db, userID, "PHP")
	if err != nil {
		t.Fatalf("get wallet: %v", err)
	}
	if item.BalanceMinor != 0 {
		t.Fatalf("balance changed after failed ledger insert: %d", item.BalanceMinor)
	}
}

func TestMoveIsIdempotent(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}

	first, err := Move(context.Background(), db, userID, "USD", "deposit", 500, "same-key", "original")
	if err != nil {
		t.Fatalf("first movement: %v", err)
	}
	second, err := Move(context.Background(), db, userID, "USD", "deposit", 500, "same-key", "retry")
	if err != nil {
		t.Fatalf("retry movement: %v", err)
	}
	if first.ID != second.ID || second.BalanceAfter != 500 {
		t.Fatalf("retry returned a different movement: first=%+v second=%+v", first, second)
	}
	item, err := Get(context.Background(), db, userID, "USD")
	if err != nil || item.BalanceMinor != 500 {
		t.Fatalf("wallet balance = %d, err = %v", item.BalanceMinor, err)
	}
}

func TestConcurrentMovementsWithOneIdempotencyKeyCreateOneLedgerRow(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}

	start := make(chan struct{})
	results := make(chan Transaction, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			movement, err := Move(context.Background(), db, userID, "PHP", "deposit", 500, "concurrent-key", "retry-safe credit")
			results <- movement
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent movement: %v", err)
		}
	}
	var firstID string
	for movement := range results {
		if firstID == "" {
			firstID = movement.ID
		}
		if movement.ID != firstID || movement.BalanceAfter != 500 {
			t.Fatalf("callers saw different movements: first=%q movement=%+v", firstID, movement)
		}
	}
	var balance int64
	var rows int
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, userID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND idempotency_key = 'concurrent-key'`, userID).Scan(&rows); err != nil {
		t.Fatalf("count movements: %v", err)
	}
	if balance != 500 || rows != 1 {
		t.Fatalf("balance=%d rows=%d, want 500/1", balance, rows)
	}
}

func TestMoveRejectsInsufficientFrozenAndOverflowWithoutLedgerWrites(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}

	if _, err := Move(context.Background(), db, userID, "PHP", "wager", -1, "insufficient-key", "insufficient"); !errors.Is(err, ErrInsufficientFunds) {
		t.Fatalf("insufficient debit: want %v, got %v", ErrInsufficientFunds, err)
	}
	if _, err := db.Exec(`UPDATE wallets SET status = 'frozen' WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, userID); err != nil {
		t.Fatalf("freeze wallet: %v", err)
	}
	if _, err := Move(context.Background(), db, userID, "PHP", "deposit", 1, "frozen-key", "frozen"); !errors.Is(err, ErrWalletFrozen) {
		t.Fatalf("frozen wallet: want %v, got %v", ErrWalletFrozen, err)
	}
	if _, err := db.Exec(`UPDATE wallets SET status = 'active', balance_minor = $2 WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, userID, int64(math.MaxInt64)); err != nil {
		t.Fatalf("prepare overflow balance: %v", err)
	}
	if _, err := Move(context.Background(), db, userID, "PHP", "deposit", 1, "overflow-key", "overflow"); !errors.Is(err, ErrAmountOverflow) {
		t.Fatalf("overflow credit: want %v, got %v", ErrAmountOverflow, err)
	}

	var rows int
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid`, userID).Scan(&rows); err != nil {
		t.Fatalf("count ledger rows: %v", err)
	}
	if rows != 0 {
		t.Fatalf("rejected movements wrote %d ledger rows", rows)
	}
}

func TestValidateMovementCurrencyRejectsMismatch(t *testing.T) {
	if err := validateMovementCurrency(Wallet{Currency: "PHP"}, "USD"); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("currency mismatch: want %v, got %v", ErrCurrencyMismatch, err)
	}
	if err := validateMovementCurrency(Wallet{Currency: "PHP"}, "PHP"); err != nil {
		t.Fatalf("matching currency was rejected: %v", err)
	}
}

func TestAdminAdjustmentWritesLedgerAndAuditAtomically(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	actorID := createWalletTestUser(t, db)

	credit, err := Adjust(context.Background(), db, actorID, userID, "PHP", "credit", 1_250, "manual correction")
	if err != nil {
		t.Fatalf("admin credit: %v", err)
	}
	if credit.Kind != "adjustment" || credit.AmountMinor != 1_250 || credit.BalanceBefore != 0 || credit.BalanceAfter != 1_250 {
		t.Fatalf("unexpected adjustment: %+v", credit)
	}

	var actor, action, detail string
	if err := db.QueryRow(`SELECT actor_user_id::text, action, detail FROM audit_logs WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1`, credit.WalletID).Scan(&actor, &action, &detail); err != nil {
		t.Fatalf("read audit entry: %v", err)
	}
	if actor != actorID || action != "wallet.credit" || detail != "manual correction" {
		t.Fatalf("unexpected audit entry: actor=%q action=%q detail=%q", actor, action, detail)
	}

	debit, err := Adjust(context.Background(), db, actorID, userID, "PHP", "debit", 250, "reverse correction")
	if err != nil {
		t.Fatalf("admin debit: %v", err)
	}
	if debit.AmountMinor != -250 || debit.BalanceAfter != 1_000 {
		t.Fatalf("unexpected debit: %+v", debit)
	}
}

func TestConcurrentDebitsCannotOverspend(t *testing.T) {
	db := walletTestDB(t)
	userID := createWalletTestUser(t, db)
	if _, err := List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}
	if _, err := Move(context.Background(), db, userID, "PHP", "deposit", 100, "seed-balance", "test balance"); err != nil {
		t.Fatalf("seed balance: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := Move(context.Background(), db, userID, "PHP", "wager", -70, fmt.Sprintf("debit-%d", i), "concurrent debit")
			errs <- err
		}(i)
	}
	close(start)
	wg.Wait()
	close(errs)

	var successes int
	for err := range errs {
		if err == nil {
			successes++
		} else if err != ErrInsufficientFunds {
			t.Fatalf("unexpected concurrent debit error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful debits = %d, want 1", successes)
	}
	item, err := Get(context.Background(), db, userID, "PHP")
	if err != nil || item.BalanceMinor != 30 {
		t.Fatalf("wallet balance = %d, err = %v", item.BalanceMinor, err)
	}
}
