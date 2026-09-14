package currency

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/gaming-platform/backend/internal/money"
)

const listEnabledSQL = `
	SELECT code, name, symbol, minor_units, deposit_min_minor, deposit_max_minor
	FROM currencies
	WHERE enabled = true
	ORDER BY code ASC`

func ListEnabled(ctx context.Context, db *sql.DB) ([]Currency, error) {
	rows, err := db.QueryContext(ctx, listEnabledSQL)
	if err != nil {
		return nil, fmt.Errorf("currency: list enabled: %w", err)
	}
	defer rows.Close()

	currencies := make([]Currency, 0)
	for rows.Next() {
		var currency Currency
		if err := rows.Scan(
			&currency.Code,
			&currency.Name,
			&currency.Symbol,
			&currency.MinorUnits,
			&currency.DepositMinMinor,
			&currency.DepositMaxMinor,
		); err != nil {
			return nil, fmt.Errorf("currency: list enabled row: %w", err)
		}
		if !money.IsSafeMinor(currency.DepositMinMinor) || !money.IsSafeMinor(currency.DepositMaxMinor) {
			return nil, fmt.Errorf("currency: deposit limits for %s exceed the exact JSON integer range", currency.Code)
		}
		currencies = append(currencies, currency)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("currency: list enabled rows: %w", err)
	}
	return currencies, nil
}
