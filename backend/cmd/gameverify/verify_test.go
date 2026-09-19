package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/rtp"
	"github.com/gaming-platform/backend/internal/testdb"
)

func openVerifyTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := testdb.Open()
	if err != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", err)
		}
		t.Skipf("skipping verify database test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func createDraftProfile(t *testing.T, db *sql.DB, ref string, target int) string {
	t.Helper()
	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	category := "verify-test-" + suffix
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ($1, $2, 999)`, category, "Verify Test "+suffix); err != nil {
		t.Fatalf("create category: %v", err)
	}
	var gameID, profileID string
	if err := db.QueryRow(`
		INSERT INTO games (slug, name, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ($1, $2, $3, 'Test', 'draft', 'under_review', 'PHP', 100, 1000, 100)
		RETURNING id::text`, "verify-game-"+suffix, "Verify Game "+suffix, category).Scan(&gameID); err != nil {
		t.Fatalf("create game: %v", err)
	}
	if err := db.QueryRow(`
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref)
		VALUES (($1::text)::uuid, 'Baseline', 1, $2, 'draft', $3)
		RETURNING id::text`, gameID, target, ref).Scan(&profileID); err != nil {
		t.Fatalf("create draft: %v", err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_id = $1`, profileID)
		_, _ = db.Exec(`DELETE FROM rtp_profiles WHERE id = ($1::text)::uuid`, profileID)
		_, _ = db.Exec(`DELETE FROM games WHERE id = ($1::text)::uuid`, gameID)
		_, _ = db.Exec(`DELETE FROM game_categories WHERE slug = $1`, category)
	})
	return profileID
}

func TestVerifyProfileMarksADraftVerifiedFromItsOwnConfiguration(t *testing.T) {
	db := openVerifyTestDB(t)
	id := createDraftProfile(t, db, "plinko/v1/9600", 9600)
	var out bytes.Buffer
	if err := verifyProfile(context.Background(), db, &out, id, 20_000, 100, 10_000); err != nil {
		t.Fatalf("verify: %v\n%s", err, out.String())
	}
	profile, err := rtp.FindByID(context.Background(), db, id)
	if err != nil {
		t.Fatal(err)
	}
	if profile.Status != rtp.StatusVerified || profile.TheoreticalBasisPoints == nil || *profile.TheoreticalBasisPoints != 9600 || profile.ObservedBasisPoints == nil {
		t.Fatalf("profile = %+v", profile)
	}
	if !strings.Contains(out.String(), "Verified Baseline v1 (plinko/v1/9600)") {
		t.Fatalf("output:\n%s", out.String())
	}
	if err := verifyProfile(context.Background(), db, &out, id, 1_000, 100, 10_000); !errors.Is(err, rtp.ErrNotDraft) {
		t.Fatalf("second verify: want %v, got %v", rtp.ErrNotDraft, err)
	}
}

func TestVerifyProfileLeavesTheDraftWhenTheTargetDoesNotMatch(t *testing.T) {
	db := openVerifyTestDB(t)
	id := createDraftProfile(t, db, "plinko/v1/9600", 9700)
	var out bytes.Buffer
	if err := verifyProfile(context.Background(), db, &out, id, 1_000, 100, 10_000); err == nil {
		t.Fatal("a 9700 target must not verify a 9600 configuration")
	}
	profile, err := rtp.FindByID(context.Background(), db, id)
	if err != nil {
		t.Fatal(err)
	}
	if profile.Status != rtp.StatusDraft || profile.VerifiedAt != nil {
		t.Fatalf("profile = %+v", profile)
	}
}

func TestVerifyProfileRefusesAnUnknownConfiguration(t *testing.T) {
	db := openVerifyTestDB(t)
	id := createDraftProfile(t, db, "plinko/v9/none", 9600)
	if err := verifyProfile(context.Background(), db, &bytes.Buffer{}, id, 1_000, 100, 100); err == nil {
		t.Fatal("expected an unknown configuration error")
	}
}
