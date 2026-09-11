package app

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/auth"
	"github.com/gaming-platform/backend/internal/currency"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/wallet"
)

type Config struct {
	CookieName      string
	CookieSecure    bool
	SessionTTL      time.Duration
	AllowedOrigins  []string
	MaxBodyBytes    int64
	LoginsPerMinute int
}

func New(db *sql.DB, logger *slog.Logger, cfg Config) http.Handler {
	authHandler := auth.NewHandler(db, logger, auth.Config{
		CookieName:      cfg.CookieName,
		CookieSecure:    cfg.CookieSecure,
		SessionTTL:      cfg.SessionTTL,
		LoginsPerMinute: cfg.LoginsPerMinute,
	})
	currencyHandler := currency.NewHandler(db, logger)
	walletHandler := wallet.NewHandler(db, logger, authHandler.CurrentUser)

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/register", authHandler.Register)
	mux.HandleFunc("POST /api/login", authHandler.Login)
	mux.HandleFunc("POST /api/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/me", authHandler.Me)
	mux.HandleFunc("GET /api/currencies", currencyHandler.List)
	mux.HandleFunc("GET /api/wallets", walletHandler.List)
	mux.HandleFunc("GET /api/wallets/{currency}", walletHandler.Get)
	mux.HandleFunc("GET /api/wallets/{currency}/transactions", walletHandler.Transactions)
	mux.HandleFunc("GET /api/transactions", walletHandler.Transactions)
	mux.HandleFunc("GET /api/admin/users", authHandler.AdminUsers)
	mux.HandleFunc("/", notFound)

	return logAndRecover(logger, browserRules(cfg.AllowedOrigins, limitBody(cfg.MaxBodyBytes, mux)))
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotFound, "No resource matches that path")
}
