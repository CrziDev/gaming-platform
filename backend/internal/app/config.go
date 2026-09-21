package app

import (
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/mail"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment                string
	DatabaseURL                string
	DatabaseMaxOpen            int
	DatabaseMaxIdle            int
	Port                       int
	CookieName                 string
	CookieSecure               bool
	SessionTTL                 time.Duration
	AllowedOrigins             []string
	MaxBodyBytes               int64
	ProofDir                   string
	LoginsPerMinute            int
	ChatMessagesPerMinute      int
	BigWinMultiplierHundredths int
	EmailDeliveryProvider      string
	PublicWebURL               string
	ResendAPIKey               string
	ResendFrom                 string
	TrustProxyHeaders          bool
}

// ConfigFromEnv reads every setting through lookup, which is os.Getenv in the
// server and a map in tests. Nothing else in the application reads the environment.
func ConfigFromEnv(lookup func(string) string) (Config, error) {
	databaseURL := lookup("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	environment := strings.ToLower(strings.TrimSpace(env(lookup, "APP_ENV", "development")))
	if environment != "development" && environment != "staging" && environment != "production" {
		return Config{}, errors.New("APP_ENV must be development, staging, or production")
	}
	sessionTTL, err := sessionTTL(lookup("SESSION_TTL_HOURS"))
	if err != nil {
		return Config{}, err
	}
	port, err := envIntInRange(lookup, "APP_PORT", 8080, 1, 65535)
	if err != nil {
		return Config{}, err
	}
	maxOpen, err := envIntInRange(lookup, "DATABASE_MAX_CONNS", 10, 1, math.MaxInt)
	if err != nil {
		return Config{}, err
	}
	maxIdle, err := envIntInRange(lookup, "DATABASE_MIN_CONNS", 1, 0, maxOpen)
	if err != nil {
		return Config{}, err
	}
	maxBody, err := envIntInRange(lookup, "HTTP_MAX_BODY_BYTES", 6<<20, 1, math.MaxInt)
	if err != nil {
		return Config{}, err
	}
	loginsPerMinute, err := envIntInRange(lookup, "LOGIN_ATTEMPTS_PER_MINUTE", 10, 1, math.MaxInt)
	if err != nil {
		return Config{}, err
	}
	chatMessagesPerMinute, err := envIntInRange(lookup, "CHAT_MESSAGES_PER_MINUTE", 20, 1, math.MaxInt)
	if err != nil {
		return Config{}, err
	}
	bigWinMultiplier, err := envIntInRange(lookup, "BIG_WIN_MULTIPLIER_HUNDREDTHS", 1000, 0, math.MaxInt)
	if err != nil {
		return Config{}, err
	}
	cookieSecure, err := envBool(lookup, "SESSION_SECURE", false)
	if err != nil {
		return Config{}, err
	}
	trustProxyHeaders, err := envBool(lookup, "TRUST_PROXY_HEADERS", false)
	if err != nil {
		return Config{}, err
	}
	allowedOrigins, err := allowedOrigins(lookup("CORS_ALLOWED_ORIGINS"), environment)
	if err != nil {
		return Config{}, err
	}
	if environment != "development" && !cookieSecure {
		return Config{}, errors.New("SESSION_SECURE must be true in staging and production")
	}
	cfg := Config{
		Environment:                environment,
		DatabaseURL:                databaseURL,
		DatabaseMaxOpen:            maxOpen,
		DatabaseMaxIdle:            maxIdle,
		Port:                       port,
		CookieName:                 env(lookup, "SESSION_COOKIE_NAME", "gp_session"),
		CookieSecure:               cookieSecure,
		SessionTTL:                 sessionTTL,
		AllowedOrigins:             allowedOrigins,
		MaxBodyBytes:               int64(maxBody),
		ProofDir:                   env(lookup, "PRIVATE_PROOF_DIR", "storage/private/deposit-proofs"),
		LoginsPerMinute:            loginsPerMinute,
		ChatMessagesPerMinute:      chatMessagesPerMinute,
		BigWinMultiplierHundredths: bigWinMultiplier,
		EmailDeliveryProvider:      strings.ToLower(strings.TrimSpace(env(lookup, "EMAIL_DELIVERY_PROVIDER", "disabled"))),
		PublicWebURL:               strings.TrimSpace(env(lookup, "PUBLIC_WEB_URL", "http://localhost:5173")),
		ResendAPIKey:               strings.TrimSpace(lookup("RESEND_API_KEY")),
		ResendFrom:                 strings.TrimSpace(lookup("RESEND_FROM")),
		TrustProxyHeaders:          trustProxyHeaders,
	}
	if err := validateEmailDelivery(cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func validateEmailDelivery(cfg Config) error {
	switch cfg.EmailDeliveryProvider {
	case "disabled":
		return nil
	case "resend":
	default:
		return errors.New("EMAIL_DELIVERY_PROVIDER must be disabled or resend")
	}

	publicURL, err := url.Parse(cfg.PublicWebURL)
	if err != nil || publicURL.Scheme != "https" || publicURL.Host == "" || publicURL.User != nil || (publicURL.Path != "" && publicURL.Path != "/") || publicURL.RawQuery != "" || publicURL.Fragment != "" {
		return errors.New("PUBLIC_WEB_URL must be an HTTPS origin without credentials, path, query, or fragment when Resend is enabled")
	}
	if !strings.HasPrefix(cfg.ResendAPIKey, "re_") || strings.ContainsAny(cfg.ResendAPIKey, " \t\r\n") {
		return errors.New("RESEND_API_KEY must be a valid Resend API key when Resend is enabled")
	}
	from, err := mail.ParseAddress(cfg.ResendFrom)
	if err != nil || from.Address == "" {
		return errors.New("RESEND_FROM must be a valid email sender when Resend is enabled")
	}
	return nil
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

func envIntInRange(lookup func(string) string, key string, fallback, minimum, maximum int) (int, error) {
	raw := strings.TrimSpace(lookup(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be a whole number between %d and %d", key, minimum, maximum)
	}
	return value, nil
}

func envBool(lookup func(string) string, key string, fallback bool) (bool, error) {
	raw := strings.TrimSpace(lookup(key))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, fmt.Errorf("%s must be true or false", key)
	}
	return value, nil
}

func allowedOrigins(raw, environment string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		raw = "http://localhost:5173"
	}
	seen := make(map[string]struct{})
	origins := make([]string, 0)
	for value := range strings.SplitSeq(raw, ",") {
		value = strings.TrimSpace(value)
		parsed, err := url.Parse(value)
		if err != nil || parsed.Host == "" || strings.Contains(parsed.Host, "*") || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS contains an invalid origin %q", value)
		}
		if environment != "development" && parsed.Scheme != "https" {
			return nil, errors.New("CORS_ALLOWED_ORIGINS must contain only HTTPS origins in staging and production")
		}
		origin := parsed.Scheme + "://" + parsed.Host
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		origins = append(origins, origin)
	}
	if len(origins) == 0 {
		return nil, errors.New("CORS_ALLOWED_ORIGINS must contain at least one origin")
	}
	return origins, nil
}
