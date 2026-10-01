package app

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"time"

	"github.com/gaming-platform/backend/internal/announcement"
	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/auth"
	"github.com/gaming-platform/backend/internal/chat"
	"github.com/gaming-platform/backend/internal/currency"
	"github.com/gaming-platform/backend/internal/dashboard"
	"github.com/gaming-platform/backend/internal/deposit"
	"github.com/gaming-platform/backend/internal/engine/plinko"
	"github.com/gaming-platform/backend/internal/game"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/notification"
	"github.com/gaming-platform/backend/internal/round"
	"github.com/gaming-platform/backend/internal/user"
	"github.com/gaming-platform/backend/internal/wallet"
)

func New(db *sql.DB, logger *slog.Logger, cfg Config, hub *chat.Hub, resetSenders ...auth.PasswordResetSender) http.Handler {
	var resetSender auth.PasswordResetSender
	if len(resetSenders) > 0 {
		resetSender = resetSenders[0]
	} else if cfg.EmailDeliveryProvider == "resend" {
		resetSender = auth.NewResendSender(auth.ResendConfig{
			APIKey: cfg.ResendAPIKey, From: cfg.ResendFrom, PublicWebURL: cfg.PublicWebURL,
		})
	}
	authHandler := auth.NewHandler(db, logger, auth.Config{
		CookieName:          cfg.CookieName,
		CookieSecure:        cfg.CookieSecure,
		SessionTTL:          cfg.SessionTTL,
		LoginsPerMinute:     cfg.LoginsPerMinute,
		PasswordResetSender: resetSender,
	})
	currencyHandler := currency.NewHandler(db, logger)
	engines := round.Engines{"plinko": plinko.New(), "plinko-billiards": plinko.New()}
	gameHandler := game.NewHandler(db, logger, engines)
	walletHandler := wallet.NewHandler(db, logger)
	depositHandler := deposit.NewHandler(db, logger, cfg.ProofDir)
	dashboardHandler := dashboard.NewHandler(db, logger)
	auditHandler := audit.NewHandler(db, logger)
	roundHandler := round.NewHandler(db, logger, engines, cfg.BigWinMultiplierHundredths)
	notificationHandler := notification.NewHandler(db, logger)
	announcementHandler := announcement.NewHandler(db, logger)
	chatHandler := chat.NewHandler(db, logger, hub, chat.Config{MessagesPerMinute: cfg.ChatMessagesPerMinute, AllowedOrigins: cfg.AllowedOrigins})
	player, admin := authHandler.Player, authHandler.Admin

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", health(db))
	mux.HandleFunc("POST /api/register", authHandler.Register)
	mux.HandleFunc("POST /api/login", authHandler.Login)
	mux.HandleFunc("POST /api/logout", authHandler.Logout)
	mux.HandleFunc("POST /api/password-reset", authHandler.RequestPasswordReset)
	mux.HandleFunc("POST /api/password-reset/confirm", authHandler.ConfirmPasswordReset)
	mux.HandleFunc("GET /api/me", player(authHandler.Me))
	mux.HandleFunc("POST /api/password", player(authHandler.ChangePassword))
	mux.HandleFunc("GET /api/currencies", currencyHandler.List)
	mux.HandleFunc("GET /api/categories", gameHandler.Categories)
	mux.HandleFunc("GET /api/announcements", announcementHandler.List)
	mux.HandleFunc("GET /api/games", gameHandler.List)
	mux.HandleFunc("GET /api/games/{slug}", gameHandler.Get)
	mux.HandleFunc("GET /api/recent-games", player(gameHandler.RecentlyPlayed))
	mux.HandleFunc("GET /api/favorites", player(gameHandler.Favorites))
	mux.HandleFunc("PUT /api/games/{slug}/favorite", player(gameHandler.AddFavorite))
	mux.HandleFunc("DELETE /api/games/{slug}/favorite", player(gameHandler.RemoveFavorite))
	mux.HandleFunc("GET /api/games/{slug}/manifest", roundHandler.Manifest)
	mux.HandleFunc("POST /api/games/{slug}/rounds", player(roundHandler.Play))
	mux.HandleFunc("GET /api/payment-methods", player(depositHandler.Methods))
	mux.HandleFunc("GET /api/deposits", player(depositHandler.List))
	mux.HandleFunc("GET /api/deposits/{id}", player(depositHandler.Get))
	mux.HandleFunc("POST /api/deposits", player(depositHandler.Create))
	mux.HandleFunc("GET /api/wallets", player(walletHandler.List))
	mux.HandleFunc("GET /api/wallets/{currency}", player(walletHandler.Get))
	mux.HandleFunc("GET /api/wallets/{currency}/transactions", player(walletHandler.Transactions))
	mux.HandleFunc("GET /api/transactions", player(walletHandler.Transactions))
	mux.HandleFunc("GET /api/transactions/summary", player(walletHandler.Summary))
	mux.HandleFunc("GET /api/chat/messages", chatHandler.Messages)
	mux.HandleFunc("POST /api/chat/messages", player(chatHandler.Post))
	mux.HandleFunc("GET /api/chat/socket", chatHandler.Socket)
	mux.HandleFunc("GET /api/rounds", player(roundHandler.List))
	mux.HandleFunc("GET /api/notifications", player(notificationHandler.List))
	mux.HandleFunc("POST /api/notifications/read", player(notificationHandler.MarkRead))
	mux.HandleFunc("GET /api/rounds/{id}", player(roundHandler.Get))
	mux.HandleFunc("GET /api/admin/users", admin(authHandler.AdminUsers))
	mux.HandleFunc("GET /api/admin/users/{id}", admin(authHandler.AdminUser))
	mux.HandleFunc("PATCH /api/admin/users/{id}/status", admin(authHandler.AdminUserStatus))
	mux.HandleFunc("GET /api/admin/users/{id}/wallets", admin(walletHandler.AdminUserWallets))
	mux.HandleFunc("POST /api/admin/users/{id}/wallet-adjustments", admin(walletHandler.AdminAdjust))
	mux.HandleFunc("GET /api/admin/transactions", admin(walletHandler.AdminTransactions))
	mux.HandleFunc("GET /api/admin/rounds", admin(roundHandler.AdminList))
	mux.HandleFunc("GET /api/admin/deposits", admin(depositHandler.AdminList))
	mux.HandleFunc("GET /api/admin/payment-methods", admin(depositHandler.AdminMethods))
	mux.HandleFunc("POST /api/admin/payment-methods", admin(depositHandler.AdminCreateMethod))
	mux.HandleFunc("PATCH /api/admin/payment-methods/{id}", admin(depositHandler.AdminUpdateMethod))
	mux.HandleFunc("GET /api/admin/deposits/{id}/proof", admin(depositHandler.AdminProof))
	mux.HandleFunc("POST /api/admin/deposits/{id}/review", admin(depositHandler.AdminReview))
	mux.HandleFunc("GET /api/admin/games", admin(gameHandler.AdminList))
	mux.HandleFunc("POST /api/admin/games", admin(gameHandler.AdminCreate))
	mux.HandleFunc("GET /api/admin/games/{id}", admin(gameHandler.AdminGet))
	mux.HandleFunc("PATCH /api/admin/games/{id}", admin(gameHandler.AdminUpdate))
	mux.HandleFunc("PUT /api/admin/games/{id}/rtp", admin(gameHandler.AdminSetRTP))
	mux.HandleFunc("GET /api/admin/games/{id}/rtp-configuration", admin(gameHandler.AdminRTPConfiguration))
	mux.HandleFunc("GET /api/admin/audit-logs", admin(withoutAccount(auditHandler.List)))
	mux.HandleFunc("GET /api/admin/dashboard", admin(dashboardHandler.Get))
	mux.HandleFunc("GET /api/admin/announcements", admin(announcementHandler.AdminList))
	mux.HandleFunc("POST /api/admin/announcements", admin(announcementHandler.Create))
	mux.HandleFunc("PUT /api/admin/announcements/{id}", admin(announcementHandler.Update))
	mux.HandleFunc("PATCH /api/admin/announcements/{id}/status", admin(announcementHandler.SetStatus))
	mux.HandleFunc("/", notFound)

	return logAndRecover(logger, browserRules(cfg.AllowedOrigins, limitBody(cfg.MaxBodyBytes, forwardedClientIP(cfg.TrustProxyHeaders, mux))))
}

func health(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if db == nil {
			httpx.WriteError(w, http.StatusServiceUnavailable, "Database is unavailable")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			httpx.WriteError(w, http.StatusServiceUnavailable, "Database is unavailable")
			return
		}
		httpx.WriteJSON(w, http.StatusOK, struct {
			Status string `json:"status"`
		}{Status: "ok"})
	}
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
