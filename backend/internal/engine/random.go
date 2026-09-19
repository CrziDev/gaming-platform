package engine

import (
	cryptorand "crypto/rand"
	"encoding/binary"
	"math"
	"math/rand/v2"
)

// Source is math/rand/v2's source contract, so a Rand built on it gives
// rejection-sampled, unbiased bounded integers without bespoke code here.
type Source = rand.Source

type secureSource struct{}

func (secureSource) Uint64() uint64 {
	var buf [8]byte
	// crypto/rand.Read never returns an error since Go 1.24; it aborts the process
	// instead of handing back weak bytes.
	_, _ = cryptorand.Read(buf[:])
	return binary.LittleEndian.Uint64(buf[:])
}

// SecureSource is the only source production outcome selection may use. Test
// files build their own deterministic Source; nothing at runtime can select one.
func SecureSource() Source {
	return secureSource{}
}

// WeightedIndex draws an index with probability weight[i] / Σ weights. Every
// weight must be positive and the sum must fit int64.
func WeightedIndex(src Source, weights []int64) (int, error) {
	total, err := SumWeights(weights)
	if err != nil {
		return 0, err
	}
	roll := rand.New(src).Int64N(total)
	for i, weight := range weights {
		if roll < weight {
			return i, nil
		}
		roll -= weight
	}
	return len(weights) - 1, nil
}

func SumWeights(weights []int64) (int64, error) {
	if len(weights) == 0 {
		return 0, ErrInvalidWeights
	}
	var total int64
	for _, weight := range weights {
		if weight <= 0 || weight > math.MaxInt64-total {
			return 0, ErrInvalidWeights
		}
		total += weight
	}
	return total, nil
}
