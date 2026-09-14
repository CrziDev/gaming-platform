package rtp

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

	"github.com/gaming-platform/backend/internal/testdb"
)

var (
	rtpTestDBOnce sync.Once
	rtpTestDB     *sql.DB
	rtpTestDBErr  error
	rtpTestSeq    atomic.Uint64
)

func openRTPTestDB(t *testing.T) *sql.DB {
	t.Helper()
	rtpTestDBOnce.Do(func() {
		rtpTestDB, rtpTestDBErr = testdb.Open()
	})
	if rtpTestDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", rtpTestDBErr)
		}
		t.Skipf("skipping RTP database test: %v", rtpTestDBErr)
	}
	return rtpTestDB
}

type rtpFixture struct {
	GameID      string
	DefaultID   string
	TemporaryID string
}

func createRTPFixture(t *testing.T, db *sql.DB) rtpFixture {
	t.Helper()
	suffix := fmt.Sprintf("%d-%d", time.Now().UnixNano(), rtpTestSeq.Add(1))
	category := "rtp-test-" + suffix
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ($1, $2, 999)`, category, "RTP Test "+suffix); err != nil {
		t.Fatalf("create category: %v", err)
	}

	var fixture rtpFixture
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ($1, $2, $3, 'Test', 'draft', 'unreviewed', 'PHP', 100, 1000, 100)
		RETURNING id::text`, "rtp-game-"+suffix, "RTP Game "+suffix, category).Scan(&fixture.GameID); err != nil {
		t.Fatalf("create game: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref, observed_basis_points, verified_at)
		VALUES (($1::text)::uuid, 'Standard', 1, 9600, 'verified', 'test:standard', 9600, now())
		RETURNING id::text`, fixture.GameID).Scan(&fixture.DefaultID); err != nil {
		t.Fatalf("create default profile: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref, observed_basis_points, verified_at)
		VALUES (($1::text)::uuid, 'Promotion', 1, 10200, 'verified', 'test:promotion', 10200, now())
		RETURNING id::text`, fixture.GameID).Scan(&fixture.TemporaryID); err != nil {
		t.Fatalf("create temporary profile: %v", err)
	}

	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_id IN ($1, $2)`, fixture.DefaultID, fixture.TemporaryID)
		_, _ = db.Exec(`DELETE FROM rtp_profiles WHERE game_id = ($1::text)::uuid`, fixture.GameID)
		_, _ = db.Exec(`DELETE FROM games WHERE id = ($1::text)::uuid`, fixture.GameID)
		_, _ = db.Exec(`DELETE FROM game_categories WHERE slug = $1`, category)
	})
	return fixture
}

func activateTemporaryRTP(t *testing.T, db *sql.DB, fixture rtpFixture, until time.Time) {
	t.Helper()
	baseline, err := Activate(context.Background(), db, "", fixture.DefaultID, Schedule{})
	if err != nil {
		t.Fatalf("activate default: %v", err)
	}
	if !baseline.IsDefault || baseline.Status != StatusActive {
		t.Fatalf("default activation = %+v", baseline)
	}
	temporary, err := Activate(context.Background(), db, "", fixture.TemporaryID, Schedule{Until: &until})
	if err != nil {
		t.Fatalf("activate temporary: %v", err)
	}
	if temporary.IsDefault || temporary.Status != StatusActive {
		t.Fatalf("temporary activation = %+v", temporary)
	}
}

func TestRevertExpiredRestoresDefaultOnceAndAudits(t *testing.T) {
	db := openRTPTestDB(t)
	fixture := createRTPFixture(t, db)
	expires := time.Now().UTC().Add(time.Hour)
	activateTemporaryRTP(t, db, fixture, expires)

	count, err := RevertExpired(context.Background(), db, expires.Add(-time.Second))
	if err != nil || count != 0 {
		t.Fatalf("revert before expiry: count=%d err=%v", count, err)
	}
	count, err = RevertExpired(context.Background(), db, expires)
	if err != nil || count != 1 {
		t.Fatalf("revert at expiry: count=%d err=%v", count, err)
	}
	count, err = RevertExpired(context.Background(), db, expires.Add(time.Hour))
	if err != nil || count != 0 {
		t.Fatalf("retry reversion: count=%d err=%v", count, err)
	}

	baseline, err := FindByID(context.Background(), db, fixture.DefaultID)
	if err != nil {
		t.Fatalf("read default: %v", err)
	}
	temporary, err := FindByID(context.Background(), db, fixture.TemporaryID)
	if err != nil {
		t.Fatalf("read temporary: %v", err)
	}
	if baseline.Status != StatusActive || !baseline.IsDefault || baseline.EffectiveUntil != nil {
		t.Fatalf("restored default = %+v", baseline)
	}
	if temporary.Status != StatusVerified || temporary.IsDefault || temporary.EffectiveFrom != nil || temporary.EffectiveUntil != nil {
		t.Fatalf("expired profile = %+v", temporary)
	}

	var audits int
	var actorIsSystem bool
	var beforeExpired, beforeDefault, afterExpired, afterDefault string
	if err := db.QueryRow(`
		SELECT count(*), bool_and(actor_user_id IS NULL),
		       min(before_data->'expired'->>'status'), min(before_data->'default'->>'status'),
		       min(after_data->'expired'->>'status'), min(after_data->'default'->>'status')
		FROM audit_logs
		WHERE action = 'rtp_profile.revert' AND entity_id = $1`, fixture.TemporaryID).Scan(
		&audits, &actorIsSystem, &beforeExpired, &beforeDefault, &afterExpired, &afterDefault,
	); err != nil {
		t.Fatalf("read reversion audit: %v", err)
	}
	if audits != 1 || !actorIsSystem || beforeExpired != StatusActive || beforeDefault != StatusVerified || afterExpired != StatusVerified || afterDefault != StatusActive {
		t.Fatalf("unexpected reversion audit: count=%d system=%t statuses=%q/%q -> %q/%q", audits, actorIsSystem, beforeExpired, beforeDefault, afterExpired, afterDefault)
	}
}

func TestTimedActivationRequiresDifferentVerifiedDefault(t *testing.T) {
	db := openRTPTestDB(t)
	fixture := createRTPFixture(t, db)
	expires := time.Now().UTC().Add(time.Hour)

	if _, err := Activate(context.Background(), db, "", fixture.TemporaryID, Schedule{Until: &expires}); !errors.Is(err, ErrDefaultRequired) {
		t.Fatalf("timed activation: want %v, got %v", ErrDefaultRequired, err)
	}
	profile, err := FindByID(context.Background(), db, fixture.TemporaryID)
	if err != nil {
		t.Fatalf("read temporary: %v", err)
	}
	if profile.Status != StatusVerified || profile.EffectiveUntil != nil {
		t.Fatalf("rejected activation changed profile: %+v", profile)
	}
}

func TestRevertExpiredRefusesToGuessAFallback(t *testing.T) {
	db := openRTPTestDB(t)
	fixture := createRTPFixture(t, db)
	expires := time.Now().UTC().Add(-time.Minute)
	if _, err := db.Exec(`
		UPDATE rtp_profiles
		SET status = 'active', effective_until = $2
		WHERE id = ($1::text)::uuid`, fixture.TemporaryID, expires); err != nil {
		t.Fatalf("create legacy expired profile: %v", err)
	}

	if _, err := RevertExpired(context.Background(), db, time.Now().UTC()); !errors.Is(err, ErrDefaultRequired) {
		t.Fatalf("reversion without default: want %v, got %v", ErrDefaultRequired, err)
	}
	profile, err := FindByID(context.Background(), db, fixture.TemporaryID)
	if err != nil {
		t.Fatalf("read temporary: %v", err)
	}
	if profile.Status != StatusActive {
		t.Fatalf("unsafe fallback changed profile: %+v", profile)
	}
}

func TestConcurrentRevertersProduceOneTransition(t *testing.T) {
	db := openRTPTestDB(t)
	fixture := createRTPFixture(t, db)
	expires := time.Now().UTC().Add(time.Hour)
	activateTemporaryRTP(t, db, fixture, expires)

	start := make(chan struct{})
	counts := make(chan int, 2)
	errs := make(chan error, 2)
	var wait sync.WaitGroup
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			count, err := RevertExpired(context.Background(), db, expires)
			counts <- count
			errs <- err
		}()
	}
	close(start)
	wait.Wait()
	close(counts)
	close(errs)

	total := 0
	for count := range counts {
		total += count
	}
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent reversion: %v", err)
		}
	}
	if total != 1 {
		t.Fatalf("total transitions = %d, want 1", total)
	}
	var audits int
	if err := db.QueryRow(`SELECT count(*) FROM audit_logs WHERE action = 'rtp_profile.revert' AND entity_id = $1`, fixture.TemporaryID).Scan(&audits); err != nil {
		t.Fatalf("count audits: %v", err)
	}
	if audits != 1 {
		t.Fatalf("reversion audits = %d, want 1", audits)
	}
}
