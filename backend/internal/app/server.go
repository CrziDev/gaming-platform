package app

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // registers the "pgx" driver with database/sql
)

// Run serves until ctx is cancelled, then drains in-flight requests before
// returning. The caller owns the signal handling that cancels ctx.
func Run(ctx context.Context, logger *slog.Logger, cfg Config) error {
	db, err := OpenDatabase(ctx, cfg)
	if err != nil {
		return err
	}
	defer db.Close()
	logger.Info("database connected")

	logger.Info("sessions configured",
		slog.Bool("cookie_secure", cfg.CookieSecure),
		slog.Duration("ttl", cfg.SessionTTL),
		slog.Any("allowed_origins", cfg.AllowedOrigins))

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.Port),
		Handler:           New(db, logger, cfg),
		ReadHeaderTimeout: 15 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("listening", slog.Int("port", cfg.Port))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- fmt.Errorf("serve: %w", err)
			return
		}
		serveErr <- nil
	}()

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

func OpenDatabase(ctx context.Context, cfg Config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(cfg.DatabaseMaxOpen)
	db.SetMaxIdleConns(cfg.DatabaseMaxIdle)
	db.SetConnMaxLifetime(time.Hour)

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}
