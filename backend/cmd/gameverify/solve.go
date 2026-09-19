package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"math"
	"os"
	"strings"

	"github.com/gaming-platform/backend/internal/engine/plinko"
)

// The centre slot's weight; every other slot is decay^distance of it, rounded.
// 1e9 keeps eight steps of a 0.1 decay above zero and every product inside int64.
const weightScale = 1e9

func solve(args []string) error {
	flags := flag.NewFlagSet("solve", flag.ContinueOnError)
	ref := flags.String("config", "", "engine configuration reference whose multipliers to solve for")
	target := flags.Int("target", 9600, "return to reach, in basis points")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *ref == "" {
		return errors.New("solve: -config is required")
	}
	profile, err := plinko.ProfileByRef(*ref)
	if err != nil {
		return err
	}
	return writeSolution(os.Stdout, profile, *target)
}

func writeSolution(w io.Writer, profile plinko.Profile, target int) error {
	fmt.Fprintf(w, "%s at %d basis points\n\n| Rows | Risk | Decay | Weights |\n| ---: | --- | ---: | --- |\n", profile.Ref, target)
	var literal strings.Builder
	for rows := plinko.MinRows; rows <= plinko.MaxRows; rows++ {
		for _, risk := range plinko.Risks {
			params := plinko.Params{Rows: rows, Risk: risk}
			table, err := profile.Table(params)
			if err != nil {
				return err
			}
			weights, decay, err := solveWeights(table.MultipliersHundredths, target)
			if err != nil {
				return fmt.Errorf("%d rows %s: %w", rows, risk, err)
			}
			fmt.Fprintf(w, "| %d | %s | %.4f | `%s` |\n", rows, risk, decay, joinInt64(weights))
			fmt.Fprintf(&literal, "\t{Rows: %d, Risk: Risk%s}: {\n\t\tWeights: []int64{%s},\n", rows, strings.ToUpper(string(risk[:1]))+string(risk[1:]), joinInt64(weights))
		}
	}
	fmt.Fprintf(w, "\nGo literal weights:\n\n%s", literal.String())
	return nil
}

// solveWeights bisects the decay in (0, 1) until the integer model returns the
// target exactly. Return rises with the decay because outer slots pay more, so
// there is at most one answer; none exists when the target sits below the
// board's smallest multiplier or above its plain average.
func solveWeights(multipliers []int, target int) ([]int64, float64, error) {
	low, high := 0.0, 1.0
	for range 200 {
		decay := (low + high) / 2
		weights := decayWeights(len(multipliers), decay)
		basisPoints, err := plinko.TheoreticalBasisPoints(plinko.Table{Weights: weights, MultipliersHundredths: multipliers})
		switch {
		case err != nil, basisPoints < target:
			low = decay
		case basisPoints == target:
			return weights, decay, nil
		default:
			high = decay
		}
	}
	return nil, 0, fmt.Errorf("no decay in (0, 1) reaches %d basis points", target)
}

func decayWeights(slots int, decay float64) []int64 {
	weights := make([]int64, slots)
	centre := float64(slots-1) / 2
	for i := range slots {
		weights[i] = int64(math.Round(math.Pow(decay, math.Abs(float64(i)-centre)) * weightScale))
	}
	return weights
}

func joinInt64(values []int64) string {
	parts := make([]string, len(values))
	for i, value := range values {
		parts[i] = fmt.Sprint(value)
	}
	return strings.Join(parts, ", ")
}
