package plinko

import (
	"fmt"
	"math"
	"sort"

	"github.com/gaming-platform/backend/internal/engine"
)

// TheoreticalBasisPoints is Σ weight × multiplier over Σ weight, expressed in basis
// points and rounded half up. Integer throughout: the largest configured product
// (a 2.2e9 weight sum against a 500× multiplier) stays far inside int64.
func TheoreticalBasisPoints(table Table) (int, error) {
	total, err := engine.SumWeights(table.Weights)
	if err != nil {
		return 0, fmt.Errorf("plinko: theoretical rtp: %w", err)
	}
	if len(table.MultipliersHundredths) != len(table.Weights) {
		return 0, fmt.Errorf("plinko: theoretical rtp: %w: %d weights but %d multipliers", engine.ErrInvalidConfig, len(table.Weights), len(table.MultipliersHundredths))
	}
	var weighted int64
	for i, weight := range table.Weights {
		multiplier := int64(table.MultipliersHundredths[i])
		if multiplier <= 0 {
			return 0, fmt.Errorf("plinko: theoretical rtp: %w: multiplier %d is not positive", engine.ErrInvalidConfig, i)
		}
		if weight > math.MaxInt64/multiplier {
			return 0, fmt.Errorf("plinko: theoretical rtp: %w: slot %d product overflows", engine.ErrInvalidConfig, i)
		}
		product := weight * multiplier
		if product > math.MaxInt64-weighted {
			return 0, fmt.Errorf("plinko: theoretical rtp: %w: weighted sum overflows", engine.ErrInvalidConfig)
		}
		weighted += product
	}
	// Hundredths over a share of one give a ratio × 100; basis points need × 10000.
	if weighted > math.MaxInt64/100 {
		return 0, fmt.Errorf("plinko: theoretical rtp: %w: basis point scale overflows", engine.ErrInvalidConfig)
	}
	return int((weighted*100 + total/2) / total), nil
}

const chanceScale = int64(100_000) // 100.000%, in thousandths of a percent.

type chanceRemainder struct {
	slot      int
	remainder int64
}

// normalizedChances uses largest-remainder apportionment. Every returned value
// is an integer thousandth of one percent, and the slice always sums to 100000.
func normalizedChances(weights []int64) ([]int, error) {
	total, err := engine.SumWeights(weights)
	if err != nil {
		return nil, fmt.Errorf("plinko: normalize chances: %w", err)
	}
	chances := make([]int, len(weights))
	remainders := make([]chanceRemainder, len(weights))
	assigned := int64(0)
	for i, weight := range weights {
		scaled := weight * chanceScale
		chances[i] = int(scaled / total)
		assigned += int64(chances[i])
		remainders[i] = chanceRemainder{slot: i, remainder: scaled % total}
	}
	sort.SliceStable(remainders, func(i, j int) bool {
		return remainders[i].remainder > remainders[j].remainder
	})
	for i := int64(0); i < chanceScale-assigned; i++ {
		chances[remainders[i].slot]++
	}
	return chances, nil
}
