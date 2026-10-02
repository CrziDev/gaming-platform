package withdrawal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gaming-platform/backend/internal/testdb"
	"github.com/gaming-platform/backend/internal/wallet"
)

var (
	withdrawalDBOnce sync.Once
	withdrawalDB     *sql.DB
	withdrawalDBErr  error
)

func withdrawalTestDB(t *testing.T) *sql.DB {
	t.Helper()
	withdrawalDBOnce.Do(func() {
		withdrawalDB, withdrawalDBErr = testdb.Open()
	})
	if withdrawalDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", withdrawalDBErr)
		}
		t.Skipf("skipping withdrawal database test: %v", withdrawalDBErr)
	}
	return withdrawalDB
}

var withdrawalUserSequence atomic.Uint64

func createWithdrawalUser(t *testing.T, db *sql.DB) string {
	t.Helper()
	sequence := withdrawalUserSequence.Add(1)
	var id string
	err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Withdrawal Test') RETURNING id::text`, fmt.Sprintf("withdrawal-test-%d@example.com", sequence)).Scan(&id)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE actor_user_id = ($1::text)::uuid OR entity_id IN (SELECT id::text FROM withdrawal_requests WHERE user_id = ($1::text)::uuid)`, id)
		_, _ = db.Exec(`DELETE FROM notifications WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM withdrawal_requests WHERE user_id = ($1::text)::uuid OR reviewed_by = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallet_transactions WHERE user_id = ($1::text)::uuid OR actor_user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallets WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func enabledMethodID(t *testing.T, db *sql.DB) string {
	t.Helper()
	var id string
	if err := db.QueryRow(`UPDATE payment_methods SET enabled = true, updated_at = now() WHERE name = 'GCash' AND pay_to = 'To be supplied' RETURNING id::text`).Scan(&id); err != nil {
		t.Fatalf("enable test payment method: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`UPDATE payment_methods SET enabled = false, updated_at = now() WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func fund(t *testing.T, db *sql.DB, userID string, amountMinor int64) {
	t.Helper()
	if _, err := wallet.List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}
	if _, err := wallet.Move(context.Background(), db, userID, "PHP", "adjustment", amountMinor, "", "test credit"); err != nil {
		t.Fatalf("fund wallet: %v", err)
	}
}

func balance(t *testing.T, db *sql.DB, userID string) int64 {
	t.Helper()
	var value int64
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, userID).Scan(&value); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	return value
}

func movements(t *testing.T, db *sql.DB, userID string) (holds, releases int) {
	t.Helper()
	if err := db.QueryRow(`SELECT count(*) FILTER (WHERE kind = 'withdrawal'), count(*) FILTER (WHERE kind = 'refund') FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND reference_type = 'withdrawal'`, userID).Scan(&holds, &releases); err != nil {
		t.Fatalf("count movements: %v", err)
	}
	return holds, releases
}

func newRequest(userID, methodID, key string, amountMinor int64) NewRequest {
	return NewRequest{
		UserID: userID, MethodID: methodID, Currency: "PHP", AmountMinor: amountMinor,
		AccountName: "Juan Dela Cruz", AccountNumber: "09171234567", IdempotencyKey: key,
	}
}

func TestCreateRefusalsMoveNoMoney(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	ctx := context.Background()

	cases := []struct {
		name string
		edit func(*NewRequest)
		want error
	}{
		{"below the minimum", func(in *NewRequest) { in.AmountMinor = 9_999 }, ErrAmountOutOfRange},
		{"above the maximum", func(in *NewRequest) { in.AmountMinor = 5_000_001 }, ErrAmountOutOfRange},
		{"over the balance", func(in *NewRequest) { in.AmountMinor = 20_001 }, wallet.ErrInsufficientFunds},
		{"unknown method", func(in *NewRequest) { in.MethodID = "00000000-0000-4000-8000-000000000000" }, ErrInvalidMethod},
		{"unknown currency", func(in *NewRequest) { in.Currency = "EUR" }, ErrInvalidCurrency},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			userID := createWithdrawalUser(t, db)
			fund(t, db, userID, 20_000)
			in := newRequest(userID, methodID, "refused", 10_000)
			tc.edit(&in)
			if _, _, err := Create(ctx, db, in); !errors.Is(err, tc.want) {
				t.Fatalf("want %v, got %v", tc.want, err)
			}
			if got := balance(t, db, userID); got != 20_000 {
				t.Fatalf("balance moved to %d", got)
			}
			var requests int
			if err := db.QueryRow(`SELECT count(*) FROM withdrawal_requests WHERE user_id = ($1::text)::uuid`, userID).Scan(&requests); err != nil || requests != 0 {
				t.Fatalf("requests=%d err=%v", requests, err)
			}
		})
	}
}

func TestOneWalletHoldsOnePendingRequest(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	userID := createWithdrawalUser(t, db)
	fund(t, db, userID, 50_000)
	ctx := context.Background()

	if _, _, err := Create(ctx, db, newRequest(userID, methodID, "first", 10_000)); err != nil {
		t.Fatalf("first request: %v", err)
	}
	if _, _, err := Create(ctx, db, newRequest(userID, methodID, "second", 10_000)); !errors.Is(err, ErrPendingExists) {
		t.Fatalf("second request: want ErrPendingExists, got %v", err)
	}
	if got := balance(t, db, userID); got != 40_000 {
		t.Fatalf("balance: want 40000, got %d", got)
	}
}

func TestConcurrentCreatesWithOneKeyHoldOnce(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	userID := createWithdrawalUser(t, db)
	fund(t, db, userID, 50_000)

	const attempts = 8
	ids := make([]string, attempts)
	errs := make([]error, attempts)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			item, _, err := Create(context.Background(), db, newRequest(userID, methodID, "same-key", 10_000))
			ids[i], errs[i] = item.ID, err
		}()
	}
	close(start)
	wg.Wait()

	for i := range attempts {
		if errs[i] != nil || ids[i] != ids[0] {
			t.Fatalf("attempt %d: id=%s err=%v, want %s", i, ids[i], errs[i], ids[0])
		}
	}
	if holds, _ := movements(t, db, userID); holds != 1 {
		t.Fatalf("holds: want 1, got %d", holds)
	}
	if got := balance(t, db, userID); got != 40_000 {
		t.Fatalf("balance: want 40000, got %d", got)
	}
}

func TestRejectionReturnsTheHoldOnce(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	userID := createWithdrawalUser(t, db)
	adminID := createWithdrawalUser(t, db)
	fund(t, db, userID, 30_000)
	ctx := context.Background()

	item, _, err := Create(ctx, db, newRequest(userID, methodID, "reject-me", 25_000))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := Review(ctx, db, adminID, item.ID, "reject", "", ""); !errors.Is(err, ErrRejectionReasonRequired) {
		t.Fatalf("reject without a reason: %v", err)
	}
	rejected, err := Review(ctx, db, adminID, item.ID, "reject", "", "Name mismatch")
	if err != nil || rejected.Status != "rejected" || rejected.Reason != "Name mismatch" {
		t.Fatalf("reject: %+v %v", rejected, err)
	}
	if _, err := Review(ctx, db, adminID, item.ID, "reject", "", "Again"); !errors.Is(err, ErrAlreadyReviewed) {
		t.Fatalf("second rejection: %v", err)
	}
	if _, err := Cancel(ctx, db, userID, item.ID); !errors.Is(err, ErrAlreadyReviewed) {
		t.Fatalf("cancel after rejection: %v", err)
	}
	if got := balance(t, db, userID); got != 30_000 {
		t.Fatalf("balance: want 30000, got %d", got)
	}
	if holds, releases := movements(t, db, userID); holds != 1 || releases != 1 {
		t.Fatalf("movements: holds=%d releases=%d", holds, releases)
	}
	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE entity_type = 'withdrawal_request' AND entity_id = $1`, item.ID).Scan(&audits); err != nil || audits != 2 {
		t.Fatalf("audits=%d err=%v, want request and reject", audits, err)
	}
}

func TestCancelIsPlayerScoped(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	userID := createWithdrawalUser(t, db)
	otherID := createWithdrawalUser(t, db)
	fund(t, db, userID, 30_000)
	ctx := context.Background()

	item, _, err := Create(ctx, db, newRequest(userID, methodID, "mine", 10_000))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := Cancel(ctx, db, otherID, item.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another player's cancel: %v", err)
	}
	if _, err := Get(ctx, db, otherID, item.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another player's read: %v", err)
	}
	cancelled, err := Cancel(ctx, db, userID, item.ID)
	if err != nil || cancelled.Status != "cancelled" || cancelled.CancelledAt == nil {
		t.Fatalf("cancel: %+v %v", cancelled, err)
	}
	if got := balance(t, db, userID); got != 30_000 {
		t.Fatalf("balance: want 30000, got %d", got)
	}
}

func TestConcurrentApprovalAndCancelSettleOnce(t *testing.T) {
	db := withdrawalTestDB(t)
	methodID := enabledMethodID(t, db)
	adminID := createWithdrawalUser(t, db)

	for run := range 5 {
		userID := createWithdrawalUser(t, db)
		fund(t, db, userID, 30_000)
		item, _, err := Create(context.Background(), db, newRequest(userID, methodID, fmt.Sprintf("race-%d", run), 10_000))
		if err != nil {
			t.Fatalf("create: %v", err)
		}

		var approveErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, approveErr = Review(context.Background(), db, adminID, item.ID, "approve", "GC-1", "")
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = Cancel(context.Background(), db, userID, item.ID)
		}()
		close(start)
		wg.Wait()

		holds, releases := movements(t, db, userID)
		switch {
		case approveErr == nil && errors.Is(cancelErr, ErrAlreadyReviewed):
			if got := balance(t, db, userID); got != 20_000 || holds != 1 || releases != 0 {
				t.Fatalf("approval won: balance=%d holds=%d releases=%d", got, holds, releases)
			}
		case cancelErr == nil && errors.Is(approveErr, ErrAlreadyReviewed):
			if got := balance(t, db, userID); got != 30_000 || holds != 1 || releases != 1 {
				t.Fatalf("cancel won: balance=%d holds=%d releases=%d", got, holds, releases)
			}
		default:
			t.Fatalf("want exactly one winner: approve=%v cancel=%v", approveErr, cancelErr)
		}
	}
}
