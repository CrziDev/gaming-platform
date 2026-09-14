package app

import (
	"errors"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	DatabaseURL     string
	DatabaseMaxOpen int
	DatabaseMaxIdle int
	Port            int
	CookieName      string
	CookieSecure    bool
	SessionTTL      time.Duration
	AllowedOrigins  []string
	MaxBodyBytes    int64
	ProofDir        string
	LoginsPerMinute int
}

// ConfigFromEnv reads every setting through lookup, which is os.Getenv in the
// server and a map in tests. Nothing else in the application reads the environment.
func ConfigFromEnv(lookup func(string) string) (Config, error) {
	databaseURL := lookup("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	sessionTTL, err := sessionTTL(lookup("SESSION_TTL_HOURS"))
	if err != nil {
		return Config{}, err
	}
	return Config{
		DatabaseURL:     databaseURL,
		DatabaseMaxOpen: envInt(lookup, "DATABASE_MAX_CONNS", 10),
		DatabaseMaxIdle: envInt(lookup, "DATABASE_MIN_CONNS", 1),
		Port:            envInt(lookup, "APP_PORT", 8080),
		CookieName:      env(lookup, "SESSION_COOKIE_NAME", "gp_session"),
		CookieSecure:    env(lookup, "SESSION_SECURE", "false") == "true",
		SessionTTL:      sessionTTL,
		AllowedOrigins:  strings.Split(env(lookup, "CORS_ALLOWED_ORIGINS", "http://localhost:5173"), ","),
		MaxBodyBytes:    int64(envInt(lookup, "HTTP_MAX_BODY_BYTES", 6<<20)),
		ProofDir:        env(lookup, "PRIVATE_PROOF_DIR", "storage/private/deposit-proofs"),
		LoginsPerMinute: envInt(lookup, "LOGIN_ATTEMPTS_PER_MINUTE", 10),
	}, nil
}

func LogLevel(value string) slog.Level {
	switch strings.ToLower(value) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func sessionTTL(raw string) (time.Duration, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 24 * time.Hour, nil
	}
	hours, err := strconv.Atoi(raw)
	if err != nil || hours <= 0 || hours > int(math.MaxInt64/int64(time.Hour)) {
		return 0, errors.New("SESSION_TTL_HOURS must be a positive whole number of hours")
	}
	return time.Duration(hours) * time.Hour, nil
}

func env(lookup func(string) string, key, fallback string) string {
	if value := lookup(key); value != "" {
		return value
	}
	return fallback
}

func envInt(lookup func(string) string, key string, fallback int) int {
	value, err := strconv.Atoi(lookup(key))
	if err != nil {
		return fallback
	}
	return value
}
