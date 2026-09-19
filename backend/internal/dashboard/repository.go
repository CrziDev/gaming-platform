package dashboard

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
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
	ReturnedTodayMinor   int64
	HoldTodayMinor       int64
	RoundsToday          int
	PlayersToday         int
	EffectiveRTPBasisPts int
	ExpectedRTPBasisPts  int
	Games                []GameActivity
	Currency             string
}

type GameActivity struct {
	GameID               string
	Slug                 string
	Name                 string
	Rounds               int
	StakedMinor          int64
	ReturnedMinor        int64
	HoldMinor            int64
	EffectiveRTPBasisPts int
	ExpectedRTPBasisPts  int
}

// Get reports today's settled rounds only: a wager refunded on a failed or
// cancelled round never counts as stake, and every ratio is weighted by the
// return each round recorded when it opened, not by the games' current setting.
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
		SELECT count(*), count(DISTINCT user_id),
			COALESCE(sum(stake_minor), 0),
			COALESCE(sum(win_minor), 0),
			COALESCE(div(sum(win_minor)::numeric * 10000, NULLIF(sum(stake_minor), 0)), 0)::int,
			COALESCE(div(sum(stake_minor::numeric * rtp_basis_points), NULLIF(sum(stake_minor), 0)), 0)::int
		FROM game_rounds
		WHERE currency = $1 AND status = 'settled' AND settled_at >= date_trunc('day', now())`, currency).Scan(
		&result.RoundsToday, &result.PlayersToday,
		&result.StakedTodayMinor, &result.ReturnedTodayMinor,
		&result.EffectiveRTPBasisPts, &result.ExpectedRTPBasisPts)
	if err != nil {
		return Summary{}, fmt.Errorf("dashboard: activity summary: %w", err)
	}
	if !money.IsSafeMinor(result.StakedTodayMinor) || !money.IsSafeMinor(result.ReturnedTodayMinor) {
		return Summary{}, errors.New("dashboard: activity totals exceed the exact JSON integer range")
	}
	result.HoldTodayMinor = result.StakedTodayMinor - result.ReturnedTodayMinor

	result.Games, err = listGameActivity(ctx, db, currency)
	if err != nil {
		return Summary{}, err
	}
	return result, nil
}

func listGameActivity(ctx context.Context, db *sql.DB, currency string) ([]GameActivity, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT g.id::text, g.slug, g.name, count(*),
			sum(r.stake_minor),
			sum(r.win_minor),
			div(sum(r.win_minor)::numeric * 10000, sum(r.stake_minor))::int,
			div(sum(r.stake_minor::numeric * r.rtp_basis_points), sum(r.stake_minor))::int
		FROM game_rounds r
		JOIN games g ON g.id = r.game_id
		WHERE r.currency = $1 AND r.status = 'settled' AND r.settled_at >= date_trunc('day', now())
		GROUP BY g.id, g.slug, g.name
		ORDER BY sum(r.stake_minor) DESC, g.name`, currency)
	if err != nil {
		return nil, fmt.Errorf("dashboard: game activity: %w", err)
	}
	defer rows.Close()

	games := make([]GameActivity, 0)
	for rows.Next() {
		var item GameActivity
		if err := rows.Scan(&item.GameID, &item.Slug, &item.Name, &item.Rounds,
			&item.StakedMinor, &item.ReturnedMinor,
			&item.EffectiveRTPBasisPts, &item.ExpectedRTPBasisPts); err != nil {
			return nil, fmt.Errorf("dashboard: scan game activity: %w", err)
		}
		if !money.IsSafeMinor(item.StakedMinor) || !money.IsSafeMinor(item.ReturnedMinor) {
			return nil, errors.New("dashboard: game totals exceed the exact JSON integer range")
		}
		item.HoldMinor = item.StakedMinor - item.ReturnedMinor
		games = append(games, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("dashboard: game activity rows: %w", err)
	}
	return games, nil
}
