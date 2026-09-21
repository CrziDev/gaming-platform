package round

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/engine"
	"github.com/gaming-platform/backend/internal/game"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/money"
	"github.com/gaming-platform/backend/internal/user"
	"github.com/gaming-platform/backend/internal/wallet"
)

var readStatuses = map[string]bool{
	StatusOpen: true, StatusSettled: true, StatusCancelled: true, StatusFailed: true,
}

type Handler struct {
	db                         *sql.DB
	logger                     *slog.Logger
	engines                    Engines
	bigWinMultiplierHundredths int
}

type playRequest struct {
	StakeMinor int64           `json:"stake_minor"`
	Currency   string          `json:"currency"`
	Params     json.RawMessage `json:"params"`
}

type playResponse struct {
	Round  response        `json:"round"`
	Result json.RawMessage `json:"result"`
	Wallet walletResponse  `json:"wallet"`
}

type walletResponse struct {
	Currency     string `json:"currency"`
	BalanceMinor int64  `json:"balance_minor"`
}

type response struct {
	ID                   string  `json:"id"`
	GameID               string  `json:"game_id"`
	GameSlug             string  `json:"game_slug"`
	GameName             string  `json:"game_name"`
	RTPBasisPoints       int     `json:"rtp_basis_points"`
	Status               string  `json:"status"`
	StakeMinor           int64   `json:"stake_minor"`
	WinMinor             *int64  `json:"win_minor"`
	MultiplierHundredths *int    `json:"multiplier_hundredths"`
	Currency             string  `json:"currency"`
	StartedAt            string  `json:"started_at"`
	SettledAt            *string `json:"settled_at"`
}

type adminResponse struct {
	response
	UserID      string `json:"user_id"`
	UserEmail   string `json:"user_email"`
	DisplayName string `json:"display_name"`
	WalletID    string `json:"wallet_id"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, engines Engines, bigWinMultiplierHundredths int) *Handler {
	return &Handler{db: db, logger: logger, engines: engines, bigWinMultiplierHundredths: bigWinMultiplierHundredths}
}

const maxIdempotencyKeyLength = 200

// playable answers 404 for a slug that is not an active game with an engine,
// which is the client's signal that the title cannot be played on this server.
func (h *Handler) playable(w http.ResponseWriter, r *http.Request) (game.Game, Engine, bool) {
	slug := r.PathValue("slug")
	eng, ok := h.engines[slug]
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return game.Game{}, nil, false
	}
	item, err := game.FindActiveBySlug(r.Context(), h.db, slug)
	if errors.Is(err, game.ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return game.Game{}, nil, false
	}
	if err != nil {
		h.internal(w, r, err)
		return game.Game{}, nil, false
	}
	return item, eng, true
}

func (h *Handler) Play(w http.ResponseWriter, r *http.Request, account user.User) {
	item, eng, ok := h.playable(w, r)
	if !ok {
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if key == "" || utf8.RuneCountInString(key) > maxIdempotencyKeyLength {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"idempotency_key": "A valid Idempotency-Key header is required"})
		return
	}
	var body playRequest
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	fields := map[string]string{}
	if body.StakeMinor <= 0 || !money.IsSafeMinor(body.StakeMinor) {
		fields["stake_minor"] = "Stake must be a positive amount in minor units"
	}
	body.Currency = strings.ToUpper(strings.TrimSpace(body.Currency))
	if len(body.Currency) != 3 {
		fields["currency"] = "Currency must be a three-letter code"
	}
	if len(body.Params) > 0 && !json.Valid(body.Params) {
		fields["params"] = "Parameters must be a JSON object"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	in := PlayInput{
		IdempotencyKey: key, UserID: account.ID, GameID: item.ID, Currency: body.Currency, StakeMinor: body.StakeMinor, Params: body.Params,
		BigWinMultiplierHundredths: h.bigWinMultiplierHundredths,
	}
	result, err := Play(r.Context(), h.db, eng, in)
	if errors.Is(err, wallet.ErrNotFound) {
		// A wallet is provisioned on first sight of its currency; a player who has
		// never opened the wallet page has none yet. When none can be provisioned,
		// that failure is the one to answer.
		if _, err = wallet.Get(r.Context(), h.db, account.ID, body.Currency); err == nil {
			result, err = Play(r.Context(), h.db, eng, in)
		}
	}
	if err != nil {
		h.writePlayError(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, playResponse{
		Round:  newResponse(result.Round),
		Result: result.Result,
		Wallet: walletResponse{Currency: result.Wallet.Currency, BalanceMinor: result.Wallet.BalanceMinor},
	})
}

func (h *Handler) writePlayError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, ErrRoundKeyRequired):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"idempotency_key": "A valid Idempotency-Key header is required"})
	case errors.Is(err, ErrRoundKeyConflict):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"idempotency_key": "This key was already used for a different request"})
	case errors.Is(err, ErrInvalidWager):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"stake_minor": "Stake must be within the game's limits and on its step"})
	case errors.Is(err, engine.ErrInvalidParams):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"params": "Parameters are not valid for this game"})
	case errors.Is(err, ErrUnsupportedCurrency), errors.Is(err, wallet.ErrCurrencyDisabled):
		httpx.WriteCodedError(w, http.StatusConflict, "The game does not play in that currency", "UNSUPPORTED_CURRENCY")
	case errors.Is(err, ErrGameUnavailable), errors.Is(err, ErrProfileUnavailable):
		httpx.WriteCodedError(w, http.StatusConflict, "That game is not available right now", "GAME_UNAVAILABLE")
	case errors.Is(err, wallet.ErrInsufficientFunds):
		httpx.WriteCodedError(w, http.StatusConflict, "Your balance is too low for that bet", "INSUFFICIENT_BALANCE")
	case errors.Is(err, wallet.ErrWalletFrozen):
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet is frozen", "WALLET_FROZEN")
	case errors.Is(err, wallet.ErrWalletClosed):
		httpx.WriteCodedError(w, http.StatusConflict, "The wallet is closed", "WALLET_CLOSED")
	case errors.Is(err, wallet.ErrAmountOverflow), errors.Is(err, engine.ErrPayoutOverflow):
		httpx.WriteCodedError(w, http.StatusConflict, "That win cannot be credited safely", "AMOUNT_OVERFLOW")
	default:
		h.logger.Error("round play failed", slog.String("path", r.URL.Path), slog.Any("error", err))
		httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
	}
}

func (h *Handler) Manifest(w http.ResponseWriter, r *http.Request) {
	item, eng, ok := h.playable(w, r)
	if !ok {
		return
	}
	option, ok := optionFor(eng.Options(), item.RTPBasisPoints)
	if !ok {
		httpx.WriteCodedError(w, http.StatusConflict, "That game is not available right now", "GAME_UNAVAILABLE")
		return
	}
	manifest, err := eng.Manifest(option.Ref)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	body, err := withBasisPoints(manifest, option.BasisPoints)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, body)
}

// withBasisPoints names the return a manifest describes, so a client can tell
// from a settled round's rtp_basis_points that the table it holds is no longer
// the one rounds settle on.
func withBasisPoints(manifest json.RawMessage, basisPoints int) (map[string]json.RawMessage, error) {
	var body map[string]json.RawMessage
	if err := json.Unmarshal(manifest, &body); err != nil {
		return nil, fmt.Errorf("round: decode manifest: %w", err)
	}
	body["rtp_basis_points"] = json.RawMessage(strconv.Itoa(basisPoints))
	return body, nil
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request, account user.User) {
	filter, ok := readFilter(w, r, false)
	if !ok {
		return
	}
	filter.UserID = account.ID
	items, total, err := List(r.Context(), h.db, filter)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]response, 0, len(items))
	for _, item := range items {
		result = append(result, newResponse(item))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, filter.Page, filter.Size))
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request, account user.User) {
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Round not found")
		return
	}
	item, err := GetForPlayer(r.Context(), h.db, account.ID, r.PathValue("id"))
	if errors.Is(err, ErrNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Round not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponse(item))
}

func (h *Handler) AdminList(w http.ResponseWriter, r *http.Request, _ user.User) {
	filter, ok := readFilter(w, r, true)
	if !ok {
		return
	}
	items, total, err := List(r.Context(), h.db, filter)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]adminResponse, 0, len(items))
	for _, item := range items {
		result = append(result, adminResponse{
			response: newResponse(item), UserID: item.UserID, UserEmail: item.UserEmail,
			DisplayName: item.UserDisplayName, WalletID: item.WalletID,
		})
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, filter.Page, filter.Size))
}

func readFilter(w http.ResponseWriter, r *http.Request, admin bool) (ReadFilter, bool) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return ReadFilter{}, false
	}
	fields := map[string]string{}
	if query.Status == "all" {
		query.Status = ""
	}
	if query.Status != "" && !readStatuses[query.Status] {
		fields["status"] = "Status must be open, settled, cancelled, or failed"
	}
	if query.Currency != "" && len(query.Currency) != 3 {
		fields["currency"] = "Currency must be a three-letter code"
	}
	if query.GameID != "" && !httpx.IsUUID(query.GameID) {
		fields["game_id"] = "Game ID must be a valid UUID"
	}
	if admin && query.UserID != "" && !httpx.IsUUID(query.UserID) {
		fields["user_id"] = "User ID must be a valid UUID"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", fields)
		return ReadFilter{}, false
	}
	return ReadFilter{
		Page: query.Page, Size: query.Size, UserID: query.UserID, GameID: query.GameID,
		Status: query.Status, Currency: query.Currency, From: query.From, To: query.To, Search: query.Search,
	}, true
}

func newResponse(item Record) response {
	var settledAt *string
	if item.SettledAt != nil {
		formatted := item.SettledAt.UTC().Format(time.RFC3339)
		settledAt = &formatted
	}
	return response{
		ID: item.ID, GameID: item.GameID, GameSlug: item.GameSlug, GameName: item.GameName,
		RTPBasisPoints: item.RTPBasisPoints, Status: item.Status, StakeMinor: item.StakeMinor,
		WinMinor: item.WinMinor, MultiplierHundredths: item.MultiplierHundredths,
		Currency: item.Currency, StartedAt: item.StartedAt.UTC().Format(time.RFC3339), SettledAt: settledAt,
	}
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("round read failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
