package main

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/engine/plinko"
	"github.com/gaming-platform/backend/internal/testdb"
)

func openSeedTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := testdb.Open()
	if err != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", err)
		}
		t.Skipf("skipping seed database test: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// beginSeed runs the catalogue seed inside a transaction the test never
// commits, so the test database is left exactly as it was found.
func beginSeed(t *testing.T, db *sql.DB) (context.Context, *sql.Tx) {
	t.Helper()
	ctx := context.Background()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback() })
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed catalogue: %v", err)
	}
	return ctx, tx
}

type seededProfile struct {
	ID                     string
	EngineConfigRef        string
	TargetBasisPoints      int
	TheoreticalBasisPoints int
	ObservedBasisPoints    int
	VerificationMethod     string
	SampleSize             int64
	VerifiedAt             time.Time
}

func activeProfiles(t *testing.T, ctx context.Context, tx *sql.Tx, gameID string) []seededProfile {
	t.Helper()
	rows, err := tx.QueryContext(ctx, `
		SELECT id::text, engine_config_ref, target_basis_points, theoretical_basis_points, observed_basis_points, verification_method, sample_size, verified_at
		  FROM rtp_profiles
		 WHERE game_id = ($1::text)::uuid AND status = 'active'`, gameID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []seededProfile
	for rows.Next() {
		var p seededProfile
		if err := rows.Scan(&p.ID, &p.EngineConfigRef, &p.TargetBasisPoints, &p.TheoreticalBasisPoints, &p.ObservedBasisPoints, &p.VerificationMethod, &p.SampleSize, &p.VerifiedAt); err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return out
}

// resolveConfig is the engine lookup a round would make for the seeded
// reference; a fixture whose reference no engine knows would fail every round.
func resolveConfig(t *testing.T, gameSlug, ref string) {
	t.Helper()
	switch gameSlug {
	case "plinko":
		if _, err := plinko.ProfileByRef(ref); err != nil {
			t.Fatalf("%s: %v", gameSlug, err)
		}
	default:
		t.Fatalf("%s: no engine resolves its seeded configuration", gameSlug)
	}
}

func TestSeedCatalogueLeavesEachIntegratedGameOneResolvableActiveDefault(t *testing.T) {
	db := openSeedTestDB(t)
	ctx, tx := beginSeed(t, db)

	for _, want := range profiles {
		var gameID, integration, status string
		var defaultID sql.NullString
		if err := tx.QueryRowContext(ctx, `SELECT id::text, integration, status, default_rtp_profile_id::text FROM games WHERE slug = $1`, want.gameSlug).
			Scan(&gameID, &integration, &status, &defaultID); err != nil {
			t.Fatalf("%s: %v", want.gameSlug, err)
		}
		if integration != "integrated" || status != "active" {
			t.Fatalf("%s: integration %q status %q", want.gameSlug, integration, status)
		}
		active := activeProfiles(t, ctx, tx, gameID)
		if len(active) != 1 {
			t.Fatalf("%s: %d active profiles", want.gameSlug, len(active))
		}
		got := active[0]
		resolveConfig(t, want.gameSlug, got.EngineConfigRef)
		if got.EngineConfigRef != want.engineConfigRef || got.TargetBasisPoints != want.targetBasisPoints ||
			got.TheoreticalBasisPoints != want.theoreticalBasisPoints || got.ObservedBasisPoints != want.observedBasisPoints ||
			got.VerificationMethod != want.verificationMethod || got.SampleSize != want.sampleSize || got.VerifiedAt.IsZero() {
			t.Fatalf("%s: seeded %+v, want %+v", want.gameSlug, got, want)
		}
		if !defaultID.Valid || defaultID.String != got.ID {
			t.Fatalf("%s: default profile %v, active %s", want.gameSlug, defaultID, got.ID)
		}

		if err := seedCatalogue(ctx, tx); err != nil {
			t.Fatalf("second seed: %v", err)
		}
		again := activeProfiles(t, ctx, tx, gameID)
		if len(again) != 1 || again[0].ID != got.ID || !again[0].VerifiedAt.Equal(got.VerifiedAt) {
			t.Fatalf("%s: a second seed changed the active profile: %+v", want.gameSlug, again)
		}
	}
}

func TestSeedCatalogueRemovesTheLegacyPlinkoOnlyWhenNothingReferencesIt(t *testing.T) {
	db := openSeedTestDB(t)
	ctx, tx := beginSeed(t, db)
	const insertLegacy = `
		INSERT INTO games (slug, name, category_slug, provider, status, integration, currency, min_wager_minor, max_wager_minor, wager_step_minor)
		VALUES ('plinko-drop', 'Plinko Drop', 'originals', 'In-house', 'active', 'supported', 'PHP', 100, 500000, 100)
		RETURNING id::text`
	legacyCount := func() int {
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM games WHERE slug = 'plinko-drop'`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}

	var unreferenced string
	if err := tx.QueryRowContext(ctx, insertLegacy).Scan(&unreferenced); err != nil {
		t.Fatal(err)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed with an unreferenced legacy row: %v", err)
	}
	if legacyCount() != 0 {
		t.Fatal("an unreferenced plinko-drop row survived the seed")
	}

	var referenced string
	if err := tx.QueryRowContext(ctx, insertLegacy).Scan(&referenced); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status)
		VALUES (($1::text)::uuid, 'Draft', 1, 9600, 'draft')`, referenced); err != nil {
		t.Fatal(err)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		t.Fatalf("seed with a legacy row that has a profile: %v", err)
	}
	if legacyCount() != 1 {
		t.Fatal("a plinko-drop row with an RTP profile was removed")
	}
}
