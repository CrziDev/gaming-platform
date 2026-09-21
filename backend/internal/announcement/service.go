package announcement

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/gaming-platform/backend/internal/audit"
)

func Create(ctx context.Context, db *sql.DB, actorID, text string, endsAt *time.Time) (Announcement, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: begin create: %w", err)
	}
	defer tx.Rollback()

	created, err := insert(ctx, tx, text, endsAt)
	if err != nil {
		return Announcement{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "announcement.create", EntityType: "announcement", EntityID: created.ID,
		Detail: "Created announcement", After: snapshot(created),
	}); err != nil {
		return Announcement{}, err
	}
	if err := tx.Commit(); err != nil {
		return Announcement{}, fmt.Errorf("announcement: commit create: %w", err)
	}
	return created, nil
}

func Update(ctx context.Context, db *sql.DB, actorID, id, text string, endsAt *time.Time) (Announcement, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: begin update: %w", err)
	}
	defer tx.Rollback()

	current, err := findForUpdate(ctx, tx, id)
	if err != nil {
		return Announcement{}, err
	}
	if current.Text == text && sameTime(current.EndsAt, endsAt) {
		return current, nil
	}
	updated, err := updateContent(ctx, tx, id, text, endsAt)
	if err != nil {
		return Announcement{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "announcement.update", EntityType: "announcement", EntityID: id,
		Detail: "Updated announcement", Before: snapshot(current), After: snapshot(updated),
	}); err != nil {
		return Announcement{}, err
	}
	if err := tx.Commit(); err != nil {
		return Announcement{}, fmt.Errorf("announcement: commit update: %w", err)
	}
	return updated, nil
}

func SetEnabled(ctx context.Context, db *sql.DB, actorID, id string, enabled bool, now time.Time) (Announcement, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: begin status change: %w", err)
	}
	defer tx.Rollback()

	current, err := findForUpdate(ctx, tx, id)
	if err != nil {
		return Announcement{}, err
	}
	if enabled && current.EndsAt != nil && !current.EndsAt.After(now) {
		return Announcement{}, ErrEnded
	}
	if current.Enabled == enabled {
		return current, nil
	}
	updated, err := updateEnabled(ctx, tx, id, enabled)
	if err != nil {
		return Announcement{}, err
	}
	detail := "Disabled announcement"
	if enabled {
		detail = "Enabled announcement"
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "announcement.status_change", EntityType: "announcement", EntityID: id,
		Detail: detail, Before: snapshot(current), After: snapshot(updated),
	}); err != nil {
		return Announcement{}, err
	}
	if err := tx.Commit(); err != nil {
		return Announcement{}, fmt.Errorf("announcement: commit status change: %w", err)
	}
	return updated, nil
}

func sameTime(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.Equal(*right)
}

func snapshot(item Announcement) map[string]any {
	return map[string]any{"text": item.Text, "enabled": item.Enabled, "ends_at": item.EndsAt}
}
