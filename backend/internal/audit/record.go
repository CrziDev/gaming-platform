package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

const insertEntrySQL = `
	INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail, before_data, after_data)
	VALUES (NULLIF($1, '')::uuid, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`

type Change struct {
	ActorID    string
	Action     string
	EntityType string
	EntityID   string
	Detail     string
	Before     any
	After      any
}

func Record(ctx context.Context, tx *sql.Tx, change Change) error {
	before, err := json.Marshal(change.Before)
	if err != nil {
		return fmt.Errorf("audit: encode before data: %w", err)
	}
	after, err := json.Marshal(change.After)
	if err != nil {
		return fmt.Errorf("audit: encode after data: %w", err)
	}

	_, err = tx.ExecContext(ctx, insertEntrySQL,
		change.ActorID, change.Action, change.EntityType, change.EntityID, change.Detail,
		string(before), string(after))
	if err != nil {
		return fmt.Errorf("audit: record %s: %w", change.Action, err)
	}
	return nil
}
