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

const upsertUser = `
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
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_USER_EMAIL")))
	password := os.Getenv("SEED_USER_PASSWORD")

	if databaseURL == "" {
		return errors.New("seed: DATABASE_URL is required")
	}
	if email == "" || password == "" {
		return errors.New("seed: SEED_USER_EMAIL and SEED_USER_PASSWORD must be set")
	}

	displayName := os.Getenv("SEED_USER_DISPLAY_NAME")
	if displayName == "" {
		displayName = "Owner"
	}

	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return fmt.Errorf("seed: open database: %w", err)
	}
	defer db.Close()

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("seed: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var id string
	if err := db.QueryRowContext(ctx, upsertUser, email, hash, displayName).Scan(&id); err != nil {
		return fmt.Errorf("seed: upsert user: %w", err)
	}

	fmt.Printf("seeded admin %s (%s)\n", email, id)
	return nil
}
