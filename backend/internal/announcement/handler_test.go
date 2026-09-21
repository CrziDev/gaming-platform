package announcement

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gaming-platform/backend/internal/user"
)

func testHandler() *Handler {
	return NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestCreateRejectsInvalidContentBeforeDatabaseAccess(t *testing.T) {
	handler := testHandler()
	handler.now = func() time.Time { return time.Date(2026, time.September, 21, 12, 0, 0, 0, time.UTC) }

	for name, body := range map[string]string{
		"empty":     `{"text":"   ","ends_at":null}`,
		"multiline": `{"text":"first\nsecond","ends_at":null}`,
		"too long":  `{"text":"` + strings.Repeat("界", maxTextLength+1) + `","ends_at":null}`,
		"past":      `{"text":"Notice","ends_at":"2026-09-20T12:00:00Z"}`,
		"bad time":  `{"text":"Notice","ends_at":"tomorrow"}`,
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/api/admin/announcements", strings.NewReader(body))
			handler.Create(response, request, user.User{ID: "00000000-0000-4000-8000-000000000000"})
			if response.Code != http.StatusBadRequest {
				t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.String())
			}
		})
	}
}

func TestUpdateAndStatusRejectMalformedIDs(t *testing.T) {
	handler := testHandler()
	for name, apply := range map[string]func(http.ResponseWriter, *http.Request, user.User){
		"update": handler.Update,
		"status": handler.SetStatus,
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPut, "/api/admin/announcements/not-an-id", strings.NewReader(`{}`))
			request.SetPathValue("id", "not-an-id")
			apply(response, request, user.User{})
			if response.Code != http.StatusNotFound {
				t.Fatalf("want 404, got %d (%s)", response.Code, response.Body.String())
			}
		})
	}
}

func TestListsRejectOversizedPagesBeforeDatabaseAccess(t *testing.T) {
	handler := testHandler()
	for name, apply := range map[string]func(http.ResponseWriter, *http.Request){
		"public": handler.List,
		"admin": func(w http.ResponseWriter, r *http.Request) {
			handler.AdminList(w, r, user.User{})
		},
	} {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			apply(response, httptest.NewRequest(http.MethodGet, "/api/announcements?size=101", nil))
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"size"`) {
				t.Fatalf("want size error, got %d (%s)", response.Code, response.Body.String())
			}
		})
	}
}
