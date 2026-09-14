package money

import "testing"

func TestIsSafeMinor(t *testing.T) {
	for _, value := range []int64{-MaxSafeMinor, 0, MaxSafeMinor} {
		if !IsSafeMinor(value) {
			t.Fatalf("%d should be safe", value)
		}
	}
	for _, value := range []int64{-MaxSafeMinor - 1, MaxSafeMinor + 1} {
		if IsSafeMinor(value) {
			t.Fatalf("%d should be unsafe", value)
		}
	}
}
