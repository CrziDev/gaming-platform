package notification

import (
	"context"
	"database/sql"
	"fmt"
)

// Create runs inside the caller's transaction so a notification exists exactly
// when the money movement or review it describes has committed, and never
// otherwise. The unique index on (kind, reference_id) makes a retried
// transaction a no-op rather than a second bell.
func Create(ctx context.Context, tx *sql.Tx, n Notification) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO notifications (user_id, kind, amount_minor, currency, reference_type, reference_id, detail)
		VALUES (($1::text)::uuid, $2, $3, NULLIF($4, ''), $5, ($6::text)::uuid, NULLIF($7, ''))
		ON CONFLICT (kind, reference_id) DO NOTHING`,
		n.UserID, n.Kind, n.AmountMinor, n.Currency, n.ReferenceType, n.ReferenceID, n.Detail)
	if err != nil {
		return fmt.Errorf("notification: create %s: %w", n.Kind, err)
	}
	return nil
}

func List(ctx context.Context, db *sql.DB, userID string, page, size int) ([]Notification, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM notifications WHERE user_id = ($1::text)::uuid`, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("notification: count: %w", err)
	}
	rows, err := db.QueryContext(ctx, `
		SELECT id::text, user_id::text, kind, amount_minor, COALESCE(currency, ''), reference_type, reference_id::text, COALESCE(detail, ''), read_at, created_at
		FROM notifications
		WHERE user_id = ($1::text)::uuid
		ORDER BY created_at DESC, id DESC
		LIMIT $2 OFFSET $3`, userID, size, (page-1)*size)
	if err != nil {
		return nil, 0, fmt.Errorf("notification: list: %w", err)
	}
	defer rows.Close()
	result := make([]Notification, 0)
	for rows.Next() {
		var item Notification
		var amount sql.NullInt64
		var readAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.UserID, &item.Kind, &amount, &item.Currency, &item.ReferenceType, &item.ReferenceID, &item.Detail, &readAt, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("notification: scan: %w", err)
		}
		if amount.Valid {
			item.AmountMinor = &amount.Int64
		}
		if readAt.Valid {
			item.ReadAt = &readAt.Time
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("notification: rows: %w", err)
	}
	return result, total, nil
}

func MarkAllRead(ctx context.Context, db *sql.DB, userID string) error {
	if _, err := db.ExecContext(ctx, `UPDATE notifications SET read_at = now() WHERE user_id = ($1::text)::uuid AND read_at IS NULL`, userID); err != nil {
		return fmt.Errorf("notification: mark read: %w", err)
	}
	return nil
}
