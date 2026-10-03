package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"slices"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/gaming-platform/backend/internal/auth"
)

const upsertAdmin = `
	INSERT INTO users (email, password_hash, display_name, role)
	VALUES ($1, $2, $3, 'admin')
	ON CONFLICT (email) DO NOTHING
	RETURNING id::text`

func main() {
	if len(os.Args) != 2 || (os.Args[1] != "bootstrap" && os.Args[1] != "demo") {
		fmt.Fprintln(os.Stderr, "usage: seed bootstrap|demo")
		os.Exit(2)
	}
	if err := run(os.Args[1], os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(mode string, lookup func(string) string) error {
	databaseURL := lookup("DATABASE_URL")
	adminEmails := parseAdminEmails(lookup("SEED_ADMIN_EMAILS"))

	if databaseURL == "" {
		return errors.New("seed: DATABASE_URL is required")
	}
	if len(adminEmails) == 0 {
		return errors.New("seed: SEED_ADMIN_EMAILS must list at least one email")
	}
	if mode == "demo" {
		if err := allowDemoSeed(lookup); err != nil {
			return err
		}
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("seed: open database: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("seed: begin: %w", err)
	}
	defer tx.Rollback()

	switch mode {
	case "bootstrap":
		if err := bootstrap(ctx, tx, lookup, adminEmails); err != nil {
			return err
		}
	case "demo":
		if err := demo(ctx, tx, lookup, adminEmails[0]); err != nil {
			return err
		}
	default:
		return fmt.Errorf("seed: unknown mode %q", mode)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("seed: commit: %w", err)
	}

	return nil
}

func bootstrap(ctx context.Context, tx *sql.Tx, lookup func(string) string, adminEmails []string) error {
	adminPassword := lookup("SEED_USER_PASSWORD")
	if adminPassword == "" {
		return errors.New("seed: SEED_USER_PASSWORD must be set for bootstrap")
	}
	for _, email := range adminEmails {
		adminID, created, err := seedAdmin(ctx, tx, email, adminPassword, adminDisplayName(email))
		if err != nil {
			return err
		}
		fmt.Printf("ensured admin %s (%s, created=%t)\n", email, adminID, created)
	}
	if err := seedCatalogue(ctx, tx); err != nil {
		return err
	}
	fmt.Printf("ensured %d categories and %d games\n", len(categories), len(games))
	return nil
}

func demo(ctx context.Context, tx *sql.Tx, lookup func(string) string, adminEmail string) error {
	playerPassword := lookup("SEED_PLAYER_PASSWORD")
	if playerPassword == "" {
		return errors.New("seed: SEED_PLAYER_PASSWORD must be set for demo data")
	}
	var adminID, role string
	if err := tx.QueryRowContext(ctx, `SELECT id::text, role FROM users WHERE email = $1`, adminEmail).Scan(&adminID, &role); errors.Is(err, sql.ErrNoRows) {
		return errors.New("seed: bootstrap the admin before loading demo data")
	} else if err != nil {
		return fmt.Errorf("seed: find admin: %w", err)
	}
	if role != "admin" {
		return fmt.Errorf("seed: %s exists but is not an admin", adminEmail)
	}
	if err := fundWallets(ctx, tx, adminID, adminID, adminOpeningMinor); err != nil {
		return fmt.Errorf("seed: admin: %w", err)
	}
	playerCount, err := seedPlayers(ctx, tx, adminEmail, adminID, playerPassword)
	if err != nil {
		return err
	}
	if err := seedPaymentMethods(ctx, tx); err != nil {
		return err
	}
	fmt.Printf("seeded %d demo players with opening balances\n", playerCount)
	fmt.Printf("seeded %d payment methods with development destinations\n", len(paymentMethods))
	return nil
}

func parseAdminEmails(value string) []string {
	emails := make([]string, 0)
	for _, part := range strings.Split(value, ",") {
		email := strings.ToLower(strings.TrimSpace(part))
		if email != "" && !slices.Contains(emails, email) {
			emails = append(emails, email)
		}
	}
	return emails
}

func adminDisplayName(email string) string {
	name, _, _ := strings.Cut(email, "@")
	if name == "" {
		name = email
	}
	if runes := []rune(name); len(runes) > 80 {
		name = string(runes[:80])
	}
	return name
}

func allowDemoSeed(lookup func(string) string) error {
	environment := strings.ToLower(strings.TrimSpace(lookup("APP_ENV")))
	if environment != "development" && environment != "staging" {
		return errors.New("seed: demo data requires APP_ENV=development or APP_ENV=staging")
	}
	allowed, err := strconv.ParseBool(strings.TrimSpace(lookup("ALLOW_DEMO_SEED")))
	if err != nil || !allowed {
		return errors.New("seed: demo data requires ALLOW_DEMO_SEED=true")
	}
	return nil
}

func seedAdmin(ctx context.Context, tx *sql.Tx, email, password, displayName string) (string, bool, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", false, fmt.Errorf("seed: %w", err)
	}

	var id string
	err = tx.QueryRowContext(ctx, upsertAdmin, email, hash, displayName).Scan(&id)
	if err == nil {
		return id, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", false, fmt.Errorf("seed: insert admin: %w", err)
	}
	var role string
	if err := tx.QueryRowContext(ctx, `SELECT id::text, role FROM users WHERE email = $1`, email).Scan(&id, &role); err != nil {
		return "", false, fmt.Errorf("seed: read existing admin: %w", err)
	}
	if role != "admin" {
		return "", false, fmt.Errorf("seed: %s exists but is not an admin", email)
	}
	return id, false, nil
}
