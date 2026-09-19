package game

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/engine"
)

var ErrRTPNotOffered = errors.New("game: that return is not one the engine offers")

// engineOptions is what the console needs from the engines: the returns a slug
// can play. round.Engines satisfies it; declaring it here keeps this package
// from importing round, which imports game.
type engineOptions interface {
	Options(slug string) ([]engine.Option, bool)
}

// SetRTP is the one path that changes the return a game plays at. The value
// must be an option the game's engine ships; setting the value already in
// force changes nothing and writes no audit row.
func SetRTP(ctx context.Context, db *sql.DB, options engineOptions, actorID, id string, basisPoints int) (AdminGame, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: begin set rtp: %w", err)
	}
	defer tx.Rollback()

	current, err := findByIDForUpdate(ctx, tx, id)
	if err != nil {
		return AdminGame{}, err
	}
	if !offers(options, current.Slug, basisPoints) {
		return AdminGame{}, ErrRTPNotOffered
	}
	if current.RTPBasisPoints != nil && *current.RTPBasisPoints == basisPoints {
		return current, nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE games SET rtp_basis_points = $2, updated_at = now() WHERE id = ($1::text)::uuid`, id, basisPoints); err != nil {
		return AdminGame{}, fmt.Errorf("game: set rtp: %w", err)
	}
	updated, err := FindByID(ctx, tx, id)
	if err != nil {
		return AdminGame{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "game.rtp_change", EntityType: "game", EntityID: id,
		Detail: "Changed " + updated.Name + " (" + updated.Slug + ") RTP from " + formatRTP(current.RTPBasisPoints) + " to " + formatRTP(updated.RTPBasisPoints),
		Before: map[string]any{"rtp_basis_points": current.RTPBasisPoints},
		After:  map[string]any{"rtp_basis_points": updated.RTPBasisPoints},
	}); err != nil {
		return AdminGame{}, err
	}
	if err := tx.Commit(); err != nil {
		return AdminGame{}, fmt.Errorf("game: commit set rtp: %w", err)
	}
	return updated, nil
}

func offers(options engineOptions, slug string, basisPoints int) bool {
	for _, option := range optionsFor(options, slug) {
		if option.BasisPoints == basisPoints {
			return true
		}
	}
	return false
}

func optionsFor(options engineOptions, slug string) []engine.Option {
	if options == nil {
		return nil
	}
	offered, _ := options.Options(slug)
	return offered
}

// rtpOptions is the console's list: the basis points alone, ascending, and an
// empty list rather than null for a game no engine on this server plays.
func rtpOptions(options engineOptions, slug string) []int {
	offered := optionsFor(options, slug)
	out := make([]int, 0, len(offered))
	for _, option := range offered {
		out = append(out, option.BasisPoints)
	}
	return out
}

func formatRTP(basisPoints *int) string {
	if basisPoints == nil {
		return "—"
	}
	return fmt.Sprintf("%d.%02d%%", *basisPoints/100, *basisPoints%100)
}
