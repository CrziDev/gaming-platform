package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const (
	insertSessionSQL = `
		INSERT INTO auth_sessions (user_id, token_hash, expires_at)
		VALUES (($1::text)::uuid, $2, $3)`

	selectUserBySessionSQL = `
		SELECT u.id::text, u.email, u.password_hash, u.display_name, u.role, u.status, u.created_at
		FROM auth_sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1
		  AND s.revoked_at IS NULL
		  AND s.expires_at > now()
		  AND u.status = 'active'`

	revokeSessionSQL = `
		UPDATE auth_sessions
		SET revoked_at = now()
		WHERE token_hash = $1 AND revoked_at IS NULL`

	revokeUserSessionsSQL = `
		UPDATE auth_sessions
		SET revoked_at = now()
		WHERE user_id = ($1::text)::uuid AND revoked_at IS NULL`
)

var ErrNoSession = errors.New("user: no usable session")

type execer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

// Sessions are stored by token hash only; the caller hashes the token before it
// reaches this package, and the raw token never touches the database.
func CreateSession(ctx context.Context, db *sql.DB, userID string, tokenHash []byte, expiresAt time.Time) error {
	return createSession(ctx, db, userID, tokenHash, expiresAt)
}

func CreateSessionTx(ctx context.Context, tx *sql.Tx, userID string, tokenHash []byte, expiresAt time.Time) error {
	return createSession(ctx, tx, userID, tokenHash, expiresAt)
}

func createSession(ctx context.Context, db execer, userID string, tokenHash []byte, expiresAt time.Time) error {
	if _, err := db.ExecContext(ctx, insertSessionSQL, userID, tokenHash, expiresAt); err != nil {
		return fmt.Errorf("user: create session: %w", err)
	}
	return nil
}

func FindBySessionHash(ctx context.Context, db *sql.DB, tokenHash []byte) (User, error) {
	var account User

	err := db.QueryRowContext(ctx, selectUserBySessionSQL, tokenHash).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoSession
	}
	if err != nil {
		return User{}, fmt.Errorf("user: find by session: %w", err)
	}
	return account, nil
}

func RevokeSession(ctx context.Context, db *sql.DB, tokenHash []byte) error {
	if _, err := db.ExecContext(ctx, revokeSessionSQL, tokenHash); err != nil {
		return fmt.Errorf("user: revoke session: %w", err)
	}
	return nil
}

func revokeSessionsTx(ctx context.Context, tx *sql.Tx, userID string) error {
	if _, err := tx.ExecContext(ctx, revokeUserSessionsSQL, userID); err != nil {
		return fmt.Errorf("user: revoke sessions: %w", err)
	}
	return nil
}
