package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/gaming-platform/backend/internal/auth"
)

const upsertAdmin = `
	INSERT INTO users (email, password_hash, display_name, role)
	VALUES ($1, $2, $3, 'admin')
	ON CONFLICT (email) DO UPDATE
	   SET password_hash = EXCLUDED.password_hash,
	       display_name  = EXCLUDED.display_name,
	       role          = 'admin',
	       status        = 'active',
	       updated_at    = now()
	RETURNING id::text`

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	databaseURL := os.Getenv("DATABASE_URL")
	adminEmail := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_USER_EMAIL")))
	adminPassword := os.Getenv("SEED_USER_PASSWORD")

	if databaseURL == "" {
		return errors.New("seed: DATABASE_URL is required")
	}
	if adminEmail == "" || adminPassword == "" {
		return errors.New("seed: SEED_USER_EMAIL and SEED_USER_PASSWORD must be set")
	}

	adminDisplayName := os.Getenv("SEED_USER_DISPLAY_NAME")
	if adminDisplayName == "" {
		adminDisplayName = "Owner"
	}

	playerPassword := os.Getenv("SEED_PLAYER_PASSWORD")
	if playerPassword == "" {
		playerPassword = adminPassword
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

	adminID, err := seedAdmin(ctx, tx, adminEmail, adminPassword, adminDisplayName)
	if err != nil {
		return err
	}

	playerCount, err := seedPlayers(ctx, tx, adminEmail, playerPassword)
	if err != nil {
		return err
	}

	if err := seedCatalogue(ctx, tx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("seed: commit: %w", err)
	}

	fmt.Printf("seeded admin %s (%s)\n", adminEmail, adminID)
	fmt.Printf("seeded %d players\n", playerCount)
	fmt.Printf("seeded %d categories and %d games\n", len(categories), len(games))
	return nil
}

func seedAdmin(ctx context.Context, tx *sql.Tx, email, password, displayName string) (string, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return "", fmt.Errorf("seed: %w", err)
	}

	var id string
	if err := tx.QueryRowContext(ctx, upsertAdmin, email, hash, displayName).Scan(&id); err != nil {
		return "", fmt.Errorf("seed: upsert admin: %w", err)
	}

	return id, nil
}
