package dashboard

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/httpx"
	"github.com/gaming-platform/backend/internal/user"
)

func TestGetRequiresAuthentication(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), func(w http.ResponseWriter, _ *http.Request) (user.User, bool) {
		httpx.WriteError(w, http.StatusUnauthorized, "Authentication is required")
		return user.User{}, false
	})
	response := httptest.NewRecorder()

	handler.Get(response, httptest.NewRequest(http.MethodGet, "/api/admin/dashboard?currency=PHP", nil))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d (%s)", response.Code, response.Body.String())
	}
}

func TestGetRequiresAdministrator(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), currentUserWithRole("player"))
	response := httptest.NewRecorder()

	handler.Get(response, httptest.NewRequest(http.MethodGet, "/api/admin/dashboard?currency=PHP", nil))

	if response.Code != http.StatusForbidden {
		t.Fatalf("want 403, got %d (%s)", response.Code, response.Body.String())
	}
}

func TestGetRejectsMissingOrMalformedCurrency(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), currentUserWithRole("admin"))

	for name, target := range map[string]string{
		"missing":   "/api/admin/dashboard",
		"malformed": "/api/admin/dashboard?currency=PH",
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.Get(response, httptest.NewRequest(http.MethodGet, target, nil))

			if response.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.String())
			}
			if !strings.Contains(response.Body.String(), `"currency"`) {
				t.Fatalf("currency field error missing: %s", response.Body.String())
			}
		})
	}
}

func currentUserWithRole(role string) CurrentUser {
	return func(http.ResponseWriter, *http.Request) (user.User, bool) {
		return user.User{Role: role}, true
	}
}
