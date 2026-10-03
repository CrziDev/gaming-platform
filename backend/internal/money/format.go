package money

import (
	"strconv"
	"strings"
)

// FormatMinor writes an amount in major units with thousands separators, so
// 123456 with two minor units is "1,234.56". It is for text a person reads, such
// as an email; the API carries minor units.
func FormatMinor(amount int64, minorUnits int) string {
	magnitude := uint64(amount)
	sign := ""
	if amount < 0 {
		magnitude = -magnitude
		sign = "-"
	}
	digits := strconv.FormatUint(magnitude, 10)
	if minorUnits <= 0 {
		return sign + groupThousands(digits)
	}
	if len(digits) <= minorUnits {
		digits = strings.Repeat("0", minorUnits-len(digits)+1) + digits
	}
	split := len(digits) - minorUnits
	return sign + groupThousands(digits[:split]) + "." + digits[split:]
}

func groupThousands(digits string) string {
	var grouped strings.Builder
	for i, digit := range digits {
		if i > 0 && (len(digits)-i)%3 == 0 {
			grouped.WriteByte(',')
		}
		grouped.WriteRune(digit)
	}
	return grouped.String()
}
