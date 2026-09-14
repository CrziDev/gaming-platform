package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gaming-platform/backend/internal/audit"
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
		if err := revokeSessionsTx(ctx, tx, userID); err != nil {
			return User{}, err
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
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "user", EntityID: account.ID, Detail: detail,
		Before: map[string]string{"status": previousStatus},
		After:  map[string]string{"status": status},
	}); err != nil {
		return User{}, err
	}
	if err := tx.Commit(); err != nil {
		return User{}, fmt.Errorf("user: commit status change: %w", err)
	}

	account.Status = status
	return account, nil
}
