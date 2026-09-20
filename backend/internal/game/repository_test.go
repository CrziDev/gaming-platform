package game

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/testdb"
)

var (
	testDBOnce sync.Once
	testDB     *sql.DB
	testDBErr  error
)

func gameTestDB(t *testing.T) *sql.DB {
	t.Helper()
	testDBOnce.Do(func() {
		testDB, testDBErr = testdb.Open()
	})
	if testDBErr != nil {
		if os.Getenv("REQUIRE_TEST_DATABASE") != "" {
			t.Fatalf("test database required: %v", testDBErr)
		}
		t.Skipf("skipping game database test: %v", testDBErr)
	}
	return testDB
}

var fixtureSequence atomic.Uint64

type favoriteFixture struct {
	UserID   string
	WalletID string
	Category string
	GameIDs  map[string]string
}

func createFavoriteFixture(t *testing.T, db *sql.DB, slugs map[string]string) favoriteFixture {
	t.Helper()
	suffix := fmt.Sprintf("%d-%d", os.Getpid(), fixtureSequence.Add(1))
	fixture := favoriteFixture{Category: "fav-cat-" + suffix, GameIDs: map[string]string{}}
	if err := db.QueryRow(`INSERT INTO users (email, password_hash, display_name) VALUES ($1, 'test-hash', 'Favorite Test') RETURNING id::text`, "favorite-"+suffix+"@example.com").Scan(&fixture.UserID); err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := db.QueryRow(`INSERT INTO wallets (user_id, currency) VALUES (($1::text)::uuid, 'PHP') RETURNING id::text`, fixture.UserID).Scan(&fixture.WalletID); err != nil {
		t.Fatalf("create wallet: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO game_categories (slug, name, sort_order) VALUES ($1, $2, 999)`, fixture.Category, "Favorite Test "+suffix); err != nil {
		t.Fatalf("create category: %v", err)
	}
	for slug, status := range slugs {
		var id string
		if err := db.QueryRow(`
			INSERT INTO games (slug, name, category_slug, provider, status, currency, min_wager_minor, max_wager_minor, wager_step_minor)
			VALUES ($1, $2, $3, 'Test', $4, 'PHP', 100, 1000, 100)
			RETURNING id::text`, slug+"-"+suffix, "Game "+slug, fixture.Category, status).Scan(&id); err != nil {
			t.Fatalf("create game %s: %v", slug, err)
		}
		fixture.GameIDs[slug] = id
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM game_favorites WHERE user_id = ($1::text)::uuid`, fixture.UserID)
		_, _ = db.Exec(`DELETE FROM game_rounds WHERE user_id = ($1::text)::uuid`, fixture.UserID)
		_, _ = db.Exec(`DELETE FROM games WHERE category_slug = $1`, fixture.Category)
		_, _ = db.Exec(`DELETE FROM game_categories WHERE slug = $1`, fixture.Category)
		_, _ = db.Exec(`DELETE FROM wallets WHERE id = ($1::text)::uuid`, fixture.WalletID)
		_, _ = db.Exec(`DELETE FROM users WHERE id = ($1::text)::uuid`, fixture.UserID)
	})
	return fixture
}

func TestRecentlyPlayedIsPrivateDistinctAndNewestFirst(t *testing.T) {
	db := gameTestDB(t)
	fixture := createFavoriteFixture(t, db, map[string]string{"first": "active", "second": "active", "retired": "retired"})
	now := time.Now().UTC().Truncate(time.Second)

	insertSettledRound(t, db, fixture, "first", now.Add(-2*time.Hour), "first-old")
	insertSettledRound(t, db, fixture, "first", now.Add(-time.Hour), "first-new")
	insertSettledRound(t, db, fixture, "second", now.Add(-30*time.Minute), "second")
	insertSettledRound(t, db, fixture, "retired", now.Add(-time.Minute), "retired")

	games, total, err := ListRecentlyPlayed(context.Background(), db, fixture.UserID, 1, 20)
	if err != nil {
		t.Fatalf("list recently played: %v", err)
	}
	if total != 2 || len(games) != 2 {
		t.Fatalf("listed %d of %d recent games, want two active distinct games", len(games), total)
	}
	if games[0].ID != fixture.GameIDs["second"] || games[1].ID != fixture.GameIDs["first"] {
		t.Fatalf("recent games are not ordered by latest round: %s then %s", games[0].Slug, games[1].Slug)
	}

	other := createFavoriteFixture(t, db, nil)
	games, total, err = ListRecentlyPlayed(context.Background(), db, other.UserID, 1, 20)
	if err != nil || total != 0 || len(games) != 0 {
		t.Fatalf("another player's recent list must be empty: total=%d games=%+v err=%v", total, games, err)
	}
}

func TestHotCatalogueRanksSettledRoundsFromTheLastSevenDays(t *testing.T) {
	db := gameTestDB(t)
	fixture := createFavoriteFixture(t, db, map[string]string{"leader": "active", "runner-up": "active", "retired": "retired"})
	now := time.Now().UTC().Truncate(time.Second)

	insertSettledRound(t, db, fixture, "leader", now.Add(-6*time.Hour), "leader-one")
	insertSettledRound(t, db, fixture, "leader", now.Add(-time.Hour), "leader-two")
	insertSettledRound(t, db, fixture, "runner-up", now.Add(-30*time.Minute), "runner-up-recent")
	insertSettledRound(t, db, fixture, "runner-up", now.Add(-8*24*time.Hour), "runner-up-old")
	insertSettledRound(t, db, fixture, "retired", now.Add(-time.Minute), "retired")

	filter := CatalogueFilter{Page: 1, Size: 20, Category: fixture.Category}
	games, total, err := ListHotCatalogue(context.Background(), db, filter, HotSince(now))
	if err != nil {
		t.Fatalf("list hot catalogue: %v", err)
	}
	if total != 2 || len(games) != 2 {
		t.Fatalf("listed %d of %d hot games, want two active games with recent settled rounds", len(games), total)
	}
	if games[0].ID != fixture.GameIDs["leader"] || games[1].ID != fixture.GameIDs["runner-up"] {
		t.Fatalf("hot games are not ranked by recent settled rounds: %s then %s", games[0].Slug, games[1].Slug)
	}
	if !games[0].Hot || games[0].Flags(now)[0] != FlagHot {
		t.Fatalf("hot result does not carry the hot flag: %+v", games[0])
	}
}

func insertSettledRound(t *testing.T, db *sql.DB, fixture favoriteFixture, game string, startedAt time.Time, keySuffix string) {
	t.Helper()
	if _, err := db.Exec(`
		INSERT INTO game_rounds
			(round_key, user_id, game_id, wallet_id, currency, rtp_basis_points, status, stake_minor, win_minor, started_at, settled_at)
		VALUES
			($1, ($2::text)::uuid, ($3::text)::uuid, ($4::text)::uuid, 'PHP', 9500, 'settled', 100, 0, $5, $5)`,
		fmt.Sprintf("merchandising-%d-%v", fixtureSequence.Add(1), keySuffix), fixture.UserID, fixture.GameIDs[game], fixture.WalletID, startedAt); err != nil {
		t.Fatalf("create %s round: %v", game, err)
	}
}

func TestFavoritesAreIdempotentNewestFirstAndActiveOnly(t *testing.T) {
	db := gameTestDB(t)
	fixture := createFavoriteFixture(t, db, map[string]string{"first": "active", "second": "active", "retired": "retired"})
	ctx := context.Background()

	for _, slug := range []string{"first", "first", "second", "retired"} {
		if err := AddFavorite(ctx, db, fixture.UserID, fixture.GameIDs[slug]); err != nil {
			t.Fatalf("add favorite %s: %v", slug, err)
		}
	}
	var stored int
	if err := db.QueryRow(`SELECT count(*) FROM game_favorites WHERE user_id = ($1::text)::uuid`, fixture.UserID).Scan(&stored); err != nil || stored != 3 {
		t.Fatalf("stored favorites = %d, err = %v, want 3 (a repeat adds nothing)", stored, err)
	}

	games, total, err := ListFavorites(ctx, db, fixture.UserID, 1, 20)
	if err != nil {
		t.Fatalf("list favorites: %v", err)
	}
	if total != 2 || len(games) != 2 {
		t.Fatalf("listed %d of %d favorites, want the two active games: %+v", len(games), total, games)
	}
	if games[0].ID != fixture.GameIDs["second"] || games[1].ID != fixture.GameIDs["first"] {
		t.Fatalf("favorites are not newest first: %s then %s", games[0].Slug, games[1].Slug)
	}

	for range 2 {
		if err := RemoveFavorite(ctx, db, fixture.UserID, fixture.GameIDs["first"]); err != nil {
			t.Fatalf("remove favorite: %v", err)
		}
	}
	games, total, err = ListFavorites(ctx, db, fixture.UserID, 1, 20)
	if err != nil || total != 1 || len(games) != 1 || games[0].ID != fixture.GameIDs["second"] {
		t.Fatalf("after removal: total=%d games=%+v err=%v", total, games, err)
	}

	other := createFavoriteFixture(t, db, nil)
	games, total, err = ListFavorites(ctx, db, other.UserID, 1, 20)
	if err != nil || total != 0 || len(games) != 0 {
		t.Fatalf("another player's list must be their own: total=%d games=%+v err=%v", total, games, err)
	}
}
