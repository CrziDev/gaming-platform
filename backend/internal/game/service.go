package game

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/money"
)

type Input struct {
	Slug         string
	Name         string
	Description  string
	CategorySlug string
	Provider     string
	Status       string
	WagerLimits  map[string]WagerLimit
}

type Patch struct {
	Name         *string
	Description  *string
	CategorySlug *string
	Provider     *string
	Status       *string
	WagerLimits  map[string]WagerLimit
}

func Create(ctx context.Context, db *sql.DB, actorID string, in Input) (AdminGame, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: begin create: %w", err)
	}
	defer tx.Rollback()

	g := Game{
		Slug: in.Slug, Name: in.Name, Description: in.Description, CategorySlug: in.CategorySlug,
		Provider: in.Provider, Status: in.Status, WagerLimits: in.WagerLimits,
	}
	if g.Status == "" {
		g.Status = StatusDraft
	}
	if err := validate(ctx, tx, g); err != nil {
		return AdminGame{}, err
	}
	id, err := insert(ctx, tx, g)
	if err != nil {
		return AdminGame{}, err
	}
	created, err := FindByID(ctx, tx, id)
	if err != nil {
		return AdminGame{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "game.create", EntityType: "game", EntityID: id,
		Detail: "Created " + created.Name + " (" + created.Slug + ")",
		After:  snapshot(created.Game),
	}); err != nil {
		return AdminGame{}, err
	}
	if err := tx.Commit(); err != nil {
		return AdminGame{}, fmt.Errorf("game: commit create: %w", err)
	}
	return created, nil
}

func Update(ctx context.Context, db *sql.DB, actorID, id string, patch Patch) (AdminGame, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: begin update: %w", err)
	}
	defer tx.Rollback()

	current, err := findByIDForUpdate(ctx, tx, id)
	if err != nil {
		return AdminGame{}, err
	}
	next := current.Game
	if patch.Name != nil {
		next.Name = *patch.Name
	}
	if patch.Description != nil {
		next.Description = *patch.Description
	}
	if patch.CategorySlug != nil {
		next.CategorySlug = *patch.CategorySlug
	}
	if patch.Provider != nil {
		next.Provider = *patch.Provider
	}
	if patch.Status != nil {
		next.Status = *patch.Status
	}
	if patch.WagerLimits != nil {
		next.WagerLimits = patch.WagerLimits
	}
	if err := validate(ctx, tx, next); err != nil {
		return AdminGame{}, err
	}
	if err := update(ctx, tx, next); err != nil {
		return AdminGame{}, err
	}
	updated, err := FindByID(ctx, tx, id)
	if err != nil {
		return AdminGame{}, err
	}

	action, detail := "game.update", "Updated "+updated.Name+" ("+updated.Slug+")"
	if next.Status != current.Status {
		action = "game.status_change"
		detail = "Changed " + updated.Name + " (" + updated.Slug + ") from " + current.Status + " to " + next.Status
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "game", EntityID: id, Detail: detail,
		Before: snapshot(current.Game), After: snapshot(updated.Game),
	}); err != nil {
		return AdminGame{}, err
	}
	if err := tx.Commit(); err != nil {
		return AdminGame{}, fmt.Errorf("game: commit update: %w", err)
	}
	return updated, nil
}

func validate(ctx context.Context, tx *sql.Tx, g Game) error {
	exists, err := categoryExists(ctx, tx, g.CategorySlug)
	if err != nil {
		return err
	}
	if !exists {
		return ErrNoCategory
	}
	if len(g.WagerLimits) != len(SupportedWagerCurrencies) {
		return ErrWagerLimitsRequired
	}
	for _, currency := range SupportedWagerCurrencies {
		limit, ok := g.WagerLimits[currency]
		if !ok {
			return ErrWagerLimitsRequired
		}
		minorUnits, err := currencyMinorUnits(ctx, tx, currency)
		if err != nil {
			return err
		}
		if !money.IsSafeMinor(limit.MinWagerMinor) || !money.IsSafeMinor(limit.MaxWagerMinor) || !money.IsSafeMinor(limit.WagerStepMinor) || limit.MinWagerMinor <= 0 || limit.WagerStepMinor <= 0 || limit.MaxWagerMinor < limit.MinWagerMinor || (limit.MaxWagerMinor-limit.MinWagerMinor)%limit.WagerStepMinor != 0 {
			return ErrWagerBounds
		}
		unit := int64(1)
		for range minorUnits {
			unit *= 10
		}
		if limit.MinWagerMinor%unit != 0 || limit.MaxWagerMinor%unit != 0 || limit.WagerStepMinor%unit != 0 {
			return ErrWagerNotWholeUnits
		}
	}
	return nil
}

func snapshot(g Game) map[string]any {
	return map[string]any{
		"slug": g.Slug, "name": g.Name, "description": g.Description, "category_slug": g.CategorySlug,
		"provider": g.Provider, "status": g.Status, "wager_limits": g.WagerLimits,
		"rtp_basis_points": g.RTPBasisPoints,
	}
}
