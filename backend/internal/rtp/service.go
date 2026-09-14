package rtp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/gaming-platform/backend/internal/audit"
)

type DraftInput struct {
	Name              string
	Version           int
	TargetBasisPoints int
	EngineConfigRef   string
}

type DraftPatch struct {
	Name              *string
	Version           *int
	TargetBasisPoints *int
	EngineConfigRef   *string
}

type Schedule struct {
	From  *time.Time
	Until *time.Time
}

func CreateDraft(ctx context.Context, db *sql.DB, actorID, gameID string, in DraftInput) (Profile, error) {
	if !Targets[in.TargetBasisPoints] {
		return Profile{}, ErrTargetUnsupported
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Profile{}, fmt.Errorf("rtp: begin create: %w", err)
	}
	defer tx.Rollback()

	if err := lockGame(ctx, tx, gameID); err != nil {
		return Profile{}, err
	}
	id, err := insert(ctx, tx, Profile{
		GameID: gameID, Name: in.Name, Version: in.Version, TargetBasisPoints: in.TargetBasisPoints,
		EngineConfigRef: in.EngineConfigRef, CreatedBy: actorID,
	})
	if err != nil {
		return Profile{}, err
	}
	created, err := FindByID(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "rtp_profile.create", EntityType: "rtp_profile", EntityID: id,
		Detail: "Drafted " + describe(created) + " for " + created.GameName,
		After:  snapshot(created),
	}); err != nil {
		return Profile{}, err
	}
	if err := tx.Commit(); err != nil {
		return Profile{}, fmt.Errorf("rtp: commit create: %w", err)
	}
	return created, nil
}

func UpdateDraft(ctx context.Context, db *sql.DB, actorID, id string, patch DraftPatch) (Profile, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Profile{}, fmt.Errorf("rtp: begin update: %w", err)
	}
	defer tx.Rollback()

	current, err := findByIDForUpdate(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if current.Status != StatusDraft {
		return Profile{}, ErrNotDraft
	}
	next := current
	if patch.Name != nil {
		next.Name = *patch.Name
	}
	if patch.Version != nil {
		next.Version = *patch.Version
	}
	if patch.TargetBasisPoints != nil {
		next.TargetBasisPoints = *patch.TargetBasisPoints
	}
	if patch.EngineConfigRef != nil {
		next.EngineConfigRef = *patch.EngineConfigRef
	}
	if !Targets[next.TargetBasisPoints] {
		return Profile{}, ErrTargetUnsupported
	}
	if err := updateDraft(ctx, tx, next); err != nil {
		return Profile{}, err
	}
	updated, err := FindByID(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "rtp_profile.update", EntityType: "rtp_profile", EntityID: id,
		Detail: "Edited draft " + describe(updated) + " for " + updated.GameName,
		Before: snapshot(current), After: snapshot(updated),
	}); err != nil {
		return Profile{}, err
	}
	if err := tx.Commit(); err != nil {
		return Profile{}, fmt.Errorf("rtp: commit update: %w", err)
	}
	return updated, nil
}

// Activate puts a verified profile in force for its game, moving the profile it
// replaces back to verified so it remains a valid version to revert to. Calling
// it on the profile already in force only changes the schedule.
func Activate(ctx context.Context, db *sql.DB, actorID, id string, schedule Schedule) (Profile, error) {
	if schedule.From != nil && schedule.Until != nil && !schedule.Until.After(*schedule.From) {
		return Profile{}, ErrScheduleOrder
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Profile{}, fmt.Errorf("rtp: begin activate: %w", err)
	}
	defer tx.Rollback()

	// The game row is the lock every activation takes first, so two operators
	// activating different profiles of one game queue instead of deadlocking on
	// each other's profile rows.
	peek, err := FindByID(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if err := lockGame(ctx, tx, peek.GameID); err != nil {
		return Profile{}, err
	}
	current, err := findByIDForUpdate(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if current.Status != StatusVerified && current.Status != StatusActive {
		return Profile{}, ErrNotVerified
	}
	if current.TargetBasisPoints >= NegativeMarginBasisPoints && schedule.Until == nil {
		return Profile{}, ErrEndRequired
	}

	action, detail := "rtp_profile.activate", "Activated "+describe(current)+" for "+current.GameName
	var replaced Profile
	var found bool
	if current.Status == StatusActive {
		action, detail = "rtp_profile.schedule", "Rescheduled "+describe(current)+" for "+current.GameName
	} else {
		replaced, found, err = activeForGame(ctx, tx, current.GameID)
		if err != nil {
			return Profile{}, err
		}
		if found {
			if err := setStatus(ctx, tx, replaced.ID, StatusVerified, nil, nil); err != nil {
				return Profile{}, err
			}
			detail += ", replacing " + describe(replaced)
		}
	}
	defaultID, err := defaultForGame(ctx, tx, current.GameID)
	if err != nil {
		return Profile{}, err
	}
	if schedule.Until == nil {
		defaultID = id
		if err := setDefaultForGame(ctx, tx, current.GameID, id); err != nil {
			return Profile{}, err
		}
	} else {
		if defaultID == "" && found && replaced.EffectiveUntil == nil {
			defaultID = replaced.ID
			if err := setDefaultForGame(ctx, tx, current.GameID, defaultID); err != nil {
				return Profile{}, err
			}
		}
		if defaultID == "" || defaultID == id {
			return Profile{}, ErrDefaultRequired
		}
		fallback, err := findByIDForUpdate(ctx, tx, defaultID)
		if errors.Is(err, ErrNoProfile) {
			return Profile{}, ErrDefaultRequired
		}
		if err != nil {
			return Profile{}, err
		}
		if fallback.GameID != current.GameID || fallback.Status != StatusVerified {
			return Profile{}, ErrDefaultRequired
		}
	}
	if err := setStatus(ctx, tx, id, StatusActive, schedule.From, schedule.Until); err != nil {
		return Profile{}, err
	}
	activated, err := FindByID(ctx, tx, id)
	if err != nil {
		return Profile{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "rtp_profile", EntityID: id, Detail: detail,
		Before: snapshot(current), After: snapshot(activated),
	}); err != nil {
		return Profile{}, err
	}
	if err := tx.Commit(); err != nil {
		return Profile{}, fmt.Errorf("rtp: commit activate: %w", err)
	}
	return activated, nil
}

// RevertExpired changes every expired timed profile back to verified and
// restores its game's verified default. Each game is serialized independently.
func RevertExpired(ctx context.Context, db *sql.DB, now time.Time) (int, error) {
	gameIDs, err := expiredGameIDs(ctx, db, now)
	if err != nil {
		return 0, err
	}
	reverted := 0
	var reversionErrors []error
	for _, gameID := range gameIDs {
		didRevert, err := revertExpiredForGame(ctx, db, gameID, now)
		if err != nil {
			reversionErrors = append(reversionErrors, fmt.Errorf("game %s: %w", gameID, err))
			continue
		}
		if didRevert {
			reverted++
		}
	}
	return reverted, errors.Join(reversionErrors...)
}

func revertExpiredForGame(ctx context.Context, db *sql.DB, gameID string, now time.Time) (bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("rtp: begin reversion: %w", err)
	}
	defer tx.Rollback()

	if err := lockGame(ctx, tx, gameID); err != nil {
		return false, err
	}
	reverted, err := RevertExpiredForGameTx(ctx, tx, gameID, now)
	if err != nil {
		return false, err
	}
	if !reverted {
		return false, nil
	}
	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("rtp: commit reversion: %w", err)
	}
	return true, nil
}

// RevertExpiredForGameTx requires the caller to hold the game row FOR UPDATE.
// It lets round opening close the expiry boundary before selecting a profile.
func RevertExpiredForGameTx(ctx context.Context, tx *sql.Tx, gameID string, now time.Time) (bool, error) {
	current, found, err := activeForGame(ctx, tx, gameID)
	if err != nil {
		return false, err
	}
	if !found || current.EffectiveUntil == nil || current.EffectiveUntil.After(now) {
		return false, nil
	}

	defaultID, err := defaultForGame(ctx, tx, gameID)
	if err != nil {
		return false, err
	}
	if defaultID == "" || defaultID == current.ID {
		return false, ErrDefaultRequired
	}
	fallback, err := findByIDForUpdate(ctx, tx, defaultID)
	if errors.Is(err, ErrNoProfile) {
		return false, ErrDefaultRequired
	}
	if err != nil {
		return false, err
	}
	if fallback.GameID != gameID || fallback.Status != StatusVerified {
		return false, ErrDefaultRequired
	}

	before := map[string]any{"expired": snapshot(current), "default": snapshot(fallback)}
	if err := setStatus(ctx, tx, current.ID, StatusVerified, nil, nil); err != nil {
		return false, err
	}
	if err := setStatus(ctx, tx, fallback.ID, StatusActive, nil, nil); err != nil {
		return false, err
	}
	current.Status, current.EffectiveFrom, current.EffectiveUntil = StatusVerified, nil, nil
	fallback.Status, fallback.EffectiveFrom, fallback.EffectiveUntil = StatusActive, nil, nil
	if err := audit.Record(ctx, tx, audit.Change{
		Action: "rtp_profile.revert", EntityType: "rtp_profile", EntityID: current.ID,
		Detail: "Reverted expired " + describe(current) + " to default " + describe(fallback) + " for " + current.GameName,
		Before: before, After: map[string]any{"expired": snapshot(current), "default": snapshot(fallback)},
	}); err != nil {
		return false, err
	}
	return true, nil
}

func describe(p Profile) string {
	return p.Name + " v" + strconv.Itoa(p.Version) + " (" + strconv.Itoa(p.TargetBasisPoints) + " bp)"
}

func snapshot(p Profile) map[string]any {
	return map[string]any{
		"game_id": p.GameID, "name": p.Name, "version": p.Version, "target_basis_points": p.TargetBasisPoints,
		"status": p.Status, "engine_config_ref": p.EngineConfigRef,
		"effective_from": p.EffectiveFrom, "effective_until": p.EffectiveUntil,
		"is_default": p.IsDefault,
	}
}
