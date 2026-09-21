package announcement

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/testdb"
)

var (
	announcementDBOnce sync.Once
	announcementDB     *sql.DB
	announcementDBErr  error
	announcementSeq    atomic.Uint64
)

func announcementTestDB(t *testing.T) *sql.DB {
	t.Helper()
	announcementDBOnce.Do(func() { announcementDB, announcementDBErr = testdb.Open() })
	if announcementDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", announcementDBErr)
		}
		t.Skipf("skipping announcement database test: %v", announcementDBErr)
	}
	return announcementDB
}

func announcementActor(t *testing.T, db *sql.DB) string {
	t.Helper()
	email := fmt.Sprintf("announcement-%d-%d@example.com", os.Getpid(), announcementSeq.Add(1))
	var id string
	if err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name, role)
		VALUES ($1, 'test-hash', 'Announcement Operator', 'admin') RETURNING id::text`, email).Scan(&id); err != nil {
		t.Fatalf("create actor: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE actor_user_id = ($1::text)::uuid`, id)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, id)
	})
	return id
}

func TestAnnouncementLifecycleIsAudited(t *testing.T) {
	db := announcementTestDB(t)
	actorID := announcementActor(t, db)
	ctx := context.Background()
	end := time.Now().UTC().Add(24 * time.Hour)

	created, err := Create(ctx, db, actorID, "Original notice", nil)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM announcements WHERE id = ($1::text)::uuid`, created.ID) })

	updated, err := Update(ctx, db, actorID, created.ID, "Updated notice", &end)
	if err != nil || updated.Text != "Updated notice" || updated.EndsAt == nil {
		t.Fatalf("update: item=%+v err=%v", updated, err)
	}
	disabled, err := SetEnabled(ctx, db, actorID, created.ID, false, time.Now())
	if err != nil || disabled.Enabled {
		t.Fatalf("disable: item=%+v err=%v", disabled, err)
	}
	enabled, err := SetEnabled(ctx, db, actorID, created.ID, true, time.Now())
	if err != nil || !enabled.Enabled {
		t.Fatalf("enable: item=%+v err=%v", enabled, err)
	}
	if _, err := Update(ctx, db, actorID, created.ID, enabled.Text, enabled.EndsAt); err != nil {
		t.Fatalf("repeat update: %v", err)
	}
	if _, err := SetEnabled(ctx, db, actorID, created.ID, true, time.Now()); err != nil {
		t.Fatalf("repeat enable: %v", err)
	}

	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE entity_type = 'announcement' AND entity_id = $1`, created.ID).Scan(&audits); err != nil {
		t.Fatalf("count audits: %v", err)
	}
	if audits != 4 {
		t.Fatalf("audit count = %d, want 4", audits)
	}
}

func TestListActiveExcludesDisabledAndEndedAnnouncements(t *testing.T) {
	db := announcementTestDB(t)
	now := time.Now().UTC().Truncate(time.Second)
	ids := make([]string, 0, 4)
	insert := func(text string, enabled bool, endsAt *time.Time, createdAt time.Time) string {
		var id string
		if err := db.QueryRow(`INSERT INTO announcements (text, enabled, ends_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $4) RETURNING id::text`, text, enabled, endsAt, createdAt).Scan(&id); err != nil {
			t.Fatalf("insert %s: %v", text, err)
		}
		ids = append(ids, id)
		return id
	}
	future := now.Add(time.Hour)
	permanentID := insert("Permanent", true, nil, now.Add(-time.Minute))
	futureID := insert("Future", true, &future, now)
	insert("Ended", true, &now, now.Add(time.Minute))
	insert("Disabled", false, nil, now.Add(2*time.Minute))
	t.Cleanup(func() {
		for _, id := range ids {
			_, _ = db.Exec(`DELETE FROM announcements WHERE id = ($1::text)::uuid`, id)
		}
	})

	items, total, err := ListActive(context.Background(), db, 1, 20, now)
	if err != nil {
		t.Fatalf("list active: %v", err)
	}
	if total < 2 || len(items) < 2 {
		t.Fatalf("active total=%d rows=%d, want fixtures", total, len(items))
	}
	positions := map[string]int{}
	for index, item := range items {
		positions[item.ID] = index
	}
	if _, ok := positions[permanentID]; !ok {
		t.Fatal("permanent announcement missing")
	}
	if _, ok := positions[futureID]; !ok {
		t.Fatal("future announcement missing")
	}
	if positions[futureID] >= positions[permanentID] {
		t.Fatal("active announcements are not newest first")
	}
}
