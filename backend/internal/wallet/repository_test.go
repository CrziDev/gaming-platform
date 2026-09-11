package wallet

import (
	"context"
	"database/sql"
	"fmt"
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
