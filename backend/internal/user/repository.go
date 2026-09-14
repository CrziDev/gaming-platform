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

	selectUserByIDSQL = `
		SELECT id::text, email, password_hash, display_name, role, status, created_at
		FROM users
		WHERE id = ($1::text)::uuid`

	countUsersSQL = `
		SELECT count(*)
		FROM users
		WHERE ($1 = '' OR status = $1)
		  AND ($2 = ''
		    OR position(lower($2) in lower(email)) > 0
		    OR position(lower($2) in lower(display_name)) > 0
		    OR position(lower($2) in lower(id::text)) > 0)`

	listUsersSQL = `
		SELECT id::text, email, display_name, role, status, created_at
		FROM users
		WHERE ($1 = '' OR status = $1)
		  AND ($2 = ''
		    OR position(lower($2) in lower(email)) > 0
		    OR position(lower($2) in lower(display_name)) > 0
		    OR position(lower($2) in lower(id::text)) > 0)
		ORDER BY created_at DESC, email ASC
		LIMIT $3 OFFSET $4`
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

type ListFilter struct {
	Page   int
	Size   int
	Search string
	Status string
}

func Create(ctx context.Context, db *sql.DB, email, passwordHash, displayName string) (User, error) {
	return create(ctx, db, email, passwordHash, displayName)
}

func CreateTx(ctx context.Context, tx *sql.Tx, email, passwordHash, displayName string) (User, error) {
	return create(ctx, tx, email, passwordHash, displayName)
}

type rowQuerier interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func create(ctx context.Context, db rowQuerier, email, passwordHash, displayName string) (User, error) {
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

func FindByID(ctx context.Context, db *sql.DB, id string) (User, error) {
	var account User

	err := db.QueryRowContext(ctx, selectUserByIDSQL, id).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoUser
	}
	if err != nil {
		return User{}, fmt.Errorf("user: find by id: %w", err)
	}
	return account, nil
}

func List(ctx context.Context, db *sql.DB, filter ListFilter) ([]User, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, countUsersSQL, filter.Status, filter.Search).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("user: count list: %w", err)
	}

	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, listUsersSQL, filter.Status, filter.Search, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("user: list: %w", err)
	}
	defer rows.Close()

	accounts := make([]User, 0)
	for rows.Next() {
		var account User
		if err := rows.Scan(
			&account.ID, &account.Email, &account.DisplayName,
			&account.Role, &account.Status, &account.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("user: list row: %w", err)
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("user: list rows: %w", err)
	}
	return accounts, total, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
