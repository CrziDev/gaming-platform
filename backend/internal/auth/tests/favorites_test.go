package auth_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

func TestFavoritesHTTPFlowIsIdempotentAndPrivate(t *testing.T) {
	db := requireDB(t)
	createPlinko(t, db)
	base, client := newServer(t, db)
	if status, body := register(t, client, base); status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d (%s)", status, body)
	}

	favorites := func(t *testing.T) []string {
		t.Helper()
		status, body := send(t, client, http.MethodGet, base+"/api/favorites", nil)
		if status != http.StatusOK {
			t.Fatalf("list favorites: want 200, got %d (%s)", status, body)
		}
		var page struct {
			Rows []struct {
				Slug string `json:"slug"`
			} `json:"rows"`
			Total int `json:"total"`
		}
		if err := json.Unmarshal(body, &page); err != nil {
			t.Fatalf("decode favorites: %v (%s)", err, body)
		}
		if page.Total != len(page.Rows) {
			t.Fatalf("favorites total %d disagrees with %d rows", page.Total, len(page.Rows))
		}
		slugs := make([]string, 0, len(page.Rows))
		for _, row := range page.Rows {
			slugs = append(slugs, row.Slug)
		}
		return slugs
	}

	if got := favorites(t); len(got) != 0 {
		t.Fatalf("a new account has favorites: %v", got)
	}
	if status, body := send(t, client, http.MethodPut, base+"/api/games/no-such-game/favorite", nil); status != http.StatusNotFound {
		t.Fatalf("favorite an unknown game: want 404, got %d (%s)", status, body)
	}
	for range 2 {
		if status, body := send(t, client, http.MethodPut, base+"/api/games/plinko/favorite", nil); status != http.StatusNoContent {
			t.Fatalf("favorite plinko: want 204, got %d (%s)", status, body)
		}
	}
	if got := favorites(t); len(got) != 1 || got[0] != "plinko" {
		t.Fatalf("after favouriting twice: %v, want [plinko]", got)
	}

	other := clientWithCookies(t)
	if status, body := send(t, other, http.MethodPost, base+"/api/register", map[string]string{
		"email": "other-favorites@example.com", "password": "correct horse battery", "display_name": "Other",
	}); status != http.StatusCreated {
		t.Fatalf("register other: want 201, got %d (%s)", status, body)
	}
	if status, body := send(t, other, http.MethodGet, base+"/api/favorites", nil); status != http.StatusOK || !bytes.Contains(body, []byte(`"total":0`)) {
		t.Fatalf("another player's favorites must be empty: %d (%s)", status, body)
	}

	for range 2 {
		if status, body := send(t, client, http.MethodDelete, base+"/api/games/plinko/favorite", nil); status != http.StatusNoContent {
			t.Fatalf("unfavorite plinko: want 204, got %d (%s)", status, body)
		}
	}
	if got := favorites(t); len(got) != 0 {
		t.Fatalf("after removing: %v, want none", got)
	}

	if _, err := db.Exec(`UPDATE games SET status = 'retired' WHERE slug = 'plinko'`); err != nil {
		t.Fatalf("retire plinko: %v", err)
	}
	if status, body := send(t, client, http.MethodPut, base+"/api/games/plinko/favorite", nil); status != http.StatusNotFound {
		t.Fatalf("favorite a retired game: want 404, got %d (%s)", status, body)
	}
}
