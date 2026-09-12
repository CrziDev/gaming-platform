package main

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/gaming-platform/backend/internal/auth"
)

const upsertPlayer = `
	INSERT INTO users (email, password_hash, display_name, role, status)
	VALUES ($1, $2, $3, 'player', $4)
	ON CONFLICT (email) DO UPDATE
	   SET password_hash = EXCLUDED.password_hash,
	       display_name  = EXCLUDED.display_name,
	       role          = 'player',
	       status        = EXCLUDED.status,
	       updated_at    = now()`

type player struct {
	email       string
	displayName string
	status      string
}

var players = []player{
	{email: "maria.santos@example.com", displayName: "Maria Santos", status: "active"},
	{email: "jose.reyes@example.com", displayName: "Jose Reyes", status: "active"},
	{email: "ana.cruz@example.com", displayName: "Ana Cruz", status: "active"},
	{email: "carlo.bautista@example.com", displayName: "Carlo Bautista", status: "active"},
	{email: "liza.villanueva@example.com", displayName: "Liza Villanueva", status: "active"},
	{email: "ramon.delacruz@example.com", displayName: "Ramon Dela Cruz", status: "active"},
	{email: "grace.mendoza@example.com", displayName: "Grace Mendoza", status: "active"},
	{email: "paolo.garcia@example.com", displayName: "Paolo Garcia", status: "active"},
	{email: "kristine.torres@example.com", displayName: "Kristine Torres", status: "active"},
	{email: "miguel.fernandez@example.com", displayName: "Miguel Fernandez", status: "active"},
	{email: "jenny.ramos@example.com", displayName: "Jenny Ramos", status: "active"},
	{email: "daniel.aquino@example.com", displayName: "Daniel Aquino", status: "active"},
	{email: "rica.castillo@example.com", displayName: "Rica Castillo", status: "active"},
	{email: "marco.lim@example.com", displayName: "Marco Lim", status: "active"},
	{email: "bea.navarro@example.com", displayName: "Bea Navarro", status: "active"},
	{email: "kevin.tan@example.com", displayName: "Kevin Tan", status: "active"},
	{email: "noel.pascual@example.com", displayName: "Noel Pascual", status: "suspended"},
	{email: "tess.ocampo@example.com", displayName: "Tess Ocampo", status: "closed"},
}

func seedPlayers(ctx context.Context, tx *sql.Tx, adminEmail, password string) (int, error) {
	seeded := 0
	for _, p := range players {
		if p.email == adminEmail {
			continue
		}

		hash, err := auth.HashPassword(password)
		if err != nil {
			return seeded, fmt.Errorf("seed: %w", err)
		}

		if _, err := tx.ExecContext(ctx, upsertPlayer, p.email, hash, p.displayName, p.status); err != nil {
			return seeded, fmt.Errorf("seed: upsert player %s: %w", p.email, err)
		}
		seeded++
	}

	return seeded, nil
}
