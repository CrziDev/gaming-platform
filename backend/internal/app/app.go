package app

import (
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/auth"
	"github.com/gaming-platform/backend/internal/currency"
	"github.com/gaming-platform/backend/internal/dashboard"
	"github.com/gaming-platform/backend/internal/deposit"
	"github.com/gaming-platform/backend/internal/game"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/rtp"
	"github.com/gaming-platform/backend/internal/user"
	"github.com/gaming-platform/backend/internal/wallet"
)

type Config struct {
	CookieName      string
	CookieSecure    bool
	SessionTTL      time.Duration
	AllowedOrigins  []string
	MaxBodyBytes    int64
	ProofDir        string
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
	gameHandler := game.NewHandler(db, logger)
	rtpHandler := rtp.NewHandler(db, logger)
	walletHandler := wallet.NewHandler(db, logger)
	depositHandler := deposit.NewHandler(db, logger, cfg.ProofDir)
	dashboardHandler := dashboard.NewHandler(db, logger)
	auditHandler := audit.NewHandler(db, logger)
	player, admin := authHandler.Player, authHandler.Admin

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/register", authHandler.Register)
	mux.HandleFunc("POST /api/login", authHandler.Login)
	mux.HandleFunc("POST /api/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/me", player(authHandler.Me))
	mux.HandleFunc("GET /api/currencies", currencyHandler.List)
	mux.HandleFunc("GET /api/categories", gameHandler.Categories)
	mux.HandleFunc("GET /api/games", gameHandler.List)
	mux.HandleFunc("GET /api/games/{slug}", gameHandler.Get)
	mux.HandleFunc("GET /api/payment-methods", player(depositHandler.Methods))
	mux.HandleFunc("GET /api/deposits", player(depositHandler.List))
	mux.HandleFunc("GET /api/deposits/{id}", player(depositHandler.Get))
	mux.HandleFunc("POST /api/deposits", player(depositHandler.Create))
	mux.HandleFunc("GET /api/wallets", player(walletHandler.List))
	mux.HandleFunc("GET /api/wallets/{currency}", player(walletHandler.Get))
	mux.HandleFunc("GET /api/wallets/{currency}/transactions", player(walletHandler.Transactions))
	mux.HandleFunc("GET /api/transactions", player(walletHandler.Transactions))
	mux.HandleFunc("GET /api/admin/users", admin(authHandler.AdminUsers))
	mux.HandleFunc("GET /api/admin/users/{id}", admin(authHandler.AdminUser))
	mux.HandleFunc("PATCH /api/admin/users/{id}/status", admin(authHandler.AdminUserStatus))
	mux.HandleFunc("GET /api/admin/users/{id}/wallets", admin(walletHandler.AdminUserWallets))
	mux.HandleFunc("POST /api/admin/users/{id}/wallet-adjustments", admin(walletHandler.AdminAdjust))
	mux.HandleFunc("GET /api/admin/transactions", admin(walletHandler.AdminTransactions))
	mux.HandleFunc("GET /api/admin/deposits", admin(depositHandler.AdminList))
	mux.HandleFunc("GET /api/admin/deposits/{id}/proof", admin(depositHandler.AdminProof))
	mux.HandleFunc("POST /api/admin/deposits/{id}/review", admin(depositHandler.AdminReview))
	mux.HandleFunc("GET /api/admin/games", admin(gameHandler.AdminList))
	mux.HandleFunc("POST /api/admin/games", admin(gameHandler.AdminCreate))
	mux.HandleFunc("GET /api/admin/games/{id}", admin(gameHandler.AdminGet))
	mux.HandleFunc("PATCH /api/admin/games/{id}", admin(gameHandler.AdminUpdate))
	mux.HandleFunc("GET /api/admin/games/{id}/rtp-profiles", admin(rtpHandler.AdminListForGame))
	mux.HandleFunc("POST /api/admin/games/{id}/rtp-profiles", admin(rtpHandler.AdminCreate))
	mux.HandleFunc("GET /api/admin/rtp-profiles", admin(rtpHandler.AdminList))
	mux.HandleFunc("PATCH /api/admin/rtp-profiles/{id}", admin(rtpHandler.AdminUpdate))
	mux.HandleFunc("POST /api/admin/rtp-profiles/{id}/activate", admin(rtpHandler.AdminActivate))
	mux.HandleFunc("GET /api/admin/audit-logs", admin(withoutAccount(auditHandler.List)))
	mux.HandleFunc("GET /api/admin/dashboard", admin(dashboardHandler.Get))
	mux.HandleFunc("/", notFound)

	return logAndRecover(logger, browserRules(cfg.AllowedOrigins, limitBody(cfg.MaxBodyBytes, mux)))
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotFound, "No resource matches that path")
}

// The audit package writes entries for the user package, so it cannot import
// user.User back without a cycle. Its read handler never looks at the account, so
// it takes the plain shape and is guarded here.
func withoutAccount(next http.HandlerFunc) auth.Guarded {
	return func(w http.ResponseWriter, r *http.Request, _ user.User) {
		next(w, r)
	}
}
