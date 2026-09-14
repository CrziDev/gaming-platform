// Package testdb opens only explicitly configured, clearly named test databases.
package testdb

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

var ErrURLRequired = errors.New("TEST_DATABASE_URL is required")

// URL rejects implicit fallbacks and database names that do not make their
// destructive test-only purpose explicit.
func URL() (string, error) {
	raw := strings.TrimSpace(os.Getenv("TEST_DATABASE_URL"))
	if raw == "" {
		return "", ErrURLRequired
	}

	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") {
		return "", errors.New("TEST_DATABASE_URL must be a PostgreSQL URL")
	}
	if parsed.Query().Has("dbname") || parsed.Query().Has("database") {
		return "", errors.New("TEST_DATABASE_URL must not override its database in query parameters")
	}
	databaseName := strings.TrimPrefix(parsed.Path, "/")
	if databaseName == "" || strings.Contains(databaseName, "/") || !strings.HasSuffix(databaseName, "_test") {
		return "", fmt.Errorf("TEST_DATABASE_URL database %q must end in _test", databaseName)
	}
	return raw, nil
}

func Open() (*sql.DB, error) {
	databaseURL, err := URL()
	if err != nil {
		return nil, err
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open test database: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping test database: %w", err)
	}
	return db, nil
}
