package game

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

type CatalogueFilter struct {
	Page     int
	Size     int
	Search   string
	Category string
	Sort     string
	NewSince *time.Time
}

type AdminFilter struct {
	Page     int
	Size     int
	Search   string
	Category string
	Status   string
}

const gameColumns = `
	g.id::text, g.slug, g.name, COALESCE(g.description, ''), g.category_slug, c.name,
	g.provider, g.status, g.integration, g.currency, g.min_wager_minor, g.max_wager_minor, g.wager_step_minor,
	COALESCE(g.thumbnail_path, ''), g.rtp_basis_points, g.created_at, g.updated_at`

const adminColumns = gameColumns + `,
	(SELECT count(*) FROM game_rounds r WHERE r.game_id = g.id AND r.started_at >= now() - interval '30 days')`

const catalogueWhere = `
	FROM games g
	JOIN game_categories c ON c.slug = g.category_slug
	WHERE g.status = 'active'
	  AND ($1 = '' OR g.category_slug = $1)
	  AND ($2 = ''
	    OR position(lower($2) in lower(g.name)) > 0
	    OR position(lower($2) in lower(c.name)) > 0
	    OR position(lower($2) in lower(g.provider)) > 0)
	  AND ($3::timestamptz IS NULL OR g.created_at >= $3::timestamptz)`

const adminWhere = `
	FROM games g
	JOIN game_categories c ON c.slug = g.category_slug
	WHERE ($1 = '' OR g.category_slug = $1)
	  AND ($2 = ''
	    OR position(lower($2) in lower(g.name)) > 0
	    OR position(lower($2) in lower(g.slug)) > 0
	    OR position(lower($2) in lower(g.provider)) > 0)
	  AND ($3 = '' OR g.status = $3)`

const (
	countCatalogueSQL = `SELECT count(*)` + catalogueWhere

	listCatalogueByNameSQL = `SELECT` + gameColumns + catalogueWhere + `
	ORDER BY g.name ASC, g.slug ASC
	LIMIT $4 OFFSET $5`

	listCatalogueByNewestSQL = `SELECT` + gameColumns + catalogueWhere + `
	ORDER BY g.created_at DESC, g.slug ASC
	LIMIT $4 OFFSET $5`

	selectActiveBySlugSQL = `SELECT` + gameColumns + `
	FROM games g
	JOIN game_categories c ON c.slug = g.category_slug
	WHERE g.slug = $1 AND g.status = 'active'`

	countAdminSQL = `SELECT count(*)` + adminWhere

	listAdminSQL = `SELECT` + adminColumns + adminWhere + `
	ORDER BY g.name ASC, g.slug ASC
	LIMIT $4 OFFSET $5`

	selectAdminByIDSQL = `SELECT` + adminColumns + `
	FROM games g
	JOIN game_categories c ON c.slug = g.category_slug
	WHERE g.id = ($1::text)::uuid`

	selectAdminByIDForUpdateSQL = selectAdminByIDSQL + ` FOR UPDATE OF g`

	insertGameSQL = `
	INSERT INTO games (slug, name, description, category_slug, provider, status, currency, min_wager_minor, max_wager_minor, wager_step_minor)
	VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9, $10)
	RETURNING id::text`

	updateGameSQL = `
	UPDATE games
	   SET name = $2, description = NULLIF($3, ''), category_slug = $4, provider = $5, status = $6,
	       currency = $7, min_wager_minor = $8, max_wager_minor = $9, wager_step_minor = $10,
	       updated_at = now()
	 WHERE id = ($1::text)::uuid`

	listCategoriesSQL = `
	SELECT c.slug, c.name, count(g.id) FILTER (WHERE g.status = 'active')
	FROM game_categories c
	LEFT JOIN games g ON g.category_slug = c.slug
	GROUP BY c.slug, c.name, c.sort_order
	ORDER BY c.sort_order ASC, c.name ASC`

	categoryExistsSQL = `SELECT EXISTS (SELECT 1 FROM game_categories WHERE slug = $1)`

	currencyMinorUnitsSQL = `SELECT minor_units FROM currencies WHERE code = $1 AND enabled = true`

	gameHasRoundsSQL = `SELECT EXISTS (SELECT 1 FROM game_rounds WHERE game_id = ($1::text)::uuid)`
)

type querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

func ListCatalogue(ctx context.Context, db *sql.DB, filter CatalogueFilter) ([]Game, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, countCatalogueSQL, filter.Category, filter.Search, filter.NewSince).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("game: count catalogue: %w", err)
	}

	listSQL := listCatalogueByNameSQL
	if filter.Sort == SortNewest {
		listSQL = listCatalogueByNewestSQL
	}
	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, listSQL, filter.Category, filter.Search, filter.NewSince, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("game: list catalogue: %w", err)
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		item, err := scanGame(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("game: scan game: %w", err)
		}
		games = append(games, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("game: catalogue rows: %w", err)
	}
	return games, total, nil
}

const favoritesWhere = `
	FROM game_favorites f
	JOIN games g ON g.id = f.game_id
	JOIN game_categories c ON c.slug = g.category_slug
	WHERE f.user_id = ($1::text)::uuid AND g.status = 'active'`

func ListFavorites(ctx context.Context, db *sql.DB, userID string, page, size int) ([]Game, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*)`+favoritesWhere, userID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("game: count favorites: %w", err)
	}
	offset := int64(page-1) * int64(size)
	rows, err := db.QueryContext(ctx, `SELECT `+gameColumns+favoritesWhere+` ORDER BY f.created_at DESC, g.slug ASC LIMIT $2 OFFSET $3`, userID, size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("game: list favorites: %w", err)
	}
	defer rows.Close()

	games := make([]Game, 0)
	for rows.Next() {
		item, err := scanGame(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("game: scan favorite: %w", err)
		}
		games = append(games, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("game: favorite rows: %w", err)
	}
	return games, total, nil
}

func AddFavorite(ctx context.Context, db *sql.DB, userID, gameID string) error {
	if _, err := db.ExecContext(ctx, `INSERT INTO game_favorites (user_id, game_id) VALUES (($1::text)::uuid, ($2::text)::uuid) ON CONFLICT (user_id, game_id) DO NOTHING`, userID, gameID); err != nil {
		return fmt.Errorf("game: add favorite: %w", err)
	}
	return nil
}

func RemoveFavorite(ctx context.Context, db *sql.DB, userID, gameID string) error {
	if _, err := db.ExecContext(ctx, `DELETE FROM game_favorites WHERE user_id = ($1::text)::uuid AND game_id = ($2::text)::uuid`, userID, gameID); err != nil {
		return fmt.Errorf("game: remove favorite: %w", err)
	}
	return nil
}

func FindActiveBySlug(ctx context.Context, db *sql.DB, slug string) (Game, error) {
	item, err := scanGame(db.QueryRowContext(ctx, selectActiveBySlugSQL, slug))
	if errors.Is(err, sql.ErrNoRows) {
		return Game{}, ErrNoGame
	}
	if err != nil {
		return Game{}, fmt.Errorf("game: find active by slug: %w", err)
	}
	return item, nil
}

func ListAdmin(ctx context.Context, db *sql.DB, filter AdminFilter) ([]AdminGame, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, countAdminSQL, filter.Category, filter.Search, filter.Status).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("game: count admin list: %w", err)
	}

	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, listAdminSQL, filter.Category, filter.Search, filter.Status, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("game: admin list: %w", err)
	}
	defer rows.Close()

	games := make([]AdminGame, 0)
	for rows.Next() {
		item, err := scanAdminGame(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("game: scan admin game: %w", err)
		}
		games = append(games, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("game: admin rows: %w", err)
	}
	return games, total, nil
}

func FindByID(ctx context.Context, db querier, id string) (AdminGame, error) {
	item, err := scanAdminGame(db.QueryRowContext(ctx, selectAdminByIDSQL, id))
	if errors.Is(err, sql.ErrNoRows) {
		return AdminGame{}, ErrNoGame
	}
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: find by id: %w", err)
	}
	return item, nil
}

func findByIDForUpdate(ctx context.Context, tx *sql.Tx, id string) (AdminGame, error) {
	item, err := scanAdminGame(tx.QueryRowContext(ctx, selectAdminByIDForUpdateSQL, id))
	if errors.Is(err, sql.ErrNoRows) {
		return AdminGame{}, ErrNoGame
	}
	if err != nil {
		return AdminGame{}, fmt.Errorf("game: lock by id: %w", err)
	}
	return item, nil
}

func insert(ctx context.Context, tx *sql.Tx, g Game) (string, error) {
	var id string
	err := tx.QueryRowContext(ctx, insertGameSQL,
		g.Slug, g.Name, g.Description, g.CategorySlug, g.Provider, g.Status, g.Currency,
		g.MinWagerMinor, g.MaxWagerMinor, g.WagerStepMinor,
	).Scan(&id)
	if isUniqueViolation(err) {
		return "", ErrSlugTaken
	}
	if err != nil {
		return "", fmt.Errorf("game: insert: %w", err)
	}
	return id, nil
}

func update(ctx context.Context, tx *sql.Tx, g Game) error {
	_, err := tx.ExecContext(ctx, updateGameSQL,
		g.ID, g.Name, g.Description, g.CategorySlug, g.Provider, g.Status, g.Currency,
		g.MinWagerMinor, g.MaxWagerMinor, g.WagerStepMinor,
	)
	if err != nil {
		return fmt.Errorf("game: update: %w", err)
	}
	return nil
}

func categoryExists(ctx context.Context, tx *sql.Tx, slug string) (bool, error) {
	var exists bool
	if err := tx.QueryRowContext(ctx, categoryExistsSQL, slug).Scan(&exists); err != nil {
		return false, fmt.Errorf("game: category exists: %w", err)
	}
	return exists, nil
}

func currencyMinorUnits(ctx context.Context, tx *sql.Tx, code string) (int, error) {
	var minorUnits int
	err := tx.QueryRowContext(ctx, currencyMinorUnitsSQL, code).Scan(&minorUnits)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrCurrencyUnavailable
	}
	if err != nil {
		return 0, fmt.Errorf("game: currency minor units: %w", err)
	}
	return minorUnits, nil
}

func hasRounds(ctx context.Context, tx *sql.Tx, gameID string) (bool, error) {
	var exists bool
	if err := tx.QueryRowContext(ctx, gameHasRoundsSQL, gameID).Scan(&exists); err != nil {
		return false, fmt.Errorf("game: has rounds: %w", err)
	}
	return exists, nil
}

func ListCategories(ctx context.Context, db *sql.DB) ([]Category, error) {
	rows, err := db.QueryContext(ctx, listCategoriesSQL)
	if err != nil {
		return nil, fmt.Errorf("game: list categories: %w", err)
	}
	defer rows.Close()

	categories := make([]Category, 0)
	for rows.Next() {
		var item Category
		if err := rows.Scan(&item.Slug, &item.Name, &item.GameCount); err != nil {
			return nil, fmt.Errorf("game: scan category: %w", err)
		}
		categories = append(categories, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("game: category rows: %w", err)
	}
	return categories, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanGame(row scanner) (Game, error) {
	var item Game
	var rtp sql.NullInt64
	err := row.Scan(
		&item.ID, &item.Slug, &item.Name, &item.Description, &item.CategorySlug, &item.CategoryName,
		&item.Provider, &item.Status, &item.Integration, &item.Currency, &item.MinWagerMinor, &item.MaxWagerMinor, &item.WagerStepMinor,
		&item.ThumbnailPath, &rtp, &item.CreatedAt, &item.UpdatedAt,
	)
	if err != nil {
		return Game{}, err
	}
	item.RTPBasisPoints = basisPointsOf(rtp)
	return item, nil
}

func scanAdminGame(row scanner) (AdminGame, error) {
	var item AdminGame
	var rtp sql.NullInt64
	err := row.Scan(
		&item.ID, &item.Slug, &item.Name, &item.Description, &item.CategorySlug, &item.CategoryName,
		&item.Provider, &item.Status, &item.Integration, &item.Currency, &item.MinWagerMinor, &item.MaxWagerMinor, &item.WagerStepMinor,
		&item.ThumbnailPath, &rtp, &item.CreatedAt, &item.UpdatedAt,
		&item.Rounds30d,
	)
	if err != nil {
		return AdminGame{}, err
	}
	item.RTPBasisPoints = basisPointsOf(rtp)
	return item, nil
}

func basisPointsOf(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	basisPoints := int(value.Int64)
	return &basisPoints
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}
