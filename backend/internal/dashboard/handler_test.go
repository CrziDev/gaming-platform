package dashboard

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/user"
)

func TestGetRejectsMissingOrMalformedCurrency(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))

	for name, target := range map[string]string{
		"missing":   "/api/admin/dashboard",
		"malformed": "/api/admin/dashboard?currency=PH",
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.Get(response, httptest.NewRequest(http.MethodGet, target, nil), user.User{Role: "admin"})

			if response.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"currency"`) {
				t.Fatalf("currency field error missing: %s", response.Body.String())
			}
		})
	}
}
