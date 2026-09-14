package rtp

import (
	"context"
	"database/sql"
	"log/slog"
	"time"
)

func RunReverter(ctx context.Context, db *sql.DB, logger *slog.Logger, interval time.Duration) {
	reconcile := func() {
		count, err := RevertExpired(ctx, db, time.Now().UTC())
		if err != nil {
			if ctx.Err() == nil {
				logger.Error("RTP reversion failed", slog.Any("error", err))
			}
			return
		}
		if count > 0 {
			logger.Info("expired RTP profiles reverted", slog.Int("count", count))
		}
	}

	reconcile()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			reconcile()
		}
	}
}
