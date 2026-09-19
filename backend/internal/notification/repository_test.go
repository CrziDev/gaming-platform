package notification

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/gaming-platform/backend/internal/testdb"
)

var (
	testDBOnce sync.Once
	testDB     *sql.DB
	testDBErr  error
)

func notificationTestDB(t *testing.T) *sql.DB {
	t.Helper()
	testDBOnce.Do(func() {
		testDB, testDBErr = testdb.Open()
	})
	if testDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", testDBErr)
		}
		t.Skipf("skipping notification database test: %v", testDBErr)
	}
	return testDB
}

var userSequence atomic.Uint64

func createNotificationUser(t *testing.T, db *sql.DB) string {
	t.Helper()
	var id string
	err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Notification Test') RETURNING id::text`,
		fmt.Sprintf("notification-%d-%d@example.com", os.Getpid(), userSequence.Add(1))).Scan(&id)
	if err != nil {
		t.Fatalf("create test user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM notifications WHERE user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func create(t *testing.T, db *sql.DB, n Notification) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer tx.Rollback()
	if err := Create(context.Background(), tx, n); err != nil {
		t.Fatalf("create %+v: %v", n, err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatalf("commit: %v", err)
	}
}

func TestNotificationsAreOncePerReferenceNewestFirstAndReadTogether(t *testing.T) {
	db := notificationTestDB(t)
	userID := createNotificationUser(t, db)
	other := createNotificationUser(t, db)
	ctx := context.Background()
	amount := int64(12_000)
	deposit := "00000000-0000-4000-8000-000000000001"
	round := "00000000-0000-4000-8000-000000000002"

	create(t, db, Notification{UserID: userID, Kind: KindDepositApproved, AmountMinor: &amount, Currency: "PHP", ReferenceType: "deposit", ReferenceID: deposit})
	create(t, db, Notification{UserID: userID, Kind: KindDepositApproved, AmountMinor: &amount, Currency: "PHP", ReferenceType: "deposit", ReferenceID: deposit})
	create(t, db, Notification{UserID: userID, Kind: KindRoundWin, AmountMinor: &amount, Currency: "PHP", ReferenceType: "round", ReferenceID: round})
	create(t, db, Notification{UserID: other, Kind: KindDepositRejected, ReferenceType: "deposit", ReferenceID: round, Detail: "Reference not found"})

	items, total, err := List(ctx, db, userID, 1, 20)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 2 || len(items) != 2 {
		t.Fatalf("listed %d of %d, want the two of this player's: %+v", len(items), total, items)
	}
	if items[0].Kind != KindRoundWin || items[1].Kind != KindDepositApproved {
		t.Fatalf("not newest first: %s then %s", items[0].Kind, items[1].Kind)
	}
	for _, item := range items {
		if item.ReadAt != nil || item.AmountMinor == nil || *item.AmountMinor != amount || item.Currency != "PHP" {
			t.Fatalf("unexpected notification: %+v", item)
		}
	}

	if err := MarkAllRead(ctx, db, userID); err != nil {
		t.Fatalf("mark read: %v", err)
	}
	items, _, err = List(ctx, db, userID, 1, 20)
	if err != nil {
		t.Fatalf("list after marking read: %v", err)
	}
	for _, item := range items {
		if item.ReadAt == nil {
			t.Fatalf("still unread after marking all read: %+v", item)
		}
	}

	theirs, _, err := List(ctx, db, other, 1, 20)
	if err != nil || len(theirs) != 1 || theirs[0].ReadAt != nil || theirs[0].AmountMinor != nil || theirs[0].Currency != "" || theirs[0].Detail != "Reference not found" {
		t.Fatalf("the other player's notification was touched: %+v err=%v", theirs, err)
	}
}
