// Package money contains invariants shared by stored and wire-level money.
package money

// MaxSafeMinor is the largest integer JavaScript can represent exactly. Money
// remains an int64 internally and a JSON number on the wire, so every exposed
// minor-unit value must stay within this symmetric range.
const MaxSafeMinor int64 = 1<<53 - 1

func IsSafeMinor(value int64) bool {
	return value >= -MaxSafeMinor && value <= MaxSafeMinor
}
