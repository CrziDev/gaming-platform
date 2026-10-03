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

	selectUserByIDForUpdateSQL = `
		SELECT id::text, email, password_hash, display_name, role, status, created_at
		FROM users
		WHERE id = ($1::text)::uuid
		FOR UPDATE`

	selectActiveUserByEmailForUpdateSQL = `
		SELECT id::text, email, password_hash, display_name, role, status, created_at
		FROM users
		WHERE email = $1 AND status = 'active'
		FOR UPDATE`

	updatePasswordSQL = `
		UPDATE users
		SET password_hash = $1, updated_at = now()
		WHERE id = ($2::text)::uuid`

	selectAlertRecipientEmailsSQL = `
		SELECT email
		FROM users
		WHERE role = 'admin' AND status = 'active' AND alert_emails
		ORDER BY created_at, email`

	listStaffSQL = `
		SELECT id::text, email, display_name, status, alert_emails, created_at
		FROM users
		WHERE role = 'admin'
		ORDER BY created_at, email`

	countUsersSQL = `
		SELECT count(*)
		FROM users
		WHERE ($1 = '' OR status = $1)
		  AND ($2 = '' OR role = $2)
		  AND ($3 = ''
		    OR position(lower($3) in lower(email)) > 0
		    OR position(lower($3) in lower(display_name)) > 0
		    OR position(lower($3) in lower(id::text)) > 0)`

	listUsersSQL = `
		SELECT id::text, email, display_name, role, status, created_at
		FROM users
		WHERE ($1 = '' OR status = $1)
		  AND ($2 = '' OR role = $2)
		  AND ($3 = ''
		    OR position(lower($3) in lower(email)) > 0
		    OR position(lower($3) in lower(display_name)) > 0
		    OR position(lower($3) in lower(id::text)) > 0)
		ORDER BY created_at DESC, email ASC
		LIMIT $4 OFFSET $5`
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

type Staff struct {
	ID          string
	Email       string
	DisplayName string
	Status      string
	AlertEmails bool
	CreatedAt   time.Time
}

type ListFilter struct {
	Page   int
	Size   int
	Search string
	Status string
	Role   string
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

func FindByIDForUpdateTx(ctx context.Context, tx *sql.Tx, id string) (User, error) {
	return findForUpdate(ctx, tx, selectUserByIDForUpdateSQL, id)
}

func FindActiveByEmailForUpdateTx(ctx context.Context, tx *sql.Tx, email string) (User, error) {
	return findForUpdate(ctx, tx, selectActiveUserByEmailForUpdateSQL, email)
}

func findForUpdate(ctx context.Context, tx *sql.Tx, query, value string) (User, error) {
	var account User
	err := tx.QueryRowContext(ctx, query, value).Scan(
		&account.ID, &account.Email, &account.PasswordHash, &account.DisplayName,
		&account.Role, &account.Status, &account.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNoUser
	}
	if err != nil {
		return User{}, fmt.Errorf("user: lock account: %w", err)
	}
	return account, nil
}

func UpdatePasswordTx(ctx context.Context, tx *sql.Tx, userID, passwordHash string) error {
	if _, err := tx.ExecContext(ctx, updatePasswordSQL, passwordHash, userID); err != nil {
		return fmt.Errorf("user: update password: %w", err)
	}
	return nil
}

func List(ctx context.Context, db *sql.DB, filter ListFilter) ([]User, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, countUsersSQL, filter.Status, filter.Role, filter.Search).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("user: count list: %w", err)
	}

	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, listUsersSQL, filter.Status, filter.Role, filter.Search, filter.Size, offset)
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

func AlertRecipientEmails(ctx context.Context, db *sql.DB) ([]string, error) {
	rows, err := db.QueryContext(ctx, selectAlertRecipientEmailsSQL)
	if err != nil {
		return nil, fmt.Errorf("user: list admin emails: %w", err)
	}
	defer rows.Close()

	emails := make([]string, 0)
	for rows.Next() {
		var email string
		if err := rows.Scan(&email); err != nil {
			return nil, fmt.Errorf("user: admin email row: %w", err)
		}
		emails = append(emails, email)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("user: admin email rows: %w", err)
	}
	return emails, nil
}

func ListStaff(ctx context.Context, db *sql.DB) ([]Staff, error) {
	rows, err := db.QueryContext(ctx, listStaffSQL)
	if err != nil {
		return nil, fmt.Errorf("user: list staff: %w", err)
	}
	defer rows.Close()

	staff := make([]Staff, 0)
	for rows.Next() {
		var member Staff
		if err := rows.Scan(&member.ID, &member.Email, &member.DisplayName, &member.Status, &member.AlertEmails, &member.CreatedAt); err != nil {
			return nil, fmt.Errorf("user: staff row: %w", err)
		}
		staff = append(staff, member)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("user: staff rows: %w", err)
	}
	return staff, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
