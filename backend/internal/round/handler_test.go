package round

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

func TestPlayerRoundReadsAreOwnedAndPaginated(t *testing.T) {
	db := openRoundTestDB(t)
	owner := createRoundFixture(t, db, 10_000)
	other := createRoundFixture(t, db, 10_000)

	owned, err := Open(t.Context(), db, OpenInput{RoundKey: "read-owned-" + owner.Suffix, UserID: owner.UserID, GameID: owner.GameID, StakeMinor: 100})
	if err != nil {
		t.Fatalf("open owned round: %v", err)
	}
	if _, err := Settle(t.Context(), db, SettleInput{RoundID: owned.ID, WinMinor: 250, MultiplierHundredths: 250}); err != nil {
		t.Fatalf("settle owned round: %v", err)
	}
	second, err := Open(t.Context(), db, OpenInput{RoundKey: "read-owned-second-" + owner.Suffix, UserID: owner.UserID, GameID: owner.GameID, StakeMinor: 200})
	if err != nil {
		t.Fatalf("open second owned round: %v", err)
	}
	if _, err := Settle(t.Context(), db, SettleInput{RoundID: second.ID, WinMinor: 250, MultiplierHundredths: 125}); err != nil {
		t.Fatalf("settle second owned round: %v", err)
	}
	foreign, err := Open(t.Context(), db, OpenInput{RoundKey: "read-foreign-" + other.Suffix, UserID: other.UserID, GameID: other.GameID, StakeMinor: 100})
	if err != nil {
		t.Fatalf("open foreign round: %v", err)
	}

	handler := NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil)))
	listRequest := httptest.NewRequest(http.MethodGet, "/api/rounds?status=settled&page=1&size=1", nil)
	listResponse := httptest.NewRecorder()
	handler.List(listResponse, listRequest, user.User{ID: owner.UserID})
	if listResponse.Code != http.StatusOK {
		t.Fatalf("list: want 200, got %d (%s)", listResponse.Code, listResponse.Body.String())
	}
	var page httpx.Page[response]
	if err := json.Unmarshal(listResponse.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if page.Total != 2 || page.Pages != 2 || len(page.Rows) != 1 || (page.Rows[0].ID != owned.ID && page.Rows[0].ID != second.ID) {
		t.Fatalf("unexpected owned page: %+v", page)
	}
	if page.Rows[0].GameName == "" || page.Rows[0].GameSlug == "" || page.Rows[0].WinMinor == nil || *page.Rows[0].WinMinor != 250 {
		t.Fatalf("round resource is incomplete: %+v", page.Rows[0])
	}

	foreignRequest := httptest.NewRequest(http.MethodGet, "/api/rounds/"+foreign.ID, nil)
	foreignRequest.SetPathValue("id", foreign.ID)
	foreignResponse := httptest.NewRecorder()
	handler.Get(foreignResponse, foreignRequest, user.User{ID: owner.UserID})
	if foreignResponse.Code != http.StatusNotFound {
		t.Fatalf("foreign get: want 404, got %d (%s)", foreignResponse.Code, foreignResponse.Body.String())
	}

	ownedRequest := httptest.NewRequest(http.MethodGet, "/api/rounds/"+owned.ID, nil)
	ownedRequest.SetPathValue("id", owned.ID)
	ownedResponse := httptest.NewRecorder()
	handler.Get(ownedResponse, ownedRequest, user.User{ID: owner.UserID})
	if ownedResponse.Code != http.StatusOK {
		t.Fatalf("owned get: want 200, got %d (%s)", ownedResponse.Code, ownedResponse.Body.String())
	}
}

func TestAdminRoundListAppliesEveryFilter(t *testing.T) {
	db := openRoundTestDB(t)
	fixture := createRoundFixture(t, db, 10_000)
	item, err := Open(t.Context(), db, OpenInput{RoundKey: "admin-read-" + fixture.Suffix, UserID: fixture.UserID, GameID: fixture.GameID, StakeMinor: 100})
	if err != nil {
		t.Fatalf("open round: %v", err)
	}

	from := url.QueryEscape(item.StartedAt.Add(-time.Minute).UTC().Format(time.RFC3339))
	to := url.QueryEscape(item.StartedAt.Add(time.Minute).UTC().Format(time.RFC3339))
	target := "/api/admin/rounds?page=1&size=20&user_id=" + fixture.UserID +
		"&game_id=" + fixture.GameID + "&status=open&currency=PHP&from=" + from + "&to=" + to
	request := httptest.NewRequest(http.MethodGet, target, nil)
	recorder := httptest.NewRecorder()
	NewHandler(db, slog.New(slog.NewTextHandler(io.Discard, nil))).AdminList(recorder, request, user.User{Role: "admin"})
	if recorder.Code != http.StatusOK {
		t.Fatalf("admin list: want 200, got %d (%s)", recorder.Code, recorder.Body.String())
	}
	var page httpx.Page[adminResponse]
	if err := json.Unmarshal(recorder.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode admin list: %v", err)
	}
	if page.Total != 1 || len(page.Rows) != 1 || page.Rows[0].ID != item.ID || page.Rows[0].UserID != fixture.UserID {
		t.Fatalf("unexpected admin page: %+v", page)
	}
}

func TestRoundReadHandlersRejectInvalidFilters(t *testing.T) {
	tests := []string{
		"?status=pending",
		"?currency=PESO",
		"?game_id=not-a-uuid",
		"?user_id=not-a-uuid",
		"?from=yesterday",
	}
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for _, query := range tests {
		t.Run(query, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/admin/rounds"+query, nil)
			recorder := httptest.NewRecorder()
			handler.AdminList(recorder, request, user.User{Role: "admin"})
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestPlayerRoundGetRejectsMalformedIDAsNotFound(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/rounds/not-an-id", nil)
	request.SetPathValue("id", "not-an-id")
	recorder := httptest.NewRecorder()
	NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil))).Get(recorder, request, user.User{})
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("want 404, got %d (%s)", recorder.Code, recorder.Body.String())
	}
}
