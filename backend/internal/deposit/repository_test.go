package deposit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/wallet"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	depositDBOnce sync.Once
	depositDB     *sql.DB
	depositDBErr  error
)

func depositTestDB(t *testing.T) *sql.DB {
	t.Helper()
	depositDBOnce.Do(func() {
		url := os.Getenv("TEST_DATABASE_URL")
		if url == "" {
			url = os.Getenv("DATABASE_URL")
		}
		if url == "" {
			depositDBErr = errors.New("no test database URL")
			return
		}
		depositDB, depositDBErr = sql.Open("pgx", url)
		if depositDBErr != nil {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		depositDBErr = depositDB.PingContext(ctx)
	})
	if depositDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", depositDBErr)
		}
		t.Skipf("skipping deposit database test: %v", depositDBErr)
	}
	return depositDB
}

var depositUserSequence atomic.Uint64

func createDepositUser(t *testing.T, db *sql.DB) string {
	t.Helper()
	sequence := depositUserSequence.Add(1)
	var id string
	err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Deposit Test') RETURNING id::text`, fmt.Sprintf("deposit-test-%d@example.com", sequence)).Scan(&id)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE actor_user_id = ($1::text)::uuid OR entity_id IN (SELECT id::text FROM deposit_requests WHERE user_id = ($1::text)::uuid)`, id)
		_, _ = db.Exec(`DELETE FROM deposit_requests WHERE user_id = ($1::text)::uuid OR reviewed_by = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallet_transactions WHERE user_id = ($1::text)::uuid OR actor_user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM wallets WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func enabledMethodID(t *testing.T, db *sql.DB) string {
	t.Helper()
	var id string
	if err := db.QueryRow(`SELECT id::text FROM payment_methods WHERE enabled = true ORDER BY sort_order, id LIMIT 1`).Scan(&id); err != nil {
		t.Fatalf("find enabled payment method: %v", err)
	}
	return id
}

func provisionDepositWallets(t *testing.T, db *sql.DB, userID string) {
	t.Helper()
	if _, err := wallet.List(context.Background(), db, userID); err != nil {
		t.Fatalf("provision wallets: %v", err)
	}
}

func TestCreateIsIdempotentAndPlayerScoped(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	otherUserID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	methodID := enabledMethodID(t, db)

	first, created, err := Create(context.Background(), db, userID, methodID, "PHP", 10_000, "reference-one", "proof-one.png", "deposit-key")
	if err != nil || !created {
		t.Fatalf("create request: created=%v err=%v", created, err)
	}
	retry, created, err := Create(context.Background(), db, userID, methodID, "PHP", 20_000, "reference-two", "proof-two.png", "deposit-key")
	if err != nil || created {
		t.Fatalf("retry request: created=%v err=%v", created, err)
	}
	if retry.ID != first.ID || retry.AmountMinor != first.AmountMinor || retry.Reference != first.Reference {
		t.Fatalf("retry did not return the original request: first=%+v retry=%+v", first, retry)
	}

	var count int
	var proofPath string
	if err := db.QueryRow(`SELECT count(*), min(proof_path) FROM deposit_requests WHERE user_id = ($1::text)::uuid`, userID).Scan(&count, &proofPath); err != nil {
		t.Fatalf("inspect requests: %v", err)
	}
	if count != 1 || proofPath != "proof-one.png" {
		t.Fatalf("requests=%d proof=%q, want one request with the original proof", count, proofPath)
	}
	if _, err := Get(context.Background(), db, otherUserID, first.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("another player read the request: %v", err)
	}
}

func TestConcurrentCreatesWithOneIdempotencyKeyCreateOneRequest(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	methodID := enabledMethodID(t, db)

	start := make(chan struct{})
	results := make(chan Request, 2)
	createdResults := make(chan bool, 2)
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for index := range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			item, created, err := Create(context.Background(), db, userID, methodID, "PHP", 10_000, "concurrent-create", fmt.Sprintf("proof-%d.png", index), "one-create-key")
			results <- item
			createdResults <- created
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(createdResults)
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent create: %v", err)
		}
	}
	var firstID string
	for item := range results {
		if firstID == "" {
			firstID = item.ID
		}
		if item.ID != firstID {
			t.Fatalf("callers received different requests: first=%q current=%q", firstID, item.ID)
		}
	}
	var createdCount int
	for created := range createdResults {
		if created {
			createdCount++
		}
	}
	var rowCount int
	if err := db.QueryRow(`SELECT count(*) FROM deposit_requests WHERE user_id = ($1::text)::uuid AND idempotency_key = 'one-create-key'`, userID).Scan(&rowCount); err != nil {
		t.Fatalf("count requests: %v", err)
	}
	if createdCount != 1 || rowCount != 1 {
		t.Fatalf("created results=%d rows=%d, want one each", createdCount, rowCount)
	}
}

func TestCreateValidatesServerOwnedDepositRules(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	methodID := enabledMethodID(t, db)

	tests := map[string]struct {
		methodID  string
		currency  string
		amount    int64
		reference string
		want      error
	}{
		"unknown method":    {"00000000-0000-4000-8000-000000000000", "PHP", 10_000, "reference", ErrInvalidMethod},
		"unknown currency":  {methodID, "EUR", 10_000, "reference", ErrInvalidCurrency},
		"below minimum":     {methodID, "PHP", 9_999, "reference", ErrAmountOutOfRange},
		"missing reference": {methodID, "PHP", 10_000, "", ErrReferenceRequired},
	}
	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			_, _, err := Create(context.Background(), db, userID, test.methodID, test.currency, test.amount, test.reference, "proof.png", "key-"+name)
			if !errors.Is(err, test.want) {
				t.Fatalf("want %v, got %v", test.want, err)
			}
		})
	}
}

func TestReviewApprovalCreditsOnceAndAudits(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	actorID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	request, _, err := Create(context.Background(), db, userID, enabledMethodID(t, db), "PHP", 10_000, "approval-reference", "proof.png", "approval-key")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	if _, err := Review(context.Background(), db, actorID, request.ID, "approve", 12_000, ""); !errors.Is(err, ErrApprovalReasonRequired) {
		t.Fatalf("edited approval without reason: want %v, got %v", ErrApprovalReasonRequired, err)
	}
	approved, err := Review(context.Background(), db, actorID, request.ID, "approve", 12_000, "Verified amount on proof")
	if err != nil {
		t.Fatalf("approve request: %v", err)
	}
	if approved.Status != "approved" || approved.AmountMinor != 12_000 || approved.Reason != "Verified amount on proof" || approved.ReviewedAt == nil {
		t.Fatalf("unexpected approved request: %+v", approved)
	}
	if _, err := Review(context.Background(), db, actorID, request.ID, "approve", 12_000, "retry"); !errors.Is(err, ErrAlreadyReviewed) {
		t.Fatalf("second approval: want %v, got %v", ErrAlreadyReviewed, err)
	}

	assertDepositFinancialRows(t, db, userID, request.ID, 12_000, 1, 1)
	var actor, action, detail, beforeAmount, afterAmount string
	if err := db.QueryRow(`SELECT actor_user_id::text, action, detail, before_data->>'amount_minor', after_data->>'amount_minor' FROM audit_logs WHERE entity_type = 'deposit_request' AND entity_id = $1`, request.ID).Scan(&actor, &action, &detail, &beforeAmount, &afterAmount); err != nil {
		t.Fatalf("read approval audit: %v", err)
	}
	if actor != actorID || action != "deposit.approve" || detail != "Verified amount on proof" || beforeAmount != "10000" || afterAmount != "12000" {
		t.Fatalf("unexpected approval audit: actor=%q action=%q detail=%q before=%q after=%q", actor, action, detail, beforeAmount, afterAmount)
	}
}

func TestReviewRejectionPreservesReasonWithoutMovingMoney(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	actorID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	request, _, err := Create(context.Background(), db, userID, enabledMethodID(t, db), "PHP", 10_000, "rejection-reference", "proof.png", "rejection-key")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	if _, err := Review(context.Background(), db, actorID, request.ID, "reject", 0, "  "); !errors.Is(err, ErrRejectionReasonRequired) {
		t.Fatalf("blank rejection: want %v, got %v", ErrRejectionReasonRequired, err)
	}
	rejected, err := Review(context.Background(), db, actorID, request.ID, "reject", 0, "Reference not found")
	if err != nil {
		t.Fatalf("reject request: %v", err)
	}
	if rejected.Status != "rejected" || rejected.Reason != "Reference not found" || rejected.ReviewedAt == nil {
		t.Fatalf("unexpected rejected request: %+v", rejected)
	}
	assertDepositFinancialRows(t, db, userID, request.ID, 0, 0, 1)
}

func TestConcurrentApprovalsCreditExactlyOnce(t *testing.T) {
	db := depositTestDB(t)
	userID := createDepositUser(t, db)
	actorID := createDepositUser(t, db)
	provisionDepositWallets(t, db, userID)
	request, _, err := Create(context.Background(), db, userID, enabledMethodID(t, db), "PHP", 10_000, "concurrent-reference", "proof.png", "concurrent-key")
	if err != nil {
		t.Fatalf("create request: %v", err)
	}

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			_, err := Review(context.Background(), db, actorID, request.ID, "approve", 0, "")
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(errs)

	var succeeded, alreadyReviewed int
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrAlreadyReviewed):
			alreadyReviewed++
		default:
			t.Fatalf("unexpected review error: %v", err)
		}
	}
	if succeeded != 1 || alreadyReviewed != 1 {
		t.Fatalf("successes=%d already-reviewed=%d, want one each", succeeded, alreadyReviewed)
	}
	assertDepositFinancialRows(t, db, userID, request.ID, 10_000, 1, 1)
}

func assertDepositFinancialRows(t *testing.T, db *sql.DB, userID, requestID string, wantBalance int64, wantMovements, wantAudits int) {
	t.Helper()
	var balance int64
	if err := db.QueryRow(`SELECT balance_minor FROM wallets WHERE user_id = ($1::text)::uuid AND currency = 'PHP'`, userID).Scan(&balance); err != nil {
		t.Fatalf("read balance: %v", err)
	}
	if balance != wantBalance {
		t.Fatalf("balance=%d, want %d", balance, wantBalance)
	}
	var movements int
	if err := db.QueryRow(`SELECT count(*) FROM wallet_transactions WHERE reference_type = 'deposit' AND reference_id = ($1::text)::uuid`, requestID).Scan(&movements); err != nil {
		t.Fatalf("count movements: %v", err)
	}
	if movements != wantMovements {
		t.Fatalf("movements=%d, want %d", movements, wantMovements)
	}
	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE entity_type = 'deposit_request' AND entity_id = $1`, requestID).Scan(&audits); err != nil {
		t.Fatalf("count audits: %v", err)
	}
	if audits != wantAudits {
		t.Fatalf("audits=%d, want %d", audits, wantAudits)
	}
}
