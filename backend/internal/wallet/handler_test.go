package wallet

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/user"
)

func TestSummaryRejectsBadFiltersBeforeReachingTheDatabase(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))

	for name, tc := range map[string]struct {
		target string
		status int
		field  string
	}{
		"malformed from":  {"/api/transactions/summary?from=yesterday", http.StatusBadRequest, `"from"`},
		"from after to":   {"/api/transactions/summary?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z", http.StatusBadRequest, `"to"`},
		"two-letter code": {"/api/transactions/summary?currency=PH", http.StatusNotFound, "Wallet not found"},
		"oversized page":  {"/api/transactions/summary?size=101", http.StatusBadRequest, `"size"`},
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.Summary(response, httptest.NewRequest(http.MethodGet, tc.target, nil), user.User{Role: "player"})

			if response.Code != tc.status {
				t.Fatalf("want %d, got %d (%s)", tc.status, response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), tc.field) {
				t.Fatalf("%s missing from: %s", tc.field, response.Body.String())
			}
		})
	}
}
