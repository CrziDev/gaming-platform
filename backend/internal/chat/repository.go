package chat

import (
	"context"
	"database/sql"
	"fmt"
)

const messageColumns = `m.id::text, m.user_id::text, u.display_name, u.role, m.text, m.created_at`

func Create(ctx context.Context, db *sql.DB, userID, text string) (Message, error) {
	var item Message
	err := db.QueryRowContext(ctx, `
		WITH inserted AS (
			INSERT INTO chat_messages (user_id, text) VALUES (($1::text)::uuid, $2)
			RETURNING id, user_id, text, created_at
		)
		SELECT `+messageColumns+` FROM inserted m JOIN users u ON u.id = m.user_id`, userID, text).Scan(
		&item.ID, &item.UserID, &item.DisplayName, &item.Role, &item.Text, &item.CreatedAt)
	if err != nil {
		return Message{}, fmt.Errorf("chat: create message: %w", err)
	}
	return item, nil
}

// ListRecent returns the newest window of the room, oldest first, so the rail
// appends in reading order.
func ListRecent(ctx context.Context, db *sql.DB) ([]Message, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT `+messageColumns+`
		FROM (SELECT id, user_id, text, created_at FROM chat_messages ORDER BY created_at DESC, id DESC LIMIT $1) m
		JOIN users u ON u.id = m.user_id
		ORDER BY m.created_at ASC, m.id ASC`, recentMessages)
	if err != nil {
		return nil, fmt.Errorf("chat: list recent: %w", err)
	}
	defer rows.Close()
	result := make([]Message, 0, recentMessages)
	for rows.Next() {
		var item Message
		if err := rows.Scan(&item.ID, &item.UserID, &item.DisplayName, &item.Role, &item.Text, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("chat: scan message: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("chat: message rows: %w", err)
	}
	return result, nil
}
