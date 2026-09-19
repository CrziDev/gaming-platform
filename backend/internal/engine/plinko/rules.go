package plinko

import (
	"errors"
	"fmt"
	"math"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/money"
)

var (
	ErrInvalidStake   = errors.New("plinko: stake must be a positive safe amount")
	ErrPayoutOverflow = errors.New("plinko: payout cannot be represented safely")
)

func Pick(src engine.Source, table Table) (int, error) {
	slot, err := engine.WeightedIndex(src, table.Weights)
	if err != nil {
		return 0, fmt.Errorf("plinko: pick slot: %w", err)
	}
	return slot, nil
}

// Payout is stake × multiplier / 100 in minor units, truncated toward zero. The
// product is checked before it is formed and the result must stay JSON-safe.
// With a wager step that is a multiple of 100 minor units the division is exact.
func Payout(stakeMinor int64, multiplierHundredths int) (int64, error) {
	if stakeMinor <= 0 || !money.IsSafeMinor(stakeMinor) {
		return 0, ErrInvalidStake
	}
	if multiplierHundredths <= 0 {
		return 0, fmt.Errorf("%w: multiplier must be positive", engine.ErrInvalidConfig)
	}
	multiplier := int64(multiplierHundredths)
	if stakeMinor > math.MaxInt64/multiplier {
		return 0, ErrPayoutOverflow
	}
	win := stakeMinor * multiplier / 100
	if !money.IsSafeMinor(win) {
		return 0, ErrPayoutOverflow
	}
	return win, nil
}
