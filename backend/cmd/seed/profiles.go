package main

import (
	"context"
	"database/sql"
	"fmt"
)

// A verified, active profile for each integrated game, carrying the evidence of
// the recorded verification run so a development database plays the same
// configuration production would. Production profiles are verified by
// gameverify and activated through the admin console; this is the fixture.
type profile struct {
	gameSlug               string
	name                   string
	version                int
	targetBasisPoints      int
	engineConfigRef        string
	theoreticalBasisPoints int
	observedBasisPoints    int
	verificationMethod     string
	sampleSize             int64
}

// Evidence from docs/games/plinko-rtp.md §11.
var profiles = []profile{
	{gameSlug: "plinko", name: "Baseline", version: 1, targetBasisPoints: 9600, engineConfigRef: "plinko/v1/9600",
		theoreticalBasisPoints: 9600, observedBasisPoints: 9600, verificationMethod: "simulation", sampleSize: 2_700_000_000},
}

const demoteOtherActiveProfiles = `
	UPDATE rtp_profiles
	   SET status = 'verified', effective_from = NULL, effective_until = NULL, updated_at = now()
	 WHERE game_id = (SELECT id FROM games WHERE slug = $1)
	   AND status = 'active'
	   AND NOT (name = $2 AND version = $3)`

const upsertProfile = `
	INSERT INTO rtp_profiles (
		game_id, name, version, target_basis_points, status, engine_config_ref,
		theoretical_basis_points, observed_basis_points, verification_method, sample_size, verified_at)
	SELECT id, $2, $3, $4, 'active', $5, $6, $7, $8, $9, now()
	  FROM games WHERE slug = $1
	ON CONFLICT (game_id, name, version) DO UPDATE
	   SET target_basis_points      = EXCLUDED.target_basis_points,
	       status                   = 'active',
	       engine_config_ref        = EXCLUDED.engine_config_ref,
	       theoretical_basis_points = EXCLUDED.theoretical_basis_points,
	       observed_basis_points    = EXCLUDED.observed_basis_points,
	       verification_method      = EXCLUDED.verification_method,
	       sample_size              = EXCLUDED.sample_size,
	       verified_at              = COALESCE(rtp_profiles.verified_at, EXCLUDED.verified_at),
	       effective_from           = NULL,
	       effective_until          = NULL,
	       updated_at               = now()
	RETURNING id::text`

const setDefaultProfile = `
	UPDATE games SET default_rtp_profile_id = ($2::text)::uuid, updated_at = now() WHERE slug = $1`

func seedProfiles(ctx context.Context, tx *sql.Tx) error {
	for _, p := range profiles {
		if _, err := tx.ExecContext(ctx, demoteOtherActiveProfiles, p.gameSlug, p.name, p.version); err != nil {
			return fmt.Errorf("seed: demote active profiles for %s: %w", p.gameSlug, err)
		}
		var id string
		if err := tx.QueryRowContext(ctx, upsertProfile,
			p.gameSlug, p.name, p.version, p.targetBasisPoints, p.engineConfigRef,
			p.theoreticalBasisPoints, p.observedBasisPoints, p.verificationMethod, p.sampleSize,
		).Scan(&id); err != nil {
			return fmt.Errorf("seed: upsert profile %s for %s: %w", p.name, p.gameSlug, err)
		}
		if _, err := tx.ExecContext(ctx, setDefaultProfile, p.gameSlug, id); err != nil {
			return fmt.Errorf("seed: set default profile for %s: %w", p.gameSlug, err)
		}
	}
	return nil
}
