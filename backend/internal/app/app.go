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
	gameHandler := game.NewHandler(db, logger, authHandler.CurrentUser)
	rtpHandler := rtp.NewHandler(db, logger, authHandler.CurrentUser)
	walletHandler := wallet.NewHandler(db, logger, authHandler.CurrentUser)
	depositHandler := deposit.NewHandler(db, logger, authHandler.CurrentUser, cfg.ProofDir)
	dashboardHandler := dashboard.NewHandler(db, logger, authHandler.CurrentUser)
	auditHandler := audit.NewHandler(db, logger, actorOf(authHandler.CurrentUser))

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/register", authHandler.Register)
	mux.HandleFunc("POST /api/login", authHandler.Login)
	mux.HandleFunc("POST /api/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/me", authHandler.Me)
	mux.HandleFunc("GET /api/currencies", currencyHandler.List)
	mux.HandleFunc("GET /api/categories", gameHandler.Categories)
	mux.HandleFunc("GET /api/games", gameHandler.List)
	mux.HandleFunc("GET /api/games/{slug}", gameHandler.Get)
	mux.HandleFunc("GET /api/payment-methods", depositHandler.Methods)
	mux.HandleFunc("GET /api/deposits", depositHandler.List)
	mux.HandleFunc("GET /api/deposits/{id}", depositHandler.Get)
	mux.HandleFunc("POST /api/deposits", depositHandler.Create)
	mux.HandleFunc("GET /api/admin/deposits", depositHandler.AdminList)
	mux.HandleFunc("GET /api/admin/deposits/{id}/proof", depositHandler.AdminProof)
	mux.HandleFunc("POST /api/admin/deposits/{id}/review", depositHandler.AdminReview)
	mux.HandleFunc("GET /api/admin/dashboard", dashboardHandler.Get)
	mux.HandleFunc("GET /api/wallets", walletHandler.List)
	mux.HandleFunc("GET /api/wallets/{currency}", walletHandler.Get)
	mux.HandleFunc("GET /api/wallets/{currency}/transactions", walletHandler.Transactions)
	mux.HandleFunc("GET /api/transactions", walletHandler.Transactions)
	mux.HandleFunc("GET /api/admin/users", authHandler.AdminUsers)
	mux.HandleFunc("GET /api/admin/users/{id}", authHandler.AdminUser)
	mux.HandleFunc("PATCH /api/admin/users/{id}/status", authHandler.AdminUserStatus)
	mux.HandleFunc("GET /api/admin/users/{id}/wallets", walletHandler.AdminUserWallets)
	mux.HandleFunc("GET /api/admin/transactions", walletHandler.AdminTransactions)
	mux.HandleFunc("POST /api/admin/users/{id}/wallet-adjustments", walletHandler.AdminAdjust)
	mux.HandleFunc("GET /api/admin/games", gameHandler.AdminList)
	mux.HandleFunc("POST /api/admin/games", gameHandler.AdminCreate)
	mux.HandleFunc("GET /api/admin/games/{id}", gameHandler.AdminGet)
	mux.HandleFunc("PATCH /api/admin/games/{id}", gameHandler.AdminUpdate)
	mux.HandleFunc("GET /api/admin/games/{id}/rtp-profiles", rtpHandler.AdminListForGame)
	mux.HandleFunc("POST /api/admin/games/{id}/rtp-profiles", rtpHandler.AdminCreate)
	mux.HandleFunc("GET /api/admin/rtp-profiles", rtpHandler.AdminList)
	mux.HandleFunc("PATCH /api/admin/rtp-profiles/{id}", rtpHandler.AdminUpdate)
	mux.HandleFunc("POST /api/admin/rtp-profiles/{id}/activate", rtpHandler.AdminActivate)
	mux.HandleFunc("GET /api/admin/audit-logs", auditHandler.List)
	mux.HandleFunc("/", notFound)

	return logAndRecover(logger, browserRules(cfg.AllowedOrigins, limitBody(cfg.MaxBodyBytes, mux)))
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteError(w, http.StatusNotFound, "No resource matches that path")
}

// The audit package writes entries for the user package, so it cannot import
// user.User back without a cycle; it asks for the two fields it reads instead.
func actorOf(currentUser func(http.ResponseWriter, *http.Request) (user.User, bool)) audit.CurrentActor {
	return func(w http.ResponseWriter, r *http.Request) (audit.Actor, bool) {
		account, ok := currentUser(w, r)
		return audit.Actor{ID: account.ID, Role: account.Role}, ok
	}
}
