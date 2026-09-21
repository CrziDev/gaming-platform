package plinko

import (
	"errors"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
)

func TestOptionsAscendAndResolveBothWays(t *testing.T) {
	options := Options()
	if len(options) != 4 {
		t.Fatalf("want four options, got %v", options)
	}
	for i, option := range options {
		if i > 0 && option.BasisPoints <= options[i-1].BasisPoints {
			t.Fatalf("options are not ascending: %v", options)
		}
		byRef, err := ProfileByRef(option.Ref)
		if err != nil {
			t.Fatal(err)
		}
		byBasisPoints, ok := ProfileByBasisPoints(option.BasisPoints)
		if !ok || byRef.Ref != option.Ref || byBasisPoints.Ref != option.Ref || byRef.BasisPoints != option.BasisPoints {
			t.Fatalf("option %v resolves to %q and %q", option, byRef.Ref, byBasisPoints.Ref)
		}
	}
	if _, err := ProfileByRef("plinko/v1/9600"); !errors.Is(err, engine.ErrUnknownConfig) {
		t.Fatalf("want %v, got %v", engine.ErrUnknownConfig, err)
	}
	if _, ok := ProfileByBasisPoints(9600); ok {
		t.Fatal("9600 is not an option")
	}
}

// The exact model is the proof: a weighted draw over these integer weights
// returns Σw·m/Σw, so a profile whose boards all equal its basis points here
// pays that return in the long run, before any simulation is counted.
func TestEveryBoardOfEveryProfileReturnsExactlyItsBasisPoints(t *testing.T) {
	for _, profile := range profiles {
		for rows := MinRows; rows <= MaxRows; rows++ {
			for _, risk := range Risks {
				table, err := profile.Table(Params{Rows: rows, Risk: risk})
				if err != nil {
					t.Fatal(err)
				}
				got, err := TheoreticalBasisPoints(table)
				if err != nil {
					t.Fatalf("%s %d rows %s: %v", profile.Ref, rows, risk, err)
				}
				if got != profile.BasisPoints {
					t.Fatalf("%s %d rows %s: want %d bp, got %d", profile.Ref, rows, risk, profile.BasisPoints, got)
				}
			}
		}
	}
}

// A departure from the supplied paytable is only ever a low-risk board whose
// floor blocks the target: its centre moves, and its first ring where the
// centre alone would leave the distribution too peaked.
type departure struct {
	rows   []int
	centre int
	ring   int
}

var departures = map[int][]departure{
	9000:  {{rows: []int{9, 10}, centre: 80}, {rows: []int{11, 12, 13, 14, 15, 16}, centre: 80, ring: 90}},
	9500:  {{rows: []int{11, 12, 13, 14, 15, 16}, centre: 90, ring: 100}},
	10500: {{rows: []int{13, 15}, centre: 100}, {rows: []int{14, 16}, centre: 100, ring: 110}},
	11000: {{rows: []int{13, 14, 15, 16}, centre: 100}},
}

func TestMultipliersDepartFromSuppliedOnlyAtBlockedCentres(t *testing.T) {
	for _, profile := range profiles {
		for rows := MinRows; rows <= MaxRows; rows++ {
			for _, risk := range Risks {
				table, err := profile.Table(Params{Rows: rows, Risk: risk})
				if err != nil {
					t.Fatal(err)
				}
				supplied := SuppliedMultipliersHundredths[rows][risk]
				if len(table.MultipliersHundredths) != len(supplied) {
					t.Fatalf("%s %d rows %s: board shape changed", profile.Ref, rows, risk)
				}
				slots := len(supplied)
				for i, got := range table.MultipliersHundredths {
					want := supplied[i]
					if risk == RiskLow {
						want = departed(departures[profile.BasisPoints], rows, abs(2*i-(slots-1)), want)
					}
					if got != want {
						t.Fatalf("%s %d rows %s slot %d: want %d, got %d", profile.Ref, rows, risk, i, want, got)
					}
				}
			}
		}
	}
}

// departed is the multiplier a departure assigns at twice the distance from the
// centre — 0 or 1 is a centre slot, 2 or 3 the first ring — or the supplied one.
func departed(list []departure, rows, doubledDistance, supplied int) int {
	for _, d := range list {
		for _, r := range d.rows {
			if r != rows {
				continue
			}
			switch {
			case doubledDistance <= 1:
				return d.centre
			case doubledDistance <= 3 && d.ring != 0:
				return d.ring
			}
		}
	}
	return supplied
}

func abs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
