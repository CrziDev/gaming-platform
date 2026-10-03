package money

import (
	"math"
	"testing"
)

func TestFormatMinor(t *testing.T) {
	for _, tc := range []struct {
		amount     int64
		minorUnits int
		want       string
	}{
		{0, 2, "0.00"},
		{5, 2, "0.05"},
		{100000, 2, "1,000.00"},
		{123456789, 2, "1,234,567.89"},
		{-150, 2, "-1.50"},
		{1000, 0, "1,000"},
		{12345, 4, "1.2345"},
		{MaxSafeMinor, 2, "90,071,992,547,409.91"},
		{math.MinInt64, 2, "-92,233,720,368,547,758.08"},
	} {
		if got := FormatMinor(tc.amount, tc.minorUnits); got != tc.want {
			t.Errorf("FormatMinor(%d, %d) = %q, want %q", tc.amount, tc.minorUnits, got, tc.want)
		}
	}
}
