package game

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/gaming-platform/backend/internal/audit"
)

type Input struct {
	Slug           string
	Name           string
	Description    string
	CategorySlug   string
	Provider       string
	Status         string
	Currency       string
	MinWagerMinor  int64
	MaxWagerMinor  int64
	WagerStepMinor int64
}

type Patch struct {
	Name           *string
	Description    *string
	CategorySlug   *string
	Provider       *string
	Status         *string
	Currency       *string
	MinWagerMinor  *int64
	MaxWagerMinor  *int64
	WagerStepMinor *int64
}

func Create(ctx context.Context, db *sql.DB, actorID string, in Input) (AdminGame, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: begin create: %w", err)
	}
	defer tx.Rollback()

	g := Game{
		Slug: in.Slug, Name: in.Name, Description: in.Description, CategorySlug: in.CategorySlug,
		Provider: in.Provider, Status: in.Status, Currency: in.Currency,
		MinWagerMinor: in.MinWagerMinor, MaxWagerMinor: in.MaxWagerMinor, WagerStepMinor: in.WagerStepMinor,
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
	if patch.Currency != nil {
		next.Currency = *patch.Currency
	}
	if patch.MinWagerMinor != nil {
		next.MinWagerMinor = *patch.MinWagerMinor
	}
	if patch.MaxWagerMinor != nil {
		next.MaxWagerMinor = *patch.MaxWagerMinor
	}
	if patch.WagerStepMinor != nil {
		next.WagerStepMinor = *patch.WagerStepMinor
	}

	if next.Currency != current.Currency {
		played, err := hasRounds(ctx, tx, id)
		if err != nil {
			return AdminGame{}, err
		}
		if played {
			return AdminGame{}, ErrCurrencyLocked
		}
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
	minorUnits, err := currencyMinorUnits(ctx, tx, g.Currency)
	if err != nil {
		return err
	}
	if g.MinWagerMinor <= 0 || g.WagerStepMinor <= 0 || g.MaxWagerMinor < g.MinWagerMinor || (g.MaxWagerMinor-g.MinWagerMinor)%g.WagerStepMinor != 0 {
		return ErrWagerBounds
	}
	unit := int64(1)
	for range minorUnits {
		unit *= 10
	}
	if g.MinWagerMinor%unit != 0 || g.MaxWagerMinor%unit != 0 || g.WagerStepMinor%unit != 0 {
		return ErrWagerNotWholeUnits
	}
	return nil
}

func snapshot(g Game) map[string]any {
	return map[string]any{
		"slug": g.Slug, "name": g.Name, "description": g.Description, "category_slug": g.CategorySlug,
		"provider": g.Provider, "status": g.Status, "currency": g.Currency,
		"min_wager_minor": g.MinWagerMinor, "max_wager_minor": g.MaxWagerMinor, "wager_step_minor": g.WagerStepMinor,
	}
}
