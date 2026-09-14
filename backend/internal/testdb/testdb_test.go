package testdb

import (
	"errors"
	"testing"
)

func TestURLRequiresAnExplicitTestDatabase(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "")
	if _, err := URL(); !errors.Is(err, ErrURLRequired) {
		t.Fatalf("missing URL: want %v, got %v", ErrURLRequired, err)
	}
}

func TestURLRequiresATestSuffix(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "postgres://gaming:secret@localhost/gaming_platform?sslmode=disable")
	if _, err := URL(); err == nil {
		t.Fatal("development database name was accepted")
	}
}

func TestURLRejectsAQueryParameterDatabaseOverride(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "postgres://gaming:secret@localhost/gaming_platform_test?dbname=gaming_platform")
	if _, err := URL(); err == nil {
		t.Fatal("database override query parameter was accepted")
	}
}

func TestURLAcceptsAnExplicitTestDatabase(t *testing.T) {
	const databaseURL = "postgres://gaming:secret@localhost/gaming_platform_test?sslmode=disable"
	t.Setenv("TEST_DATABASE_URL", databaseURL)
	got, err := URL()
	if err != nil {
		t.Fatalf("test database URL was rejected: %v", err)
	}
	if got != databaseURL {
		t.Fatalf("URL = %q, want %q", got, databaseURL)
	}
}
