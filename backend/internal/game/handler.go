package game

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

const (
	maxSlugLength        = 64
	maxNameLength        = 120
	maxProviderLength    = 80
	maxDescriptionLength = 1000
)

type CurrentUser func(http.ResponseWriter, *http.Request) (user.User, bool)

type Handler struct {
	db          *sql.DB
	logger      *slog.Logger
	currentUser CurrentUser
	now         func() time.Time
}

type response struct {
	ID             string   `json:"id"`
	Slug           string   `json:"slug"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	CategorySlug   string   `json:"category_slug"`
	CategoryName   string   `json:"category_name"`
	Provider       string   `json:"provider"`
	Status         string   `json:"status"`
	Currency       string   `json:"currency"`
	MinWagerMinor  int64    `json:"min_wager_minor"`
	MaxWagerMinor  int64    `json:"max_wager_minor"`
	WagerStepMinor int64    `json:"wager_step_minor"`
	ThumbnailURL   *string  `json:"thumbnail_url"`
	Flags          []string `json:"flags"`
	CreatedAt      string   `json:"created_at"`
}

type adminResponse struct {
	response
	Integration          string `json:"integration"`
	ActiveRTPBasisPoints *int   `json:"active_rtp_basis_points"`
	Rounds30d            int    `json:"rounds_30d"`
	UpdatedAt            string `json:"updated_at"`
}

type categoryResponse struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	GameCount int    `json:"game_count"`
	Available bool   `json:"available"`
}

type createBody struct {
	Slug           string `json:"slug"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	CategorySlug   string `json:"category_slug"`
	Provider       string `json:"provider"`
	Status         string `json:"status"`
	Currency       string `json:"currency"`
	MinWagerMinor  int64  `json:"min_wager_minor"`
	MaxWagerMinor  int64  `json:"max_wager_minor"`
	WagerStepMinor int64  `json:"wager_step_minor"`
}

type patchBody struct {
	Name           *string `json:"name"`
	Description    *string `json:"description"`
	CategorySlug   *string `json:"category_slug"`
	Provider       *string `json:"provider"`
	Status         *string `json:"status"`
	Currency       *string `json:"currency"`
	MinWagerMinor  *int64  `json:"min_wager_minor"`
	MaxWagerMinor  *int64  `json:"max_wager_minor"`
	WagerStepMinor *int64  `json:"wager_step_minor"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, currentUser CurrentUser) *Handler {
	return &Handler{db: db, logger: logger, currentUser: currentUser, now: time.Now}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	fields := map[string]string{}
	if query.Category != "" && !isSlug(query.Category) {
		fields["category"] = "Category must be a slug of lower-case letters, digits, and hyphens"
	}
	if query.Sort != "" && query.Sort != SortName && query.Sort != SortNewest {
		fields["sort"] = "Sort must be name or newest"
	}
	if query.Flag != "" && query.Flag != FlagNew {
		fields["flag"] = "Flag must be new"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", fields)
		return
	}

	now := h.now()
	filter := CatalogueFilter{Page: query.Page, Size: query.Size, Search: query.Search, Category: query.Category, Sort: query.Sort}
	if query.Flag == FlagNew {
		since := NewSince(now)
		filter.NewSince = &since
	}
	games, total, err := ListCatalogue(r.Context(), h.db, filter)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]response, 0, len(games))
	for _, item := range games {
		result = append(result, newResponse(item, now))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	slug := r.PathValue("slug")
	if !isSlug(slug) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	item, err := FindActiveBySlug(r.Context(), h.db, slug)
	if errors.Is(err, ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponse(item, h.now()))
}

func (h *Handler) Categories(w http.ResponseWriter, r *http.Request) {
	categories, err := ListCategories(r.Context(), h.db)
	if err != nil {
		h.internal(w, r, err)
		return
	}
	result := make([]categoryResponse, 0, len(categories))
	for _, item := range categories {
		result = append(result, categoryResponse{Slug: item.Slug, Name: item.Name, GameCount: item.GameCount, Available: item.GameCount > 0})
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) AdminList(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r); !ok {
		return
	}
	query, ok := httpx.ReadQuery(w, r)
	if !ok {
		return
	}
	fields := map[string]string{}
	if query.Category != "" && !isSlug(query.Category) {
		fields["category"] = "Category must be a slug of lower-case letters, digits, and hyphens"
	}
	if query.Status != "" && !Statuses[query.Status] {
		fields["status"] = "Status must be draft, active, maintenance, or retired"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", fields)
		return
	}

	games, total, err := ListAdmin(r.Context(), h.db, AdminFilter{Page: query.Page, Size: query.Size, Search: query.Search, Category: query.Category, Status: query.Status})
	if err != nil {
		h.internal(w, r, err)
		return
	}
	now := h.now()
	result := make([]adminResponse, 0, len(games))
	for _, item := range games {
		result = append(result, newAdminResponse(item, now))
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(result, total, query.Page, query.Size))
}

func (h *Handler) AdminGet(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r); !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	item, err := FindByID(r.Context(), h.db, r.PathValue("id"))
	if errors.Is(err, ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminResponse(item, h.now()))
}

func (h *Handler) AdminCreate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.admin(w, r)
	if !ok {
		return
	}
	var body createBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	in := Input{
		Slug: strings.TrimSpace(body.Slug), Name: strings.TrimSpace(body.Name), Description: strings.TrimSpace(body.Description),
		CategorySlug: strings.TrimSpace(body.CategorySlug), Provider: strings.TrimSpace(body.Provider),
		Status: strings.ToLower(strings.TrimSpace(body.Status)), Currency: strings.ToUpper(strings.TrimSpace(body.Currency)),
		MinWagerMinor: body.MinWagerMinor, MaxWagerMinor: body.MaxWagerMinor, WagerStepMinor: body.WagerStepMinor,
	}
	fields := map[string]string{}
	if !isSlug(in.Slug) {
		fields["slug"] = "Slug must be lower-case letters, digits, and hyphens, at most 64 characters"
	}
	if in.Status != "" && !Statuses[in.Status] {
		fields["status"] = "Status must be draft, active, maintenance, or retired"
	}
	validateText(fields, in.Name, in.Description, in.CategorySlug, in.Provider, in.Currency)
	validateWagers(fields, in.MinWagerMinor, in.MaxWagerMinor, in.WagerStepMinor)
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	created, err := Create(r.Context(), h.db, actor.ID, in)
	if errors.Is(err, ErrSlugTaken) {
		httpx.WriteJSON(w, http.StatusConflict, httpx.ErrorResponse{Error: "That slug is already taken", Fields: map[string]string{"slug": "Already taken"}})
		return
	}
	if h.writeRuleError(w, err) {
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, newAdminResponse(created, h.now()))
}

func (h *Handler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.admin(w, r)
	if !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	var body patchBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	patch := Patch{MinWagerMinor: body.MinWagerMinor, MaxWagerMinor: body.MaxWagerMinor, WagerStepMinor: body.WagerStepMinor}
	fields := map[string]string{}
	if body.Name != nil {
		patch.Name = trimmed(*body.Name)
		if *patch.Name == "" || len(*patch.Name) > maxNameLength {
			fields["name"] = "Name must be between 1 and 120 characters"
		}
	}
	if body.Description != nil {
		patch.Description = trimmed(*body.Description)
		if len(*patch.Description) > maxDescriptionLength {
			fields["description"] = "Description must be at most 1000 characters"
		}
	}
	if body.CategorySlug != nil {
		patch.CategorySlug = trimmed(*body.CategorySlug)
		if !isSlug(*patch.CategorySlug) {
			fields["category_slug"] = "Category must be a slug of lower-case letters, digits, and hyphens"
		}
	}
	if body.Provider != nil {
		patch.Provider = trimmed(*body.Provider)
		if *patch.Provider == "" || len(*patch.Provider) > maxProviderLength {
			fields["provider"] = "Provider must be between 1 and 80 characters"
		}
	}
	if body.Status != nil {
		status := strings.ToLower(strings.TrimSpace(*body.Status))
		patch.Status = &status
		if !Statuses[status] {
			fields["status"] = "Status must be draft, active, maintenance, or retired"
		}
	}
	if body.Currency != nil {
		currency := strings.ToUpper(strings.TrimSpace(*body.Currency))
		patch.Currency = &currency
		if len(currency) != 3 {
			fields["currency"] = "Currency must be a three-letter code"
		}
	}
	for name, value := range map[string]*int64{"min_wager_minor": patch.MinWagerMinor, "max_wager_minor": patch.MaxWagerMinor, "wager_step_minor": patch.WagerStepMinor} {
		if value != nil && *value <= 0 {
			fields[name] = "Must be greater than zero"
		}
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	updated, err := Update(r.Context(), h.db, actor.ID, r.PathValue("id"), patch)
	if errors.Is(err, ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	if h.writeRuleError(w, err) {
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newAdminResponse(updated, h.now()))
}

func (h *Handler) writeRuleError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, ErrNoCategory):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"category_slug": "Unknown category"})
	case errors.Is(err, ErrCurrencyUnavailable):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"currency": "Currency is not enabled"})
	case errors.Is(err, ErrCurrencyLocked):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"currency": "Currency cannot change once rounds have been played"})
	case errors.Is(err, ErrWagerBounds):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"max_wager_minor": "Maximum must be the minimum plus a whole number of steps"})
	case errors.Is(err, ErrWagerNotWholeUnits):
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"wager_step_minor": "Wager bounds must be whole units of the currency"})
	default:
		return false
	}
	return true
}

func (h *Handler) admin(w http.ResponseWriter, r *http.Request) (user.User, bool) {
	account, ok := h.currentUser(w, r)
	if !ok {
		return user.User{}, false
	}
	if account.Role != "admin" {
		httpx.WriteError(w, http.StatusForbidden, "Administrator access is required")
		return user.User{}, false
	}
	return account, true
}

func validateText(fields map[string]string, name, description, categorySlug, provider, currency string) {
	if name == "" || len(name) > maxNameLength {
		fields["name"] = "Name must be between 1 and 120 characters"
	}
	if len(description) > maxDescriptionLength {
		fields["description"] = "Description must be at most 1000 characters"
	}
	if !isSlug(categorySlug) {
		fields["category_slug"] = "Category must be a slug of lower-case letters, digits, and hyphens"
	}
	if provider == "" || len(provider) > maxProviderLength {
		fields["provider"] = "Provider must be between 1 and 80 characters"
	}
	if len(currency) != 3 {
		fields["currency"] = "Currency must be a three-letter code"
	}
}

func validateWagers(fields map[string]string, minimum, maximum, step int64) {
	if minimum <= 0 {
		fields["min_wager_minor"] = "Must be greater than zero"
	}
	if maximum <= 0 {
		fields["max_wager_minor"] = "Must be greater than zero"
	}
	if step <= 0 {
		fields["wager_step_minor"] = "Must be greater than zero"
	}
}

func trimmed(value string) *string {
	value = strings.TrimSpace(value)
	return &value
}

func newResponse(item Game, now time.Time) response {
	var thumbnail *string
	if item.ThumbnailPath != "" {
		thumbnail = &item.ThumbnailPath
	}
	return response{
		ID: item.ID, Slug: item.Slug, Name: item.Name, Description: item.Description,
		CategorySlug: item.CategorySlug, CategoryName: item.CategoryName, Provider: item.Provider,
		Status: item.Status, Currency: item.Currency,
		MinWagerMinor: item.MinWagerMinor, MaxWagerMinor: item.MaxWagerMinor, WagerStepMinor: item.WagerStepMinor,
		ThumbnailURL: thumbnail, Flags: item.Flags(now),
		CreatedAt: item.CreatedAt.UTC().Format(time.RFC3339),
	}
}

func newAdminResponse(item AdminGame, now time.Time) adminResponse {
	return adminResponse{
		response:             newResponse(item.Game, now),
		Integration:          item.Integration,
		ActiveRTPBasisPoints: item.ActiveRTPBasisPoints,
		Rounds30d:            item.Rounds30d,
		UpdatedAt:            item.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func isSlug(value string) bool {
	return len(value) <= maxSlugLength && slugPattern.MatchString(value)
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("game request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
