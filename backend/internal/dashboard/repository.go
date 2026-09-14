package dashboard

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/gaming-platform/backend/internal/money"
)

var ErrCurrencyUnavailable = errors.New("currency is unavailable")

type Summary struct {
	PendingDeposits      int
	PendingHeldMinor     int64
	OldestPendingAt      *time.Time
	ApprovedTodayMinor   int64
	ApprovedTodayCount   int
	StakedTodayMinor     int64
	RoundsToday          int
	PlayersToday         int
	ReturnedTodayMinor   int64
	EffectiveRTPBasisPts int
	TargetRTPBasisPoints int
	Currency             string
}

func Get(ctx context.Context, db *sql.DB, currency string) (Summary, error) {
	var result Summary
	result.Currency = currency
	var enabled bool
	err := db.QueryRowContext(ctx, `SELECT enabled FROM currencies WHERE code = $1`, currency).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return Summary{}, ErrCurrencyUnavailable
	}
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: find currency: %w", err)
	}
	if !enabled {
		return Summary{}, ErrCurrencyUnavailable
	}

	var oldestPendingAt sql.NullTime
	err = db.QueryRowContext(ctx, `
		SELECT count(*) FILTER (WHERE status = 'pending'),
			COALESCE(sum(amount_minor) FILTER (WHERE status = 'pending'), 0),
			min(created_at) FILTER (WHERE status = 'pending'),
			COALESCE(sum(amount_minor) FILTER (WHERE status = 'approved' AND reviewed_at >= date_trunc('day', now())), 0),
			count(*) FILTER (WHERE status = 'approved' AND reviewed_at >= date_trunc('day', now()))
		FROM deposit_requests WHERE currency = $1`, currency).Scan(
		&result.PendingDeposits, &result.PendingHeldMinor, &oldestPendingAt,
		&result.ApprovedTodayMinor, &result.ApprovedTodayCount)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: deposit summary: %w", err)
	}
	if oldestPendingAt.Valid {
		result.OldestPendingAt = &oldestPendingAt.Time
	}
	if !money.IsSafeMinor(result.PendingHeldMinor) || !money.IsSafeMinor(result.ApprovedTodayMinor) {
		return Summary{}, errors.New("dashboard: deposit totals exceed the exact JSON integer range")
	}
	err = db.QueryRowContext(ctx, `
		SELECT COALESCE(sum(abs(amount_minor)) FILTER (WHERE kind = 'wager'), 0),
			COALESCE(sum(amount_minor) FILTER (WHERE kind = 'win'), 0),
			count(DISTINCT user_id) FILTER (WHERE kind = 'wager'),
			COALESCE((SELECT count(*) FROM game_rounds WHERE currency = $1 AND created_at >= date_trunc('day', now())), 0),
			COALESCE((SELECT round(avg(target_basis_points))::int FROM rtp_profiles p JOIN games g ON g.id = p.game_id WHERE g.currency = $1 AND p.status = 'active'), 0)
		FROM wallet_transactions WHERE currency = $1 AND created_at >= date_trunc('day', now())`, currency).Scan(
		&result.StakedTodayMinor, &result.ReturnedTodayMinor, &result.PlayersToday,
		&result.RoundsToday, &result.TargetRTPBasisPoints)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: activity summary: %w", err)
	}
	if !money.IsSafeMinor(result.StakedTodayMinor) || !money.IsSafeMinor(result.ReturnedTodayMinor) {
		return Summary{}, errors.New("dashboard: activity totals exceed the exact JSON integer range")
	}
	if result.StakedTodayMinor > 0 {
		returned := big.NewInt(result.ReturnedTodayMinor)
		basisPoints := returned.Mul(returned, big.NewInt(10000))
		basisPoints.Quo(basisPoints, big.NewInt(result.StakedTodayMinor))
		if basisPoints.IsInt64() {
			result.EffectiveRTPBasisPts = int(basisPoints.Int64())
		}
	}
	return result, nil
}
