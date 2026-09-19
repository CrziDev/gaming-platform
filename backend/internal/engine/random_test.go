package engine

import (
	"errors"
	"math"
	"math/big"
	"testing"
)

// sequenceSource replays fixed 64-bit values; Int64N maps them through
// rejection sampling, so a test chooses values below the bound's multiple.
type sequenceSource struct {
	values []uint64
	next   int
}

func (s *sequenceSource) Uint64() uint64 {
	value := s.values[s.next%len(s.values)]
	s.next++
	return value
}

// rollValue is a 64-bit draw that Int64N(n) maps to exactly roll on its first
// try: Lemire's method keeps the high word of draw × n and rejects a low word
// under 2^64 mod n, so ceil(roll × 2^64 / n) + 1 lands at high word roll with a
// low word of at least n.
func rollValue(roll, n int64) uint64 {
	value := new(big.Int).Lsh(big.NewInt(roll), 64)
	value.Add(value, big.NewInt(n-1))
	value.Div(value, big.NewInt(n))
	value.Add(value, big.NewInt(1))
	return value.Uint64()
}

func TestIndexForRollWalksCumulativeWeights(t *testing.T) {
	weights := []int64{1, 2, 3}
	for roll, want := range []int{0, 1, 1, 2, 2, 2} {
		if got := indexForRoll(int64(roll), weights); got != want {
			t.Fatalf("roll %d: want index %d, got %d", roll, want, got)
		}
	}
}

func TestWeightedIndexDrawsTheRollFromTheSource(t *testing.T) {
	weights := []int64{1, 2, 3}
	for roll, want := range map[int64]int{0: 0, 5: 2} {
		src := &sequenceSource{values: []uint64{rollValue(roll, 6)}}
		got, err := WeightedIndex(src, weights)
		if err != nil {
			t.Fatalf("roll %d: %v", roll, err)
		}
		if got != want {
			t.Fatalf("roll %d: want index %d, got %d", roll, want, got)
		}
	}
}

func TestWeightedIndexRefusesBadWeights(t *testing.T) {
	for name, weights := range map[string][]int64{
		"empty":    nil,
		"zero":     {1, 0},
		"negative": {1, -1},
		"overflow": {math.MaxInt64, 1},
	} {
		if _, err := WeightedIndex(SecureSource(), weights); !errors.Is(err, ErrInvalidWeights) {
			t.Fatalf("%s: want %v, got %v", name, ErrInvalidWeights, err)
		}
	}
}

func TestSecureSourceVaries(t *testing.T) {
	src := SecureSource()
	first := src.Uint64()
	for range 8 {
		if src.Uint64() != first {
			return
		}
	}
	t.Fatal("secure source repeated one value nine times")
}

func TestWeightedIndexSecureSourceCoversEverySlot(t *testing.T) {
	weights := []int64{1, 1, 1, 1}
	seen := make(map[int]bool)
	for range 2_000 {
		index, err := WeightedIndex(SecureSource(), weights)
		if err != nil {
			t.Fatal(err)
		}
		seen[index] = true
	}
	if len(seen) != len(weights) {
		t.Fatalf("saw %d of %d slots", len(seen), len(weights))
	}
}
