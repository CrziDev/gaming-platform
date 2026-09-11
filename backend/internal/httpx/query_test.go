package httpx_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/httpx"
)

func TestReadQueryAppliesDefaultsAndNormalizesValues(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet,
		"/api/records?search=++Player+One++&status=active&type=wager&currency=php&game_id=game-1"+
			"&from=2026-09-01T08%3A00%3A00%2B08%3A00&to=2026-09-02T00%3A00%3A00Z", nil)
	response := httptest.NewRecorder()

	query, ok := httpx.ReadQuery(response, request)
	if !ok {
		t.Fatalf("query was rejected: %s", response.Body.Bytes())
	}
	if query.Page != 1 || query.Size != 20 {
		t.Fatalf("unexpected defaults: page=%d size=%d", query.Page, query.Size)
	}
	if query.Search != "Player One" || query.Status != "active" || query.Type != "wager" ||
		query.Currency != "PHP" || query.GameID != "game-1" {
		t.Fatalf("unexpected filters: %+v", query)
	}
	wantFrom := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	if query.From == nil || !query.From.Equal(wantFrom) {
		t.Fatalf("unexpected from time: %v", query.From)
	}
}

func TestReadQueryRejectsInvalidPagingAndDates(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet,
		"/api/records?page=zero&size=101&from=yesterday&to=2026-09-01T00%3A00%3A00Z", nil)
	response := httptest.NewRecorder()

	if _, ok := httpx.ReadQuery(response, request); ok {
		t.Fatal("invalid query was accepted")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", response.Code)
	}

	var problem httpx.ErrorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &problem); err != nil {
		t.Fatalf("decode: %v", err)
	}
	for _, field := range []string{"page", "size", "from"} {
		if problem.Fields[field] == "" {
			t.Errorf("%s was not rejected: %+v", field, problem.Fields)
		}
	}
}

func TestReadQueryRejectsAnInvertedDateRange(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet,
		"/api/records?from=2026-09-02T00%3A00%3A00Z&to=2026-09-01T00%3A00%3A00Z", nil)
	response := httptest.NewRecorder()

	if _, ok := httpx.ReadQuery(response, request); ok {
		t.Fatal("inverted range was accepted")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", response.Code)
	}
}

func TestNewPageKeepsAnEmptyResultOnPageOne(t *testing.T) {
	page := httpx.NewPage([]string{}, 0, 1, 20)
	if page.Rows == nil {
		t.Fatal("rows must encode as an empty array, not null")
	}
	if page.Pages != 1 || page.Total != 0 || page.Page != 1 || page.Size != 20 {
		t.Fatalf("unexpected empty page: %+v", page)
	}
}

func TestIsUUIDAcceptsGeneratedIdentifiersOnly(t *testing.T) {
	for _, value := range []string{"790ea15c-6c37-4af6-8b8d-65aab8f02f42", "01993c21-1c7a-7c01-8ca7-822b6cc5ee88"} {
		if !httpx.IsUUID(value) {
			t.Errorf("valid UUID %q was rejected", value)
		}
	}
	for _, value := range []string{"", "not-a-uuid", "00000000-0000-0000-0000-000000000000"} {
		if httpx.IsUUID(value) {
			t.Errorf("invalid UUID %q was accepted", value)
		}
	}
}
