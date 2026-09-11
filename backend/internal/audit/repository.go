package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

type Entry struct {
	ID               string
	ActorUserID      string
	ActorDisplayName string
	Action           string
	EntityType       string
	EntityID         string
	Detail           string
	BeforeData       json.RawMessage
	AfterData        json.RawMessage
	CreatedAt        time.Time
}

type ListFilter struct {
	Page    int
	Size    int
	ActorID string
	Action  string
	From    *time.Time
	To      *time.Time
}

func List(ctx context.Context, db *sql.DB, filter ListFilter) ([]Entry, int, error) {
	where := `WHERE (NULLIF($1, '')::uuid IS NULL OR a.actor_user_id = NULLIF($1, '')::uuid)
		AND ($2 = '' OR a.action = $2)
		AND ($3::timestamptz IS NULL OR a.created_at >= $3::timestamptz)
		AND ($4::timestamptz IS NULL OR a.created_at <= $4::timestamptz)`
	args := []any{filter.ActorID, filter.Action, filter.From, filter.To}

	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM audit_logs a `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("audit: count entries: %w", err)
	}

	offset := int64(filter.Page-1) * int64(filter.Size)
	args = append(args, filter.Size, offset)
	rows, err := db.QueryContext(ctx, `
		SELECT a.id::text, COALESCE(a.actor_user_id::text, ''),
			COALESCE(u.display_name, 'System'), a.action, a.entity_type, a.entity_id,
			a.detail, COALESCE(a.before_data, 'null'::jsonb)::text,
			COALESCE(a.after_data, 'null'::jsonb)::text, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		`+where+`
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT $5 OFFSET $6`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("audit: list entries: %w", err)
	}
	defer rows.Close()

	entries := make([]Entry, 0)
	for rows.Next() {
		var entry Entry
		var beforeData, afterData string
		if err := rows.Scan(
			&entry.ID, &entry.ActorUserID, &entry.ActorDisplayName,
			&entry.Action, &entry.EntityType, &entry.EntityID, &entry.Detail,
			&beforeData, &afterData, &entry.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("audit: scan entry: %w", err)
		}
		entry.BeforeData = json.RawMessage(beforeData)
		entry.AfterData = json.RawMessage(afterData)
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("audit: entry rows: %w", err)
	}
	return entries, total, nil
}
