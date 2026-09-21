package announcement

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const columns = `id::text, text, enabled, ends_at, created_at, updated_at`

type scanner interface {
	Scan(dest ...any) error
}

func ListActive(ctx context.Context, db *sql.DB, page, size int, now time.Time) ([]Announcement, int, error) {
	const where = ` FROM announcements WHERE enabled = true AND (ends_at IS NULL OR ends_at > $1)`
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*)`+where, now).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("announcement: count active: %w", err)
	}

	rows, err := db.QueryContext(ctx, `SELECT `+columns+where+`
		ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, now, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, 0, fmt.Errorf("announcement: list active: %w", err)
	}
	defer rows.Close()

	items, err := scanRows(rows)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func ListAdmin(ctx context.Context, db *sql.DB, page, size int) ([]Announcement, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM announcements`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("announcement: count admin list: %w", err)
	}

	rows, err := db.QueryContext(ctx, `SELECT `+columns+` FROM announcements
		ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, 0, fmt.Errorf("announcement: list admin: %w", err)
	}
	defer rows.Close()

	items, err := scanRows(rows)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func insert(ctx context.Context, tx *sql.Tx, text string, endsAt *time.Time) (Announcement, error) {
	item, err := scanAnnouncement(tx.QueryRowContext(ctx, `
		INSERT INTO announcements (text, ends_at)
		VALUES ($1, $2)
		RETURNING `+columns, text, endsAt))
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: insert: %w", err)
	}
	return item, nil
}

func findForUpdate(ctx context.Context, tx *sql.Tx, id string) (Announcement, error) {
	item, err := scanAnnouncement(tx.QueryRowContext(ctx, `SELECT `+columns+`
		FROM announcements WHERE id = ($1::text)::uuid FOR UPDATE`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Announcement{}, ErrNotFound
	}
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: find for update: %w", err)
	}
	return item, nil
}

func updateContent(ctx context.Context, tx *sql.Tx, id, text string, endsAt *time.Time) (Announcement, error) {
	item, err := scanAnnouncement(tx.QueryRowContext(ctx, `
		UPDATE announcements SET text = $2, ends_at = $3, updated_at = now()
		WHERE id = ($1::text)::uuid
		RETURNING `+columns, id, text, endsAt))
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: update content: %w", err)
	}
	return item, nil
}

func updateEnabled(ctx context.Context, tx *sql.Tx, id string, enabled bool) (Announcement, error) {
	item, err := scanAnnouncement(tx.QueryRowContext(ctx, `
		UPDATE announcements SET enabled = $2, updated_at = now()
		WHERE id = ($1::text)::uuid
		RETURNING `+columns, id, enabled))
	if err != nil {
		return Announcement{}, fmt.Errorf("announcement: update status: %w", err)
	}
	return item, nil
}

func scanRows(rows *sql.Rows) ([]Announcement, error) {
	items := make([]Announcement, 0)
	for rows.Next() {
		item, err := scanAnnouncement(rows)
		if err != nil {
			return nil, fmt.Errorf("announcement: scan row: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("announcement: rows: %w", err)
	}
	return items, nil
}

func scanAnnouncement(row scanner) (Announcement, error) {
	var item Announcement
	err := row.Scan(&item.ID, &item.Text, &item.Enabled, &item.EndsAt, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}
