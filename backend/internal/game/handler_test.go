package game

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestHandler() *Handler {
	return NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestListRejectsInvalidFiltersBeforeTouchingTheDatabase(t *testing.T) {
	handler := newTestHandler()

	for name, tc := range map[string]struct {
		target string
		field  string
	}{
		"sort":               {"/api/games?sort=popular", `"sort"`},
		"flag":               {"/api/games?flag=hot", `"flag"`},
		"category uppercase": {"/api/games?category=Slots", `"category"`},
		"category spaces":    {"/api/games?category=live%20dealers", `"category"`},
		"category too long":  {"/api/games?category=" + strings.Repeat("a", maxSlugLength+1), `"category"`},
		"size over maximum":  {"/api/games?size=101", `"size"`},
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.List(response, httptest.NewRequest(http.MethodGet, tc.target, nil))

			if response.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), tc.field) {
				t.Fatalf("field error %s missing: %s", tc.field, response.Body.String())
			}
		})
	}
}

func TestGetRejectsAMalformedSlugAsNotFound(t *testing.T) {
	handler := newTestHandler()

	for name, slug := range map[string]string{
		"uppercase":    "Aurora-Dice",
		"leading dash": "-aurora",
		"double dash":  "aurora--dice",
		"too long":     strings.Repeat("a", maxSlugLength+1),
		"path chars":   "aurora%2Fdice",
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/games/"+slug, nil)
			request.SetPathValue("slug", slug)
			handler.Get(response, request)

			if response.Code != http.StatusNotFound {
				t.Fatalf("want 404, got %d (%s)", response.Code, response.Body.String())
			}
		})
	}
}

func TestFlagsMarkAGameNewForThirtyDays(t *testing.T) {
	now := time.Date(2026, time.September, 12, 12, 0, 0, 0, time.UTC)

	fresh := Game{CreatedAt: now.Add(-29 * 24 * time.Hour)}
	if flags := fresh.Flags(now); len(flags) != 1 || flags[0] != FlagNew {
		t.Fatalf("a 29-day-old game should be new, got %v", flags)
	}

	stale := Game{CreatedAt: now.Add(-31 * 24 * time.Hour)}
	if flags := stale.Flags(now); len(flags) != 0 {
		t.Fatalf("a 31-day-old game should carry no flags, got %v", flags)
	}
}

func TestValidateTextCountsUnicodeCharacters(t *testing.T) {
	fields := map[string]string{}
	validateText(fields, strings.Repeat("界", maxNameLength), "", "slots", strings.Repeat("界", maxProviderLength), "PHP")
	if len(fields) != 0 {
		t.Fatalf("valid character counts were rejected: %v", fields)
	}

	validateText(fields, strings.Repeat("界", maxNameLength+1), "", "slots", "Provider", "PHP")
	if _, rejected := fields["name"]; !rejected {
		t.Fatal("overlong Unicode name was accepted")
	}
}

func TestValidateWagersRejectsUnsafeJSONIntegers(t *testing.T) {
	fields := map[string]string{}
	validateWagers(fields, 100, 1<<53, 100)
	if _, rejected := fields["max_wager_minor"]; !rejected {
		t.Fatal("wager outside JavaScript's exact integer range was accepted")
	}
}
