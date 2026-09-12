package main

import (
	"context"
	"database/sql"
	"fmt"
)

const upsertCategory = `
	INSERT INTO game_categories (slug, name, sort_order)
	VALUES ($1, $2, $3)
	ON CONFLICT (slug) DO UPDATE
	   SET name       = EXCLUDED.name,
	       sort_order = EXCLUDED.sort_order`

const upsertGame = `
	INSERT INTO games (
		slug, name, description, category_slug, provider, status, integration,
		currency, min_wager_minor, max_wager_minor, wager_step_minor)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	ON CONFLICT (slug) DO UPDATE
	   SET name             = EXCLUDED.name,
	       description      = EXCLUDED.description,
	       category_slug    = EXCLUDED.category_slug,
	       provider         = EXCLUDED.provider,
	       status           = EXCLUDED.status,
	       integration      = EXCLUDED.integration,
	       currency         = EXCLUDED.currency,
	       min_wager_minor  = EXCLUDED.min_wager_minor,
	       max_wager_minor  = EXCLUDED.max_wager_minor,
	       wager_step_minor = EXCLUDED.wager_step_minor,
	       thumbnail_path   = NULL,
	       updated_at       = now()`

type category struct {
	slug      string
	name      string
	sortOrder int
}

type wagerRange struct {
	min  int64
	max  int64
	step int64
}

type game struct {
	slug        string
	name        string
	description string
	category    string
	provider    string
	status      string
	integration string
	currency    string
	wagers      wagerRange
}

const (
	inHouse    = "In-house"
	northlight = "Northlight Studio"
	pixelForge = "Pixel Forge"
	lumen      = "Lumen Games"
	harbour    = "Harbour Live"
)

var (
	originalWagers = wagerRange{min: 100, max: 500_000, step: 100}
	crashWagers    = wagerRange{min: 100, max: 1_000_000, step: 100}
	slotWagers     = wagerRange{min: 100, max: 200_000, step: 100}
	liveWagers     = wagerRange{min: 500, max: 5_000_000, step: 500}
	tableWagers    = wagerRange{min: 500, max: 2_500_000, step: 500}
)

var categories = []category{
	{slug: "originals", name: "Originals", sortOrder: 10},
	{slug: "crash", name: "Crash", sortOrder: 20},
	{slug: "slots", name: "Slots", sortOrder: 30},
	{slug: "live", name: "Live dealers", sortOrder: 40},
	{slug: "table", name: "Table games", sortOrder: 50},
}

var games = []game{
	{slug: "aurora-dice", name: "Aurora Dice", description: "Roll over or under a target you choose and set your own odds.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "vault-break", name: "Vault Break", description: "Crack the combination one dial at a time and stop before the alarm.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "mine-sweep", name: "Mine Sweep", description: "Reveal safe tiles on a 5×5 grid and cash out before you hit a mine.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "plinko-drop", name: "Plinko Drop", description: "Drop a ball through the pegs and land on a multiplier.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "coin-flip", name: "Coin Flip", description: "Heads or tails, double or nothing, streak as far as you dare.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "hi-lo-ladder", name: "Hi-Lo Ladder", description: "Call the next card higher or lower and climb the payout ladder.", category: "originals", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: originalWagers},
	{slug: "keno-nights", name: "Keno Nights", description: "Pick up to ten numbers and watch twenty draw.", category: "originals", provider: inHouse, status: "maintenance", integration: "supported", currency: "PHP", wagers: originalWagers},

	{slug: "skyline-crash", name: "Skyline Crash", description: "The multiplier climbs until it crashes. Cash out first.", category: "crash", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: crashWagers},
	{slug: "rocket-run", name: "Rocket Run", description: "Ride the rocket and eject before it blows.", category: "crash", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: crashWagers},
	{slug: "comet-tail", name: "Comet Tail", description: "Two cash-out points on one comet, one bet each.", category: "crash", provider: inHouse, status: "active", integration: "supported", currency: "PHP", wagers: crashWagers},
	{slug: "jet-stream", name: "Jet Stream", description: "A faster crash curve with auto cash-out presets.", category: "crash", provider: inHouse, status: "draft", integration: "unreviewed", currency: "PHP", wagers: crashWagers},

	{slug: "golden-harvest", name: "Golden Harvest", description: "Five reels of stacked wilds at harvest time.", category: "slots", provider: northlight, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "neon-fruits", name: "Neon Fruits", description: "A three-reel classic under neon lights.", category: "slots", provider: pixelForge, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "pharaohs-vault", name: "Pharaoh's Vault", description: "Expanding symbols and a ten-spin bonus round.", category: "slots", provider: northlight, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "frontier-gold", name: "Frontier Gold", description: "Sticky wilds and a gold-rush respin.", category: "slots", provider: lumen, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "dragon-hoard", name: "Dragon Hoard", description: "Hold-and-win jackpots guarded by a dragon.", category: "slots", provider: pixelForge, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "sakura-spins", name: "Sakura Spins", description: "Cascading wins under the cherry blossoms.", category: "slots", provider: lumen, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "deep-sea-riches", name: "Deep Sea Riches", description: "A dive for pearls with a rising multiplier.", category: "slots", provider: northlight, status: "active", integration: "supported", currency: "PHP", wagers: slotWagers},
	{slug: "lucky-lanterns", name: "Lucky Lanterns", description: "Collect lanterns for a pick-a-prize bonus.", category: "slots", provider: pixelForge, status: "active", integration: "supported", currency: "USD", wagers: slotWagers},
	{slug: "jungle-totem", name: "Jungle Totem", description: "Totem stacks and free spins.", category: "slots", provider: lumen, status: "retired", integration: "unsupported", currency: "PHP", wagers: slotWagers},

	{slug: "manila-roulette", name: "Manila Roulette", description: "A live wheel streamed from the Manila studio.", category: "live", provider: harbour, status: "active", integration: "under_review", currency: "PHP", wagers: liveWagers},
	{slug: "blackjack-lounge", name: "Blackjack Lounge", description: "Seven seats, a live dealer, and bet-behind.", category: "live", provider: harbour, status: "active", integration: "under_review", currency: "PHP", wagers: liveWagers},
	{slug: "baccarat-royale", name: "Baccarat Royale", description: "Live baccarat with squeeze and side bets.", category: "live", provider: harbour, status: "active", integration: "under_review", currency: "PHP", wagers: liveWagers},
	{slug: "lucky-wheel", name: "Lucky Wheel", description: "A live money wheel with multiplier segments.", category: "live", provider: harbour, status: "draft", integration: "unreviewed", currency: "PHP", wagers: liveWagers},

	{slug: "european-roulette", name: "European Roulette", description: "Single-zero roulette with racetrack bets.", category: "table", provider: pixelForge, status: "active", integration: "supported", currency: "PHP", wagers: tableWagers},
	{slug: "classic-blackjack", name: "Classic Blackjack", description: "Standard blackjack, dealer stands on soft 17.", category: "table", provider: pixelForge, status: "active", integration: "supported", currency: "PHP", wagers: tableWagers},
	{slug: "three-card-rush", name: "Three Card Rush", description: "Three-card poker against the dealer with a pair-plus bet.", category: "table", provider: pixelForge, status: "active", integration: "supported", currency: "USD", wagers: tableWagers},
}

func seedCatalogue(ctx context.Context, tx *sql.Tx) error {
	for _, c := range categories {
		if _, err := tx.ExecContext(ctx, upsertCategory, c.slug, c.name, c.sortOrder); err != nil {
			return fmt.Errorf("seed: upsert category %s: %w", c.slug, err)
		}
	}

	for _, g := range games {
		_, err := tx.ExecContext(ctx, upsertGame,
			g.slug, g.name, g.description, g.category, g.provider, g.status, g.integration,
			g.currency, g.wagers.min, g.wagers.max, g.wagers.step)
		if err != nil {
			return fmt.Errorf("seed: upsert game %s: %w", g.slug, err)
		}
	}

	return nil
}
