package game

import (
	"context"
	"errors"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

type stubOptions map[string][]engine.Option

func (s stubOptions) Options(slug string) ([]engine.Option, bool) {
	options, ok := s[slug]
	return options, ok
}

func TestSetRTPAcceptsOnlyAnOfferedOptionAndAuditsEachChange(t *testing.T) {
	db := gameTestDB(t)
	fixture := createFavoriteFixture(t, db, map[string]string{"played": "active", "unplayed": "draft"})
	played := fixture.GameIDs["played"]
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM audit_logs WHERE entity_type = 'game' AND entity_id = $1`, played)
	})
	var playedSlug string
	if err := db.QueryRow(`SELECT slug FROM games WHERE id = ($1::text)::uuid`, played).Scan(&playedSlug); err != nil {
		t.Fatal(err)
	}
	options := stubOptions{playedSlug: {{Ref: "test/9000", BasisPoints: 9000}, {Ref: "test/11000", BasisPoints: 11000}}}
	ctx := context.Background()

	if _, err := SetRTP(ctx, db, options, fixture.UserID, played, 9600); !errors.Is(err, ErrRTPNotOffered) {
		t.Fatalf("unoffered value: want %v, got %v", ErrRTPNotOffered, err)
	}
	if _, err := SetRTP(ctx, db, options, fixture.UserID, fixture.GameIDs["unplayed"], 9000); !errors.Is(err, ErrRTPNotOffered) {
		t.Fatalf("game without an engine: want %v, got %v", ErrRTPNotOffered, err)
	}
	if _, err := SetRTP(ctx, db, options, fixture.UserID, "00000000-0000-0000-0000-000000000000", 9000); !errors.Is(err, ErrNoGame) {
		t.Fatalf("unknown game: want %v, got %v", ErrNoGame, err)
	}

	updated, err := SetRTP(ctx, db, options, fixture.UserID, played, 11000)
	if err != nil {
		t.Fatal(err)
	}
	if updated.RTPBasisPoints == nil || *updated.RTPBasisPoints != 11000 {
		t.Fatalf("want 11000 basis points, got %v", updated.RTPBasisPoints)
	}
	if again, err := SetRTP(ctx, db, options, fixture.UserID, played, 11000); err != nil || *again.RTPBasisPoints != 11000 {
		t.Fatalf("repeat: %v %v", again.RTPBasisPoints, err)
	}
	if _, err := SetRTP(ctx, db, options, fixture.UserID, played, 9000); err != nil {
		t.Fatal(err)
	}

	rows, err := db.Query(`SELECT action, detail, before_data->>'rtp_basis_points', after_data->>'rtp_basis_points' FROM audit_logs WHERE entity_type = 'game' AND entity_id = $1 ORDER BY created_at, id`, played)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	type entry struct{ action, detail, before, after string }
	var entries []entry
	for rows.Next() {
		var e entry
		var before *string
		if err := rows.Scan(&e.action, &e.detail, &before, &e.after); err != nil {
			t.Fatal(err)
		}
		if before != nil {
			e.before = *before
		}
		entries = append(entries, e)
	}
	want := []entry{
		{"game.rtp_change", "Changed Game played (" + playedSlug + ") RTP from — to 110.00%", "", "11000"},
		{"game.rtp_change", "Changed Game played (" + playedSlug + ") RTP from 110.00% to 90.00%", "11000", "9000"},
	}
	if len(entries) != len(want) {
		t.Fatalf("want %d audit rows, got %+v", len(want), entries)
	}
	for i := range want {
		if entries[i] != want[i] {
			t.Fatalf("audit row %d: want %+v, got %+v", i, want[i], entries[i])
		}
	}
}
