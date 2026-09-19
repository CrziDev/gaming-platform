package main

import (
	"bytes"
	"slices"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine/plinko"
)

// Every checked-in profile's weights are exactly what the solver derives from
// its multipliers, so the literals and the tool cannot drift apart unnoticed.
func TestSolveReproducesEveryProfilesWeights(t *testing.T) {
	for _, option := range plinko.Options() {
		profile, err := plinko.ProfileByRef(option.Ref)
		if err != nil {
			t.Fatal(err)
		}
		for rows := plinko.MinRows; rows <= plinko.MaxRows; rows++ {
			for _, risk := range plinko.Risks {
				table, err := profile.Table(plinko.Params{Rows: rows, Risk: risk})
				if err != nil {
					t.Fatal(err)
				}
				weights, decay, err := solveWeights(table.MultipliersHundredths, profile.BasisPoints)
				if err != nil {
					t.Fatalf("%s %d rows %s: %v", profile.Ref, rows, risk, err)
				}
				if decay <= 0 || decay >= 1 {
					t.Fatalf("%s %d rows %s: decay %f is outside (0, 1)", profile.Ref, rows, risk, decay)
				}
				if !slices.Equal(weights, table.Weights) {
					t.Fatalf("%s %d rows %s: solver weights %v differ from profile %v", profile.Ref, rows, risk, weights, table.Weights)
				}
			}
		}
	}
}

func TestSolveRefusesATargetBelowTheFloor(t *testing.T) {
	supplied := plinko.SuppliedMultipliersHundredths[13][plinko.RiskLow]
	if _, _, err := solveWeights(supplied, 9600); err == nil {
		t.Fatal("13 rows low has a 1.1× floor and must not reach 96%")
	}
}

func TestWriteSolutionListsEveryBoardAsACompleteLiteral(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/9500")
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := writeSolution(&out, profile, 9500); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(out.String(), "Weights:"); got != 27 {
		t.Fatalf("want 27 weight rows, got %d", got)
	}
	if got := strings.Count(out.String(), "MultipliersHundredths:"); got != 27 {
		t.Fatalf("want 27 multiplier rows, got %d", got)
	}
}
