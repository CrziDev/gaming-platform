package app

import (
	"strings"
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
	if cfg.Environment != "development" || cfg.Port != 8080 || cfg.CookieName != "gp_session" || cfg.CookieSecure || cfg.TrustProxyHeaders || cfg.LoginsPerMinute != 10 || cfg.ChatMessagesPerMinute != 20 || cfg.BigWinMultiplierHundredths != 1000 || cfg.EmailDeliveryProvider != "disabled" || cfg.PublicWebURL != "http://localhost:5173" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "http://localhost:5173" {
		t.Fatalf("unexpected default origins: %v", cfg.AllowedOrigins)
	}
}

func TestConfigFromEnvValidatesStagingSafety(t *testing.T) {
	valid := map[string]string{
		"APP_ENV": "staging", "DATABASE_URL": "postgres://example", "SESSION_SECURE": "true",
		"CORS_ALLOWED_ORIGINS": " https://stage.example.com/,https://stage.example.com ",
		"TRUST_PROXY_HEADERS":  "true",
	}
	cfg, err := ConfigFromEnv(func(key string) string { return valid[key] })
	if err != nil {
		t.Fatalf("valid staging configuration rejected: %v", err)
	}
	if !cfg.CookieSecure || !cfg.TrustProxyHeaders || len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "https://stage.example.com" {
		t.Fatalf("unexpected staging configuration: %+v", cfg)
	}

	for name, mutate := range map[string]func(map[string]string){
		"insecure cookie": func(env map[string]string) { env["SESSION_SECURE"] = "false" },
		"HTTP origin":     func(env map[string]string) { env["CORS_ALLOWED_ORIGINS"] = "http://stage.example.com" },
		"origin path":     func(env map[string]string) { env["CORS_ALLOWED_ORIGINS"] = "https://stage.example.com/api" },
		"bad boolean":     func(env map[string]string) { env["TRUST_PROXY_HEADERS"] = "sometimes" },
	} {
		t.Run(name, func(t *testing.T) {
			env := cloneEnv(valid)
			mutate(env)
			if _, err := ConfigFromEnv(func(key string) string { return env[key] }); err == nil {
				t.Fatal("unsafe staging configuration was accepted")
			}
		})
	}
}

func TestConfigFromEnvRejectsInvalidNumericSettings(t *testing.T) {
	for _, key := range []string{
		"APP_PORT", "DATABASE_MAX_CONNS", "DATABASE_MIN_CONNS", "HTTP_MAX_BODY_BYTES",
		"LOGIN_ATTEMPTS_PER_MINUTE", "CHAT_MESSAGES_PER_MINUTE", "BIG_WIN_MULTIPLIER_HUNDREDTHS",
	} {
		t.Run(key, func(t *testing.T) {
			env := map[string]string{"DATABASE_URL": "postgres://example", key: "not-a-number"}
			_, err := ConfigFromEnv(func(name string) string { return env[name] })
			if err == nil || !strings.Contains(err.Error(), key) {
				t.Fatalf("%s error = %v", key, err)
			}
		})
	}
}

func TestConfigFromEnvValidatesResend(t *testing.T) {
	valid := map[string]string{
		"DATABASE_URL": "postgres://example", "EMAIL_DELIVERY_PROVIDER": "resend",
		"PUBLIC_WEB_URL": "https://play.example.com", "RESEND_API_KEY": "re_key",
		"RESEND_FROM": "HeziBet <security@example.com>",
	}
	if _, err := ConfigFromEnv(func(key string) string { return valid[key] }); err != nil {
		t.Fatalf("valid Resend configuration rejected: %v", err)
	}

	for name, mutate := range map[string]func(map[string]string){
		"provider":    func(env map[string]string) { env["EMAIL_DELIVERY_PROVIDER"] = "smtp" },
		"http URL":    func(env map[string]string) { env["PUBLIC_WEB_URL"] = "http://play.example.com" },
		"URL path":    func(env map[string]string) { env["PUBLIC_WEB_URL"] = "https://play.example.com/app" },
		"missing key": func(env map[string]string) { env["RESEND_API_KEY"] = "" },
		"bad key":     func(env map[string]string) { env["RESEND_API_KEY"] = "secret" },
		"bad sender":  func(env map[string]string) { env["RESEND_FROM"] = "not an address" },
	} {
		t.Run(name, func(t *testing.T) {
			env := cloneEnv(valid)
			mutate(env)
			if _, err := ConfigFromEnv(func(key string) string { return env[key] }); err == nil {
				t.Fatal("invalid email configuration was accepted")
			}
		})
	}
}

func cloneEnv(source map[string]string) map[string]string {
	copy := make(map[string]string, len(source))
	for key, value := range source {
		copy[key] = value
	}
	return copy
}
