package rtp

import (
	"context"
	"database/sql"
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
	if current.Status == StatusActive {
		action, detail = "rtp_profile.schedule", "Rescheduled "+describe(current)+" for "+current.GameName
	} else {
		replaced, found, err := activeForGame(ctx, tx, current.GameID)
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

func describe(p Profile) string {
	return p.Name + " v" + strconv.Itoa(p.Version) + " (" + strconv.Itoa(p.TargetBasisPoints) + " bp)"
}

func snapshot(p Profile) map[string]any {
	return map[string]any{
		"game_id": p.GameID, "name": p.Name, "version": p.Version, "target_basis_points": p.TargetBasisPoints,
		"status": p.Status, "engine_config_ref": p.EngineConfigRef,
		"effective_from": p.EffectiveFrom, "effective_until": p.EffectiveUntil,
	}
}
