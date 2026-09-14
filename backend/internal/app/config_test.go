package app

import (
	"testing"
	"time"
)

func TestConfigFromEnvRequiresADatabaseURL(t *testing.T) {
	if _, err := ConfigFromEnv(func(string) string { return "" }); err == nil {
		t.Fatal("an empty environment was accepted")
	}
}

func TestConfigFromEnvSessionTTL(t *testing.T) {
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
			env := map[string]string{"DATABASE_URL": "postgres://example", "SESSION_TTL_HOURS": test.value}
			cfg, err := ConfigFromEnv(func(key string) string { return env[key] })
			if test.bad {
				if err == nil {
					t.Fatalf("value %q was accepted as %s", test.value, cfg.SessionTTL)
				}
				return
			}
			if err != nil || cfg.SessionTTL != test.want {
				t.Fatalf("TTL = %s, err = %v; want %s", cfg.SessionTTL, err, test.want)
			}
		})
	}
}

func TestConfigFromEnvDefaults(t *testing.T) {
	cfg, err := ConfigFromEnv(func(key string) string {
		if key == "DATABASE_URL" {
			return "postgres://example"
		}
		return ""
	})
	if err != nil {
		t.Fatalf("defaults rejected: %v", err)
	}
	if cfg.Port != 8080 || cfg.CookieName != "gp_session" || cfg.CookieSecure || cfg.LoginsPerMinute != 10 {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "http://localhost:5173" {
		t.Fatalf("unexpected default origins: %v", cfg.AllowedOrigins)
	}
}
