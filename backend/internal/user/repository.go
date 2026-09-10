package user

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

const (
	insertUserSQL = `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING id::text, role, status, created_at`

	selectUserByEmailSQL = `
		SELECT id::text, email, password_hash, display_name, role, status, created_at
		FROM users
		WHERE email = $1`

	listUsersSQL = `
		SELECT id::text, email, display_name, role, status, created_at
		FROM users
		ORDER BY created_at DESC, email ASC`
)

var (
	ErrEmailTaken = errors.New("user: email is already registered")
	ErrNoUser     = errors.New("user: no such account")
)

type User struct {
	ID           string
	Email        string
	PasswordHash string
	DisplayName  string
	Role         string
	Status       string
	CreatedAt    time.Time
}

func Create(ctx context.Context, db *sql.DB, email, passwordHash, displayName string) (User, error) {
	account := User{Email: email, PasswordHash: passwordHash, DisplayName: displayName}

	err := db.QueryRowContext(ctx, insertUserSQL, email, passwordHash, displayName).
		Scan(&account.ID, &account.Role, &account.Status, &account.CreatedAt)
	if isUniqueViolation(err) {
		return User{}, ErrEmailTaken
	}
	if err != nil {
		return User{}, fmt.Errorf("user: create: %w", err)
	}
	return account, nil
}

func FindByEmail(ctx context.Context, db *sql.DB, email string) (User, error) {
	var account User

	err := db.QueryRowContext(ctx, selectUserByEmailSQL, email).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoUser
	}
	if err != nil {
		return User{}, fmt.Errorf("user: find by email: %w", err)
	}
	return account, nil
}

func List(ctx context.Context, db *sql.DB) ([]User, error) {
	rows, err := db.QueryContext(ctx, listUsersSQL)
	if err != nil {
		return nil, fmt.Errorf("user: list: %w", err)
	}
	defer rows.Close()

	accounts := make([]User, 0)
	for rows.Next() {
		var account User
		if err := rows.Scan(
			&account.ID, &account.Email, &account.DisplayName,
			&account.Role, &account.Status, &account.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("user: list row: %w", err)
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("user: list rows: %w", err)
	}
	return accounts, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
