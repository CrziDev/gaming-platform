package plinko

import (
	"errors"
	"math"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

// docs/games/plinko-rtp.md §5: the supplied tables at decay 0.24.
var suppliedDocBasisPoints = map[int]map[Risk]int{
	8:  {RiskLow: 9040, RiskNormal: 8264, RiskHigh: 6332},
	9:  {RiskLow: 9647, RiskNormal: 9196, RiskHigh: 7761},
	10: {RiskLow: 9643, RiskNormal: 7204, RiskHigh: 5135},
	11: {RiskLow: 10402, RiskNormal: 7620, RiskHigh: 5714},
	12: {RiskLow: 10550, RiskNormal: 6587, RiskHigh: 4278},
	13: {RiskLow: 11345, RiskNormal: 7203, RiskHigh: 4177},
	14: {RiskLow: 11528, RiskNormal: 6447, RiskHigh: 2659},
	15: {RiskLow: 11403, RiskNormal: 6308, RiskHigh: 2800},
	16: {RiskLow: 11643, RiskNormal: 5579, RiskHigh: 3107},
}

func TestTheoreticalBasisPointsMatchesTheDocumentedSuppliedReturns(t *testing.T) {
	for rows, risks := range suppliedDocBasisPoints {
		for risk, want := range risks {
			table, err := SuppliedTable(Params{Rows: rows, Risk: risk})
			if err != nil {
				t.Fatal(err)
			}
			got, err := TheoreticalBasisPoints(table)
			if err != nil {
				t.Fatalf("%d rows %s: %v", rows, risk, err)
			}
			if got < want-1 || got > want+1 {
				t.Fatalf("%d rows %s: want %d ± 1 bp, got %d", rows, risk, want, got)
			}
		}
	}
}

func TestTheoreticalBasisPointsIsExactForEvenOdds(t *testing.T) {
	got, err := TheoreticalBasisPoints(Table{Weights: []int64{1, 1}, MultipliersHundredths: []int{50, 150}})
	if err != nil {
		t.Fatal(err)
	}
	if got != 10000 {
		t.Fatalf("want 10000, got %d", got)
	}
}

func TestNormalizedChancesAreDisplaySafeAndTotalOneHundredPercent(t *testing.T) {
	for _, profile := range profiles {
		for rows := MinRows; rows <= MaxRows; rows++ {
			for _, risk := range Risks {
				table, err := profile.Table(Params{Rows: rows, Risk: risk})
				if err != nil {
					t.Fatal(err)
				}
				chances, err := normalizedChances(table.Weights)
				if err != nil {
					t.Fatal(err)
				}
				total := 0
				for _, chance := range chances {
					total += chance
				}
				if total != 100000 {
					t.Fatalf("%s %d rows %s: want 100000 thousandths of a percent, got %d", profile.Ref, rows, risk, total)
				}
			}
		}
	}

	profile, _ := ProfileByBasisPoints(9500)
	table, _ := profile.Table(Params{Rows: 8, Risk: RiskNormal})
	chances, _ := normalizedChances(table.Weights)
	want := []int{485, 1567, 5068, 16387, 52986, 16387, 5068, 1567, 485}
	for i, chance := range chances {
		if chance != want[i] {
			t.Fatalf("slot %d: want %d, got %d", i, want[i], chance)
		}
	}
}

func TestTheoreticalBasisPointsRefusesOverflowAndBadTables(t *testing.T) {
	cases := map[string]Table{
		"product overflow": {Weights: []int64{math.MaxInt64 / 2}, MultipliersHundredths: []int{3}},
		"sum overflow":     {Weights: []int64{math.MaxInt64 / 3, math.MaxInt64 / 3}, MultipliersHundredths: []int{2, 2}},
		"scale overflow":   {Weights: []int64{math.MaxInt64 / 150}, MultipliersHundredths: []int{120}},
		"length mismatch":  {Weights: []int64{1, 1}, MultipliersHundredths: []int{100}},
		"zero multiplier":  {Weights: []int64{1, 1}, MultipliersHundredths: []int{100, 0}},
	}
	for name, table := range cases {
		if _, err := TheoreticalBasisPoints(table); !errors.Is(err, engine.ErrInvalidConfig) {
			t.Fatalf("%s: want %v, got %v", name, engine.ErrInvalidConfig, err)
		}
	}
	if _, err := TheoreticalBasisPoints(Table{Weights: []int64{0}, MultipliersHundredths: []int{100}}); !errors.Is(err, engine.ErrInvalidWeights) {
		t.Fatalf("zero weight: want %v, got %v", engine.ErrInvalidWeights, err)
	}
}
