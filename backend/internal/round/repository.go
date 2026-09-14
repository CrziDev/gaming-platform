package round

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

type gameConfig struct {
	ID             string
	Status         string
	Currency       string
	MinWagerMinor  int64
	MaxWagerMinor  int64
	WagerStepMinor int64
}

const roundColumns = `
	id::text, round_key, user_id::text, game_id::text, wallet_id::text, currency,
	COALESCE(rtp_profile_id::text, ''), status, stake_minor, win_minor, multiplier_hundredths,
	COALESCE(engine_reference, ''), result_data, started_at, settled_at, created_at, updated_at`

const roundReadColumns = `
	r.id::text, r.round_key, r.user_id::text, r.game_id::text, r.wallet_id::text, r.currency,
	COALESCE(r.rtp_profile_id::text, ''), r.status, r.stake_minor, r.win_minor, r.multiplier_hundredths,
	COALESCE(r.engine_reference, ''), r.result_data, r.started_at, r.settled_at, r.created_at, r.updated_at,
	g.slug, g.name, u.email, u.display_name`

const roundReadFrom = `
	FROM game_rounds r
	JOIN games g ON g.id = r.game_id
	JOIN users u ON u.id = r.user_id`

const roundReadWhere = `
	WHERE ($1 = '' OR r.user_id = ($1::text)::uuid)
	  AND ($2 = '' OR r.game_id = ($2::text)::uuid)
	  AND ($3 = '' OR r.status = $3)
	  AND ($4 = '' OR r.currency = $4)
	  AND ($5::timestamptz IS NULL OR r.started_at >= $5::timestamptz)
	  AND ($6::timestamptz IS NULL OR r.started_at <= $6::timestamptz)`

func List(ctx context.Context, db *sql.DB, filter ReadFilter) ([]Record, int, error) {
	args := []any{filter.UserID, filter.GameID, filter.Status, filter.Currency, filter.From, filter.To}
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*)`+roundReadFrom+roundReadWhere, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("round: count read list: %w", err)
	}

	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, `SELECT `+roundReadColumns+roundReadFrom+roundReadWhere+`
		ORDER BY r.started_at DESC, r.id DESC
		LIMIT $7 OFFSET $8`, append(args, filter.Size, offset)...)
	if err != nil {
		return nil, 0, fmt.Errorf("round: read list: %w", err)
	}
	defer rows.Close()

	items := make([]Record, 0)
	for rows.Next() {
		item, err := scanRecord(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("round: scan read list: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("round: read list rows: %w", err)
	}
	return items, total, nil
}

func GetForPlayer(ctx context.Context, db *sql.DB, userID, roundID string) (Record, error) {
	item, err := scanRecord(db.QueryRowContext(ctx, `SELECT `+roundReadColumns+roundReadFrom+`
		WHERE r.id = ($1::text)::uuid AND r.user_id = ($2::text)::uuid`, roundID, userID))
	if errors.Is(err, sql.ErrNoRows) {
		return Record{}, ErrNotFound
	}
	if err != nil {
		return Record{}, fmt.Errorf("round: read player round: %w", err)
	}
	return item, nil
}

func findByKey(ctx context.Context, tx *sql.Tx, key string) (Round, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `SELECT `+roundColumns+` FROM game_rounds WHERE round_key = $1`, key))
	if err != nil {
		return Round{}, err
	}
	return item, nil
}

func findByID(ctx context.Context, tx *sql.Tx, id string) (Round, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `SELECT `+roundColumns+` FROM game_rounds WHERE id = ($1::text)::uuid`, id))
	if err != nil {
		return Round{}, err
	}
	return item, nil
}

func lockByID(ctx context.Context, tx *sql.Tx, id string) (Round, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `SELECT `+roundColumns+` FROM game_rounds WHERE id = ($1::text)::uuid FOR UPDATE`, id))
	if err != nil {
		return Round{}, err
	}
	return item, nil
}

func gameCurrency(ctx context.Context, tx *sql.Tx, gameID string) (string, error) {
	var currency string
	err := tx.QueryRowContext(ctx, `SELECT currency FROM games WHERE id = ($1::text)::uuid`, gameID).Scan(&currency)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrGameUnavailable
	}
	if err != nil {
		return "", fmt.Errorf("round: read game currency: %w", err)
	}
	return currency, nil
}

func lockWallet(ctx context.Context, tx *sql.Tx, userID, currency string) (string, error) {
	var walletID string
	err := tx.QueryRowContext(ctx, `SELECT id::text FROM wallets WHERE user_id = ($1::text)::uuid AND currency = $2 FOR UPDATE`, userID, currency).Scan(&walletID)
	if err != nil {
		return "", err
	}
	return walletID, nil
}

func lockGame(ctx context.Context, tx *sql.Tx, gameID string) (gameConfig, error) {
	var config gameConfig
	err := tx.QueryRowContext(ctx, `
		SELECT id::text, status, currency, min_wager_minor, max_wager_minor, wager_step_minor
		FROM games
		WHERE id = ($1::text)::uuid
		FOR SHARE`, gameID).Scan(
		&config.ID, &config.Status, &config.Currency,
		&config.MinWagerMinor, &config.MaxWagerMinor, &config.WagerStepMinor,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return gameConfig{}, ErrGameUnavailable
	}
	if err != nil {
		return gameConfig{}, fmt.Errorf("round: lock game: %w", err)
	}
	return config, nil
}

func activeProfileID(ctx context.Context, tx *sql.Tx, gameID string) (string, error) {
	var profileID string
	err := tx.QueryRowContext(ctx, `SELECT id::text FROM rtp_profiles WHERE game_id = ($1::text)::uuid AND status = 'active'`, gameID).Scan(&profileID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrProfileUnavailable
	}
	if err != nil {
		return "", fmt.Errorf("round: find active RTP profile: %w", err)
	}
	return profileID, nil
}

func insertOpen(ctx context.Context, tx *sql.Tx, in OpenInput, walletID, currency, profileID string) (Round, bool, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `
		INSERT INTO game_rounds (round_key, user_id, game_id, wallet_id, currency, rtp_profile_id, stake_minor)
		VALUES ($1, ($2::text)::uuid, ($3::text)::uuid, ($4::text)::uuid, $5, ($6::text)::uuid, $7)
		ON CONFLICT (round_key) DO NOTHING
		RETURNING `+roundColumns,
		in.RoundKey, in.UserID, in.GameID, walletID, currency, profileID, in.StakeMinor,
	))
	if errors.Is(err, sql.ErrNoRows) {
		existing, findErr := findByKey(ctx, tx, in.RoundKey)
		if findErr != nil {
			return Round{}, false, fmt.Errorf("round: find conflicting round: %w", findErr)
		}
		return existing, false, nil
	}
	if err != nil {
		return Round{}, false, fmt.Errorf("round: insert open round: %w", err)
	}
	return item, true, nil
}

func updateSettled(ctx context.Context, tx *sql.Tx, in SettleInput) (Round, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `
		UPDATE game_rounds
		SET status = 'settled', win_minor = $2, multiplier_hundredths = $3,
			engine_reference = NULLIF($4, ''), result_data = NULLIF($5, '')::jsonb,
			settled_at = now(), updated_at = now()
		WHERE id = ($1::text)::uuid AND status = 'open'
		RETURNING `+roundColumns,
		in.RoundID, in.WinMinor, in.MultiplierHundredths, in.EngineReference, string(in.ResultData),
	))
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, ErrRoundSettled
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: settle: %w", err)
	}
	return item, nil
}

func updateTerminated(ctx context.Context, tx *sql.Tx, in TerminateInput, status string) (Round, error) {
	item, err := scanRound(tx.QueryRowContext(ctx, `
		UPDATE game_rounds
		SET status = $2, engine_reference = NULLIF($3, ''), result_data = NULLIF($4, '')::jsonb,
			updated_at = now()
		WHERE id = ($1::text)::uuid AND status = 'open'
		RETURNING `+roundColumns,
		in.RoundID, status, in.EngineReference, string(in.ResultData),
	))
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, ErrRoundClosed
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: terminate: %w", err)
	}
	return item, nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanRound(row scanner) (Round, error) {
	var item Round
	var resultData []byte
	err := row.Scan(
		&item.ID, &item.RoundKey, &item.UserID, &item.GameID, &item.WalletID, &item.Currency,
		&item.RTPProfileID, &item.Status, &item.StakeMinor, &item.WinMinor, &item.MultiplierHundredths,
		&item.EngineReference, &resultData, &item.StartedAt, &item.SettledAt, &item.CreatedAt, &item.UpdatedAt,
	)
	if resultData != nil {
		item.ResultData = resultData
	}
	return item, err
}

func scanRecord(row scanner) (Record, error) {
	var item Record
	var resultData []byte
	err := row.Scan(
		&item.ID, &item.RoundKey, &item.UserID, &item.GameID, &item.WalletID, &item.Currency,
		&item.RTPProfileID, &item.Status, &item.StakeMinor, &item.WinMinor, &item.MultiplierHundredths,
		&item.EngineReference, &resultData, &item.StartedAt, &item.SettledAt, &item.CreatedAt, &item.UpdatedAt,
		&item.GameSlug, &item.GameName, &item.UserEmail, &item.UserDisplayName,
	)
	if resultData != nil {
		item.ResultData = resultData
	}
	return item, err
}
