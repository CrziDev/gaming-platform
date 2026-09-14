package rtp

import (
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gaming-platform/backend/internal/game"
	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

const (
	maxNameLength      = 80
	maxConfigRefLength = 200
)

type CurrentUser func(http.ResponseWriter, *http.Request) (user.User, bool)

type Handler struct {
	db          *sql.DB
	logger      *slog.Logger
	currentUser CurrentUser
}

type response struct {
	ID                     string  `json:"id"`
	GameID                 string  `json:"game_id"`
	GameSlug               string  `json:"game_slug"`
	GameName               string  `json:"game_name"`
	Name                   string  `json:"name"`
	Version                int     `json:"version"`
	TargetBasisPoints      int     `json:"target_basis_points"`
	Status                 string  `json:"status"`
	EngineConfigRef        string  `json:"engine_config_ref"`
	TheoreticalBasisPoints *int    `json:"theoretical_basis_points"`
	ObservedBasisPoints    *int    `json:"observed_basis_points"`
	VerifiedAt             *string `json:"verified_at"`
	EffectiveFrom          *string `json:"effective_from"`
	EffectiveUntil         *string `json:"effective_until"`
	CreatedBy              string  `json:"created_by"`
	CreatedByDisplayName   string  `json:"created_by_display_name"`
	CreatedAt              string  `json:"created_at"`
	UpdatedAt              string  `json:"updated_at"`
}

type draftBody struct {
	Name              string `json:"name"`
	Version           int    `json:"version"`
	TargetBasisPoints int    `json:"target_basis_points"`
	EngineConfigRef   string `json:"engine_config_ref"`
}

type draftPatchBody struct {
	Name              *string `json:"name"`
	Version           *int    `json:"version"`
	TargetBasisPoints *int    `json:"target_basis_points"`
	EngineConfigRef   *string `json:"engine_config_ref"`
}

type activateBody struct {
	EffectiveFrom  string `json:"effective_from"`
	EffectiveUntil string `json:"effective_until"`
}

func NewHandler(db *sql.DB, logger *slog.Logger, currentUser CurrentUser) *Handler {
	return &Handler{db: db, logger: logger, currentUser: currentUser}
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
	if query.GameID != "" && !httpx.IsUUID(query.GameID) {
		fields["game_id"] = "Game ID must be a valid UUID"
	}
	if query.Status != "" && !Statuses[query.Status] {
		fields["status"] = "Status must be draft, verified, active, or retired"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more filters are invalid", fields)
		return
	}
	profiles, total, err := List(r.Context(), h.db, Filter{Page: query.Page, Size: query.Size, GameID: query.GameID, Status: query.Status})
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, httpx.NewPage(newResponses(profiles), total, query.Page, query.Size))
}

func (h *Handler) AdminListForGame(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.admin(w, r); !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	if _, err := game.FindByID(r.Context(), h.db, r.PathValue("id")); errors.Is(err, game.ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	} else if err != nil {
		h.internal(w, r, err)
		return
	}
	profiles, err := ListByGame(r.Context(), h.db, r.PathValue("id"))
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponses(profiles))
}

func (h *Handler) AdminCreate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.admin(w, r)
	if !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	var body draftBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	in := DraftInput{Name: strings.TrimSpace(body.Name), Version: body.Version, TargetBasisPoints: body.TargetBasisPoints, EngineConfigRef: strings.TrimSpace(body.EngineConfigRef)}
	fields := map[string]string{}
	if in.Name == "" || utf8.RuneCountInString(in.Name) > maxNameLength {
		fields["name"] = "Name must be between 1 and 80 characters"
	}
	if in.Version < 1 {
		fields["version"] = "Version must be a positive integer"
	}
	if !Targets[in.TargetBasisPoints] {
		fields["target_basis_points"] = "Target must be one of 9200, 9400, 9600, 10000, 10200, or 10500"
	}
	if utf8.RuneCountInString(in.EngineConfigRef) > maxConfigRefLength {
		fields["engine_config_ref"] = "Engine configuration reference must be at most 200 characters"
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	created, err := CreateDraft(r.Context(), h.db, actor.ID, r.PathValue("id"), in)
	if errors.Is(err, game.ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Game not found")
		return
	}
	if errors.Is(err, ErrNameVersionTaken) {
		httpx.WriteJSON(w, http.StatusConflict, httpx.ErrorResponse{Error: "That name and version already exist for this game", Fields: map[string]string{"version": "Already used with this name"}})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, newResponse(created))
}

func (h *Handler) AdminUpdate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.admin(w, r)
	if !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Profile not found")
		return
	}
	var body draftPatchBody
	if !httpx.ReadJSON(w, r, &body) {
		return
	}
	patch := DraftPatch{Version: body.Version, TargetBasisPoints: body.TargetBasisPoints}
	fields := map[string]string{}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		patch.Name = &name
		if name == "" || utf8.RuneCountInString(name) > maxNameLength {
			fields["name"] = "Name must be between 1 and 80 characters"
		}
	}
	if body.Version != nil && *body.Version < 1 {
		fields["version"] = "Version must be a positive integer"
	}
	if body.TargetBasisPoints != nil && !Targets[*body.TargetBasisPoints] {
		fields["target_basis_points"] = "Target must be one of 9200, 9400, 9600, 10000, 10200, or 10500"
	}
	if body.EngineConfigRef != nil {
		ref := strings.TrimSpace(*body.EngineConfigRef)
		patch.EngineConfigRef = &ref
		if utf8.RuneCountInString(ref) > maxConfigRefLength {
			fields["engine_config_ref"] = "Engine configuration reference must be at most 200 characters"
		}
	}
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	updated, err := UpdateDraft(r.Context(), h.db, actor.ID, r.PathValue("id"), patch)
	if errors.Is(err, ErrNoProfile) {
		httpx.WriteError(w, http.StatusNotFound, "Profile not found")
		return
	}
	if errors.Is(err, ErrNotDraft) {
		httpx.WriteError(w, http.StatusBadRequest, "Only a draft profile can be edited; a verified profile changes by a new version")
		return
	}
	if errors.Is(err, ErrNameVersionTaken) {
		httpx.WriteJSON(w, http.StatusConflict, httpx.ErrorResponse{Error: "That name and version already exist for this game", Fields: map[string]string{"version": "Already used with this name"}})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponse(updated))
}

func (h *Handler) AdminActivate(w http.ResponseWriter, r *http.Request) {
	actor, ok := h.admin(w, r)
	if !ok {
		return
	}
	if !httpx.IsUUID(r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "Profile not found")
		return
	}
	var body activateBody
	if r.ContentLength != 0 {
		if !httpx.ReadJSON(w, r, &body) {
			return
		}
	}
	var schedule Schedule
	fields := map[string]string{}
	schedule.From = readTime(body.EffectiveFrom, "effective_from", fields)
	schedule.Until = readTime(body.EffectiveUntil, "effective_until", fields)
	if len(fields) > 0 {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", fields)
		return
	}

	activated, err := Activate(r.Context(), h.db, actor.ID, r.PathValue("id"), schedule)
	if errors.Is(err, ErrNoProfile) || errors.Is(err, game.ErrNoGame) {
		httpx.WriteError(w, http.StatusNotFound, "Profile not found")
		return
	}
	if errors.Is(err, ErrNotVerified) {
		httpx.WriteCodedError(w, http.StatusConflict, "Only a profile the engine has verified can be activated", "RTP_PROFILE_NOT_VERIFIED")
		return
	}
	if errors.Is(err, ErrEndRequired) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"effective_until": "A profile at or above 100% needs an end time"})
		return
	}
	if errors.Is(err, ErrScheduleOrder) {
		httpx.WriteFieldErrors(w, "One or more fields are invalid", map[string]string{"effective_until": "The end must be after the start"})
		return
	}
	if err != nil {
		h.internal(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, newResponse(activated))
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

func readTime(value, field string, fields map[string]string) *time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		fields[field] = "Use an RFC 3339 timestamp"
		return nil
	}
	parsed = parsed.UTC()
	return &parsed
}

func newResponses(profiles []Profile) []response {
	result := make([]response, 0, len(profiles))
	for _, item := range profiles {
		result = append(result, newResponse(item))
	}
	return result
}

func newResponse(p Profile) response {
	return response{
		ID: p.ID, GameID: p.GameID, GameSlug: p.GameSlug, GameName: p.GameName,
		Name: p.Name, Version: p.Version, TargetBasisPoints: p.TargetBasisPoints, Status: p.Status,
		EngineConfigRef: p.EngineConfigRef, TheoreticalBasisPoints: p.TheoreticalBasisPoints, ObservedBasisPoints: p.ObservedBasisPoints,
		VerifiedAt: stamp(p.VerifiedAt), EffectiveFrom: stamp(p.EffectiveFrom), EffectiveUntil: stamp(p.EffectiveUntil),
		CreatedBy: p.CreatedBy, CreatedByDisplayName: p.CreatedByDisplayName,
		CreatedAt: p.CreatedAt.UTC().Format(time.RFC3339), UpdatedAt: p.UpdatedAt.UTC().Format(time.RFC3339),
	}
}

func stamp(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339)
	return &formatted
}

func (h *Handler) internal(w http.ResponseWriter, r *http.Request, err error) {
	h.logger.Error("rtp request failed", slog.String("method", r.Method), slog.String("path", r.URL.Path), slog.Any("error", err))
	httpx.WriteError(w, http.StatusInternalServerError, "An unexpected error occurred")
}
