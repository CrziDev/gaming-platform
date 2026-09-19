package plinko

import (
	"errors"
	"math"
	"math/big"
	"testing"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/money"
)

type sequenceSource struct {
	values []uint64
	next   int
}

func (s *sequenceSource) Uint64() uint64 {
	value := s.values[s.next%len(s.values)]
	s.next++
	return value
}

// rollSource replays a draw that Int64N(total) maps to exactly roll on its first
// try; see rollValue in the engine package's tests.
func rollSource(roll, total int64) engine.Source {
	value := new(big.Int).Lsh(big.NewInt(roll), 64)
	value.Add(value, big.NewInt(total-1))
	value.Div(value, big.NewInt(total))
	value.Add(value, big.NewInt(1))
	return &sequenceSource{values: []uint64{value.Uint64()}}
}

func TestPickReachesEverySlotInWeightOrder(t *testing.T) {
	table := Table{Weights: []int64{1, 2, 4, 2, 1}, MultipliersHundredths: []int{300, 150, 50, 150, 300}}
	wants := []int{0, 1, 1, 2, 2, 2, 2, 3, 3, 4}
	for roll, want := range wants {
		slot, err := Pick(rollSource(int64(roll), 10), table)
		if err != nil {
			t.Fatal(err)
		}
		if slot != want {
			t.Fatalf("roll %d: want slot %d, got %d", roll, want, slot)
		}
	}
}

func TestPickSecureSourceStaysOnTheBoard(t *testing.T) {
	table, err := SuppliedTable(Params{Rows: 16, Risk: RiskHigh})
	if err != nil {
		t.Fatal(err)
	}
	for range 10_000 {
		slot, err := Pick(engine.SecureSource(), table)
		if err != nil {
			t.Fatal(err)
		}
		if slot < 0 || slot >= table.Slots() {
			t.Fatalf("slot %d is off a %d-slot board", slot, table.Slots())
		}
	}
}

func TestPayout(t *testing.T) {
	cases := []struct {
		stake      int64
		multiplier int
		want       int64
	}{
		{stake: 100, multiplier: 50, want: 50},
		{stake: 100, multiplier: 170, want: 170},
		{stake: 250, multiplier: 110, want: 275},
		{stake: 500_000, multiplier: 50000, want: 250_000_000},
		{stake: 1, multiplier: 50, want: 0},
		{stake: 3, multiplier: 50, want: 1},
	}
	for _, c := range cases {
		got, err := Payout(c.stake, c.multiplier)
		if err != nil {
			t.Fatalf("%d × %d: %v", c.stake, c.multiplier, err)
		}
		if got != c.want {
			t.Fatalf("%d × %d: want %d, got %d", c.stake, c.multiplier, c.want, got)
		}
	}
}

func TestPayoutRefusesUnsafeAmounts(t *testing.T) {
	for _, stake := range []int64{0, -100, money.MaxSafeMinor + 1} {
		if _, err := Payout(stake, 100); !errors.Is(err, ErrInvalidStake) {
			t.Fatalf("stake %d: want %v, got %v", stake, ErrInvalidStake, err)
		}
	}
	if _, err := Payout(100, 0); !errors.Is(err, engine.ErrInvalidConfig) {
		t.Fatalf("zero multiplier: want %v, got %v", engine.ErrInvalidConfig, err)
	}
	for _, c := range []struct {
		stake      int64
		multiplier int
	}{
		{stake: money.MaxSafeMinor, multiplier: 101},
		{stake: money.MaxSafeMinor, multiplier: math.MaxInt32},
	} {
		if _, err := Payout(c.stake, c.multiplier); !errors.Is(err, ErrPayoutOverflow) {
			t.Fatalf("%d × %d: want %v, got %v", c.stake, c.multiplier, ErrPayoutOverflow, err)
		}
	}
}
