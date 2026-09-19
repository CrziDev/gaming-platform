package main

import (
	"bytes"
	"slices"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/engine/plinko"
)

// The checked-in v1 weights are exactly what the solver derives from the v1
// multipliers, so the literal and the tool cannot drift apart unnoticed.
func TestSolveReproducesV1Weights(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/v1/9600")
	if err != nil {
		t.Fatal(err)
	}
	for rows := plinko.MinRows; rows <= plinko.MaxRows; rows++ {
		for _, risk := range plinko.Risks {
			table, err := profile.Table(plinko.Params{Rows: rows, Risk: risk})
			if err != nil {
				t.Fatal(err)
			}
			weights, decay, err := solveWeights(table.MultipliersHundredths, 9600)
			if err != nil {
				t.Fatalf("%d rows %s: %v", rows, risk, err)
			}
			if decay <= 0 || decay >= 1 {
				t.Fatalf("%d rows %s: decay %f is outside (0, 1)", rows, risk, decay)
			}
			if !slices.Equal(weights, table.Weights) {
				t.Fatalf("%d rows %s: solver weights %v differ from profile %v", rows, risk, weights, table.Weights)
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

func TestWriteSolutionListsEveryBoard(t *testing.T) {
	profile, err := plinko.ProfileByRef("plinko/v1/9600")
	if err != nil {
		t.Fatal(err)
	}
	var out bytes.Buffer
	if err := writeSolution(&out, profile, 9600); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(out.String(), "Weights: []int64{"); got != 27 {
		t.Fatalf("want 27 literal rows, got %d", got)
	}
}
