package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var (
	ErrInvalidStatus    = errors.New("user: invalid account status")
	ErrSelfStatusChange = errors.New("user: cannot change own status")
	ErrAccountClosed    = errors.New("user: closed account cannot change status")
)

func ChangeStatus(ctx context.Context, db *sql.DB, actorID, userID, status string) (User, error) {
	if status != "active" && status != "suspended" {
		return User{}, ErrInvalidStatus
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, fmt.Errorf("user: begin status change: %w", err)
	}
	defer tx.Rollback()

	var account User
	err = tx.QueryRowContext(ctx, `
		SELECT id::text, email, password_hash, display_name, role, status, created_at
		FROM users
		WHERE id = ($1::text)::uuid
		FOR UPDATE`, userID).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoUser
	}
	if err != nil {
		return User{}, fmt.Errorf("user: lock for status change: %w", err)
	}
	// Compare the database's canonical UUID text so alternate casing in the path
	// cannot bypass the self-status-change guard.
	if account.ID == actorID {
		return User{}, ErrSelfStatusChange
	}
	if account.Status == "closed" {
		return User{}, ErrAccountClosed
	}
	if account.Status == status {
		return account, nil
	}

	previousStatus := account.Status
	if _, err := tx.ExecContext(ctx, `UPDATE users SET status = $1, updated_at = now() WHERE id = ($2::text)::uuid`, status, userID); err != nil {
		return User{}, fmt.Errorf("user: update status: %w", err)
	}
	if status == "suspended" {
		if _, err := tx.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ($1::text)::uuid AND revoked_at IS NULL`, userID); err != nil {
			return User{}, fmt.Errorf("user: revoke suspended sessions: %w", err)
		}
	}

	action := "user.reinstate"
	if status == "suspended" {
		action = "user.suspend"
	}
	detail := "Account reinstated"
	if status == "suspended" {
		detail = "Account suspended"
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail, before_data, after_data)
		VALUES (($1::text)::uuid, $2, 'user', $3, $4,
			jsonb_build_object('status', $5::text), jsonb_build_object('status', $6::text))`,
		actorID, action, userID, detail, previousStatus, status); err != nil {
		return User{}, fmt.Errorf("user: audit status change: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return User{}, fmt.Errorf("user: commit status change: %w", err)
	}

	account.Status = status
	return account, nil
}
