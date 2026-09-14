package rtp

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/gaming-platform/backend/internal/game"
	"github.com/jackc/pgx/v5/pgconn"
)

type Filter struct {
	Page   int
	Size   int
	GameID string
	Status string
}

const profileColumns = `
	p.id::text, p.game_id::text, g.slug, g.name,
	p.name, p.version, p.target_basis_points, p.status, COALESCE(p.engine_config_ref, ''),
	p.theoretical_basis_points, p.observed_basis_points, p.verified_at,
	p.effective_from, p.effective_until,
	COALESCE(g.default_rtp_profile_id = p.id, false),
	COALESCE(p.created_by::text, ''), COALESCE(u.display_name, ''),
	p.created_at, p.updated_at`

const profileFrom = `
	FROM rtp_profiles p
	JOIN games g ON g.id = p.game_id
	LEFT JOIN users u ON u.id = p.created_by`

const (
	listWhere = `
	WHERE (NULLIF($1, '')::uuid IS NULL OR p.game_id = NULLIF($1, '')::uuid)
	  AND ($2 = '' OR p.status = $2)`

	countSQL = `SELECT count(*)` + profileFrom + listWhere

	listSQL = `SELECT` + profileColumns + profileFrom + listWhere + `
	ORDER BY p.created_at DESC, p.version DESC
	LIMIT $3 OFFSET $4`

	listByGameSQL = `SELECT` + profileColumns + profileFrom + `
	WHERE p.game_id = ($1::text)::uuid
	ORDER BY p.created_at DESC, p.version DESC`

	selectByIDSQL = `SELECT` + profileColumns + profileFrom + `
	WHERE p.id = ($1::text)::uuid`

	selectByIDForUpdateSQL = selectByIDSQL + ` FOR UPDATE OF p`

	selectActiveForGameSQL = `SELECT` + profileColumns + profileFrom + `
	WHERE p.game_id = ($1::text)::uuid AND p.status = 'active'
	FOR UPDATE OF p`

	lockGameSQL = `SELECT id FROM games WHERE id = ($1::text)::uuid FOR UPDATE`

	selectDefaultForGameSQL = `SELECT COALESCE(default_rtp_profile_id::text, '') FROM games WHERE id = ($1::text)::uuid`

	setDefaultForGameSQL = `UPDATE games SET default_rtp_profile_id = NULLIF($2, '')::uuid, updated_at = now() WHERE id = ($1::text)::uuid`

	listExpiredGameIDsSQL = `
	SELECT game_id::text
	FROM rtp_profiles
	WHERE status = 'active' AND effective_until <= $1
	ORDER BY effective_until, game_id`

	insertSQL = `
	INSERT INTO rtp_profiles (game_id, name, version, target_basis_points, status, engine_config_ref, created_by)
	VALUES (($1::text)::uuid, $2, $3, $4, 'draft', NULLIF($5, ''), NULLIF($6, '')::uuid)
	RETURNING id::text`

	updateDraftSQL = `
	UPDATE rtp_profiles
	   SET name = $2, version = $3, target_basis_points = $4, engine_config_ref = NULLIF($5, ''), updated_at = now()
	 WHERE id = ($1::text)::uuid`

	setStatusSQL = `
	UPDATE rtp_profiles
	   SET status = $2, effective_from = $3, effective_until = $4, updated_at = now()
	 WHERE id = ($1::text)::uuid`
)

type querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func List(ctx context.Context, db *sql.DB, filter Filter) ([]Profile, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, countSQL, filter.GameID, filter.Status).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("rtp: count profiles: %w", err)
	}
	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, listSQL, filter.GameID, filter.Status, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("rtp: list profiles: %w", err)
	}
	defer rows.Close()
	profiles, err := collect(rows)
	if err != nil {
		return nil, 0, err
	}
	return profiles, total, nil
}

func ListByGame(ctx context.Context, db *sql.DB, gameID string) ([]Profile, error) {
	rows, err := db.QueryContext(ctx, listByGameSQL, gameID)
	if err != nil {
		return nil, fmt.Errorf("rtp: list profiles by game: %w", err)
	}
	defer rows.Close()
	return collect(rows)
}

func FindByID(ctx context.Context, db querier, id string) (Profile, error) {
	item, err := scanProfile(db.QueryRowContext(ctx, selectByIDSQL, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, ErrNoProfile
	}
	if err != nil {
		return Profile{}, fmt.Errorf("rtp: find by id: %w", err)
	}
	return item, nil
}

func findByIDForUpdate(ctx context.Context, tx *sql.Tx, id string) (Profile, error) {
	item, err := scanProfile(tx.QueryRowContext(ctx, selectByIDForUpdateSQL, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, ErrNoProfile
	}
	if err != nil {
		return Profile{}, fmt.Errorf("rtp: lock by id: %w", err)
	}
	return item, nil
}

func lockGame(ctx context.Context, tx *sql.Tx, gameID string) error {
	var id string
	err := tx.QueryRowContext(ctx, lockGameSQL, gameID).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return game.ErrNoGame
	}
	if err != nil {
		return fmt.Errorf("rtp: lock game: %w", err)
	}
	return nil
}

func defaultForGame(ctx context.Context, tx *sql.Tx, gameID string) (string, error) {
	var id string
	if err := tx.QueryRowContext(ctx, selectDefaultForGameSQL, gameID).Scan(&id); err != nil {
		return "", fmt.Errorf("rtp: read default profile: %w", err)
	}
	return id, nil
}

func setDefaultForGame(ctx context.Context, tx *sql.Tx, gameID, profileID string) error {
	if _, err := tx.ExecContext(ctx, setDefaultForGameSQL, gameID, profileID); err != nil {
		return fmt.Errorf("rtp: set default profile: %w", err)
	}
	return nil
}

func expiredGameIDs(ctx context.Context, db *sql.DB, now time.Time) ([]string, error) {
	rows, err := db.QueryContext(ctx, listExpiredGameIDsSQL, now)
	if err != nil {
		return nil, fmt.Errorf("rtp: list expired profiles: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("rtp: scan expired profile game: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rtp: expired profile rows: %w", err)
	}
	return ids, nil
}

func activeForGame(ctx context.Context, tx *sql.Tx, gameID string) (Profile, bool, error) {
	item, err := scanProfile(tx.QueryRowContext(ctx, selectActiveForGameSQL, gameID))
	if errors.Is(err, sql.ErrNoRows) {
		return Profile{}, false, nil
	}
	if err != nil {
		return Profile{}, false, fmt.Errorf("rtp: active for game: %w", err)
	}
	return item, true, nil
}

func insert(ctx context.Context, tx *sql.Tx, p Profile) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, insertSQL, p.GameID, p.Name, p.Version, p.TargetBasisPoints, p.EngineConfigRef, p.CreatedBy).Scan(&id)
	if isUniqueViolation(err) {
		return "", ErrNameVersionTaken
	}
	if err != nil {
		return "", fmt.Errorf("rtp: insert: %w", err)
	}
	return id, nil
}

func updateDraft(ctx context.Context, tx *sql.Tx, p Profile) error {
	_, err := tx.ExecContext(ctx, updateDraftSQL, p.ID, p.Name, p.Version, p.TargetBasisPoints, p.EngineConfigRef)
	if isUniqueViolation(err) {
		return ErrNameVersionTaken
	}
	if err != nil {
		return fmt.Errorf("rtp: update draft: %w", err)
	}
	return nil
}

func setStatus(ctx context.Context, tx *sql.Tx, id, status string, from, until *time.Time) error {
	if _, err := tx.ExecContext(ctx, setStatusSQL, id, status, from, until); err != nil {
		return fmt.Errorf("rtp: set status %s: %w", status, err)
	}
	return nil
}

func collect(rows *sql.Rows) ([]Profile, error) {
	profiles := make([]Profile, 0)
	for rows.Next() {
		item, err := scanProfile(rows)
		if err != nil {
			return nil, fmt.Errorf("rtp: scan profile: %w", err)
		}
		profiles = append(profiles, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rtp: profile rows: %w", err)
	}
	return profiles, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanProfile(row scanner) (Profile, error) {
	var item Profile
	var theoretical, observed sql.NullInt64
	var verifiedAt, from, until sql.NullTime
	err := row.Scan(
		&item.ID, &item.GameID, &item.GameSlug, &item.GameName,
		&item.Name, &item.Version, &item.TargetBasisPoints, &item.Status, &item.EngineConfigRef,
		&theoretical, &observed, &verifiedAt,
		&from, &until,
		&item.IsDefault,
		&item.CreatedBy, &item.CreatedByDisplayName,
		&item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return Profile{}, err
	}
	if theoretical.Valid {
		value := int(theoretical.Int64)
		item.TheoreticalBasisPoints = &value
	}
	if observed.Valid {
		value := int(observed.Int64)
		item.ObservedBasisPoints = &value
	}
	if verifiedAt.Valid {
		item.VerifiedAt = &verifiedAt.Time
	}
	if from.Valid {
		item.EffectiveFrom = &from.Time
	}
	if until.Valid {
		item.EffectiveUntil = &until.Time
	}
	return item, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
