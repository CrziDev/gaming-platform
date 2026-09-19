package main

import (
	"context"
	"database/sql"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/gaming-platform/backend/internal/engine/plinko"
	"github.com/gaming-platform/backend/internal/rtp"
)

// verify simulates the configuration a draft profile references and, only when
// every board is within tolerance, records the evidence and marks it verified.
func verify(args []string) error {
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	profileID := flags.String("profile", "", "id of the draft RTP profile to verify")
	rounds := flags.Int64("rounds", defaultRounds, "rounds to play on every board")
	stake := flags.Int64("stake", defaultStake, "stake per round in minor units")
	tolerance := flags.Int("tolerance", defaultTolerance, "largest accepted distance from the target, in basis points")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *profileID == "" {
		return errors.New("verify: -profile is required")
	}
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("verify: DATABASE_URL is required")
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("verify: open database: %w", err)
	}
	defer db.Close()
	return verifyProfile(context.Background(), db, os.Stdout, *profileID, *rounds, *stake, *tolerance)
}

// databaseTimeout bounds each database call on its own; the simulation between
// them is CPU-bound and may run for hours at the default sample size.
const databaseTimeout = time.Minute

func verifyProfile(ctx context.Context, db *sql.DB, out io.Writer, profileID string, rounds, stake int64, tolerance int) error {
	profile, err := findDraft(ctx, db, profileID)
	if err != nil {
		return err
	}
	config, err := plinko.ProfileByRef(profile.EngineConfigRef)
	if err != nil {
		return err
	}
	result, err := runSimulation(config, profile.TargetBasisPoints, rounds, stake, tolerance)
	if err != nil {
		return err
	}
	writeReport(out, result)
	if failures := result.failures(); len(failures) > 0 {
		return fmt.Errorf("verify: %d of %d boards are outside %d bp of the %d bp target; profile left as draft", len(failures), len(result.Boards), tolerance, profile.TargetBasisPoints)
	}

	verified, err := recordVerification(ctx, db, profile.ID, rtp.Evidence{
		EngineConfigRef: config.Ref, Method: method, SampleSize: result.SampleSize,
		TheoreticalBasisPoints: result.TheoreticalBasisPoints, ObservedBasisPoints: result.ObservedBasisPoints,
		ToleranceBasisPoints: tolerance,
	})
	if err != nil {
		return err
	}
	fmt.Fprintf(out, "\nVerified %s v%d (%s) for %s at %s.\n", verified.Name, verified.Version, verified.EngineConfigRef, verified.GameName, verified.VerifiedAt.UTC().Format(time.RFC3339))
	return nil
}

func findDraft(ctx context.Context, db *sql.DB, profileID string) (rtp.Profile, error) {
	ctx, cancel := context.WithTimeout(ctx, databaseTimeout)
	defer cancel()
	profile, err := rtp.FindByID(ctx, db, profileID)
	if err != nil {
		return rtp.Profile{}, err
	}
	if profile.Status != rtp.StatusDraft {
		return rtp.Profile{}, rtp.ErrNotDraft
	}
	return profile, nil
}

func recordVerification(ctx context.Context, db *sql.DB, profileID string, evidence rtp.Evidence) (rtp.Profile, error) {
	ctx, cancel := context.WithTimeout(ctx, databaseTimeout)
	defer cancel()
	return rtp.Verify(ctx, db, profileID, evidence)
}
