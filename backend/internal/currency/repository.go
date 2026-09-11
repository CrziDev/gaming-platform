package currency

import (
	"context"
	"database/sql"
	"fmt"
)

const listEnabledSQL = `
	SELECT code, name, symbol, minor_units
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
		); err != nil {
			return nil, fmt.Errorf("currency: list enabled row: %w", err)
		}
		currencies = append(currencies, currency)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("currency: list enabled rows: %w", err)
	}
	return currencies, nil
}
