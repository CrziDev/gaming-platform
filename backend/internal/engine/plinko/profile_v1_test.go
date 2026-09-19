package plinko

import (
	"errors"
	"slices"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

const v1Ref = "plinko/v1/9600"

func TestProfileByRef(t *testing.T) {
	profile, err := ProfileByRef(v1Ref)
	if err != nil {
		t.Fatal(err)
	}
	if profile.Ref != v1Ref {
		t.Fatalf("want ref %q, got %q", v1Ref, profile.Ref)
	}
	if _, err := ProfileByRef("plinko/v0/none"); !errors.Is(err, engine.ErrUnknownConfig) {
		t.Fatalf("want %v, got %v", engine.ErrUnknownConfig, err)
	}
	if refs := ProfileRefs(); !slices.Contains(refs, v1Ref) {
		t.Fatalf("refs %v lack %q", refs, v1Ref)
	}
}

func TestV1EveryBoardReturnsExactlyTheTarget(t *testing.T) {
	for rows := MinRows; rows <= MaxRows; rows++ {
		for _, risk := range Risks {
			table, err := v1.Table(Params{Rows: rows, Risk: risk})
			if err != nil {
				t.Fatal(err)
			}
			got, err := TheoreticalBasisPoints(table)
			if err != nil {
				t.Fatalf("%d rows %s: %v", rows, risk, err)
			}
			if got != 9600 {
				t.Fatalf("%d rows %s: want 9600 bp, got %d", rows, risk, got)
			}
		}
	}
}

// The agreed adjustment: from 11 rows, a low-risk board's centre pays 0.9× and
// its first ring at most 1.0×; nothing else departs from the supplied paytable.
func TestV1MultipliersDepartFromSuppliedOnlyAtBlockedCentres(t *testing.T) {
	for rows := MinRows; rows <= MaxRows; rows++ {
		for _, risk := range Risks {
			table, err := v1.Table(Params{Rows: rows, Risk: risk})
			if err != nil {
				t.Fatal(err)
			}
			supplied := SuppliedMultipliersHundredths[rows][risk]
			if len(table.MultipliersHundredths) != len(supplied) {
				t.Fatalf("%d rows %s: board shape changed", rows, risk)
			}
			slots := len(supplied)
			for i, got := range table.MultipliersHundredths {
				want := supplied[i]
				distance := abs(2*i - (slots - 1)) // twice the distance from the centre, so an integer
				if risk == RiskLow && rows >= 11 {
					switch {
					case distance <= 1:
						want = 90
					case distance <= 3:
						want = min(want, 100)
					}
				}
				if got != want {
					t.Fatalf("%d rows %s slot %d: want %d, got %d", rows, risk, i, want, got)
				}
			}
		}
	}
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
