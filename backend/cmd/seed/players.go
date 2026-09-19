package main

import (
	"context"
	"database/sql"
	"fmt"
	"maps"
	"slices"

	"github.com/gaming-platform/backend/internal/auth"
	"github.com/gaming-platform/backend/internal/wallet"
)

const upsertPlayer = `
	INSERT INTO users (email, password_hash, display_name, role, status)
	VALUES ($1, $2, $3, 'player', $4)
	ON CONFLICT (email) DO UPDATE
	   SET password_hash = EXCLUDED.password_hash,
	       display_name  = EXCLUDED.display_name,
	       role          = 'player',
	       status        = EXCLUDED.status,
	       updated_at    = now()
	RETURNING id::text`

// One idempotency key per wallet: a second seed finds the movement it already
// made and leaves the balance alone, whatever the player has done since.
const openingBalanceKey = "seed:opening-balance"

const openingBalanceReason = "Opening balance from the development seed"

type player struct {
	email        string
	displayName  string
	status       string
	openingMinor map[string]int64
}

var adminOpeningMinor = map[string]int64{"PHP": 10_000_000, "USD": 100_000}

var players = []player{
	{email: "maria.santos@example.com", displayName: "Maria Santos", status: "active", openingMinor: map[string]int64{"PHP": 2_500_000}},
	{email: "jose.reyes@example.com", displayName: "Jose Reyes", status: "active", openingMinor: map[string]int64{"PHP": 1_200_000}},
	{email: "ana.cruz@example.com", displayName: "Ana Cruz", status: "active", openingMinor: map[string]int64{"PHP": 750_000}},
	{email: "carlo.bautista@example.com", displayName: "Carlo Bautista", status: "active", openingMinor: map[string]int64{"PHP": 5_000_000}},
	{email: "liza.villanueva@example.com", displayName: "Liza Villanueva", status: "active", openingMinor: map[string]int64{"PHP": 300_000}},
	{email: "ramon.delacruz@example.com", displayName: "Ramon Dela Cruz", status: "active", openingMinor: map[string]int64{"PHP": 1_850_000}},
	{email: "grace.mendoza@example.com", displayName: "Grace Mendoza", status: "active", openingMinor: map[string]int64{"PHP": 420_000}},
	{email: "paolo.garcia@example.com", displayName: "Paolo Garcia", status: "active", openingMinor: map[string]int64{"PHP": 10_000_000}},
	{email: "kristine.torres@example.com", displayName: "Kristine Torres", status: "active", openingMinor: map[string]int64{"PHP": 150_000}},
	{email: "miguel.fernandez@example.com", displayName: "Miguel Fernandez", status: "active", openingMinor: map[string]int64{"PHP": 3_600_000}},
	{email: "jenny.ramos@example.com", displayName: "Jenny Ramos", status: "active", openingMinor: map[string]int64{"PHP": 880_000}},
	{email: "daniel.aquino@example.com", displayName: "Daniel Aquino", status: "active", openingMinor: map[string]int64{"PHP": 2_000_000}},
	{email: "rica.castillo@example.com", displayName: "Rica Castillo", status: "active", openingMinor: map[string]int64{"PHP": 640_000}},
	{email: "marco.lim@example.com", displayName: "Marco Lim", status: "active", openingMinor: map[string]int64{"PHP": 1_500_000, "USD": 50_000}},
	{email: "bea.navarro@example.com", displayName: "Bea Navarro", status: "active", openingMinor: map[string]int64{"PHP": 975_000}},
	{email: "kevin.tan@example.com", displayName: "Kevin Tan", status: "active", openingMinor: map[string]int64{"PHP": 4_250_000, "USD": 120_000}},
	{email: "noel.pascual@example.com", displayName: "Noel Pascual", status: "suspended", openingMinor: map[string]int64{"PHP": 215_000}},
	{email: "tess.ocampo@example.com", displayName: "Tess Ocampo", status: "closed"},
}

func seedPlayers(ctx context.Context, tx *sql.Tx, adminEmail, adminID, password string) (int, error) {
	seeded := 0
	for _, p := range players {
		if p.email == adminEmail {
			continue
		}

		hash, err := auth.HashPassword(password)
		if err != nil {
			return seeded, fmt.Errorf("seed: %w", err)
		}

		var id string
		if err := tx.QueryRowContext(ctx, upsertPlayer, p.email, hash, p.displayName, p.status).Scan(&id); err != nil {
			return seeded, fmt.Errorf("seed: upsert player %s: %w", p.email, err)
		}
		if err := fundWallets(ctx, tx, adminID, id, p.openingMinor); err != nil {
			return seeded, fmt.Errorf("seed: player %s: %w", p.email, err)
		}
		seeded++
	}

	return seeded, nil
}

func fundWallets(ctx context.Context, tx *sql.Tx, actorID, userID string, openingMinor map[string]int64) error {
	if len(openingMinor) == 0 {
		return nil
	}
	if err := wallet.ProvisionTx(ctx, tx, userID); err != nil {
		return err
	}
	for _, currency := range slices.Sorted(maps.Keys(openingMinor)) {
		_, err := wallet.MoveTx(ctx, tx, wallet.Movement{
			UserID: userID, Currency: currency, Kind: "adjustment", AmountMinor: openingMinor[currency],
			IdempotencyKey: openingBalanceKey, ActorID: actorID, Reason: openingBalanceReason,
		})
		if err != nil {
			return fmt.Errorf("fund %s wallet: %w", currency, err)
		}
	}
	return nil
}
