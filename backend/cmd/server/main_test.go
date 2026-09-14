package main

import (
	"testing"
	"time"
)

func TestSessionTTLFromEnv(t *testing.T) {
	for name, test := range map[string]struct {
		value string
		want  time.Duration
		bad   bool
	}{
		"default":    {want: 24 * time.Hour},
		"configured": {value: "48", want: 48 * time.Hour},
		"zero":       {value: "0", bad: true},
		"negative":   {value: "-1", bad: true},
		"malformed":  {value: "tomorrow", bad: true},
	} {
		t.Run(name, func(t *testing.T) {
			t.Setenv("SESSION_TTL_HOURS", test.value)
			got, err := sessionTTLFromEnv()
			if test.bad {
				if err == nil {
					t.Fatalf("value %q was accepted as %s", test.value, got)
				}
				return
			}
			if err != nil || got != test.want {
				t.Fatalf("TTL = %s, err = %v; want %s", got, err, test.want)
			}
		})
	}
}
