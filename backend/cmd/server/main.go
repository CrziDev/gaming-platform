package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/gaming-platform/backend/internal/app"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel()}))

	if err := run(logger); err != nil {
		logger.Error("server stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func run(logger *slog.Logger) error {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return errors.New("DATABASE_URL is required")
	}

	db, err := openDatabase(databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	logger.Info("database connected")

	cfg := app.Config{
		CookieName:      env("SESSION_COOKIE_NAME", "gp_session"),
		CookieSecure:    env("SESSION_SECURE", "false") == "true",
		SessionTTL:      time.Duration(envInt("SESSION_TTL_HOURS", 24)) * time.Hour,
		AllowedOrigins:  strings.Split(env("CORS_ALLOWED_ORIGINS", "http://localhost:5173"), ","),
		MaxBodyBytes:    int64(envInt("HTTP_MAX_BODY_BYTES", 6<<20)),
		ProofDir:        env("PRIVATE_PROOF_DIR", "storage/private/deposit-proofs"),
		LoginsPerMinute: envInt("LOGIN_ATTEMPTS_PER_MINUTE", 10),
	}

	logger.Info("sessions configured",
		slog.Bool("cookie_secure", cfg.CookieSecure),
		slog.Duration("ttl", cfg.SessionTTL),
		slog.Any("allowed_origins", cfg.AllowedOrigins))

	port := envInt("APP_PORT", 8080)
	server := &http.Server{
		Addr:              ":" + strconv.Itoa(port),
		Handler:           app.New(db, logger, cfg),
		ReadHeaderTimeout: 15 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("listening", slog.Int("port", port))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- fmt.Errorf("serve: %w", err)
			return
		}
		serveErr <- nil
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	select {
	case err := <-serveErr:
		return err
	case <-ctx.Done():
		logger.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return <-serveErr
}

func openDatabase(databaseURL string) (*sql.DB, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(envInt("DATABASE_MAX_CONNS", 10))
	db.SetMaxIdleConns(envInt("DATABASE_MIN_CONNS", 1))
	db.SetConnMaxLifetime(time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(key))
	if err != nil {
		return fallback
	}
	return value
}

func logLevel() slog.Level {
	switch strings.ToLower(os.Getenv("LOG_LEVEL")) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
