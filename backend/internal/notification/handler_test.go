package notification

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/user"
)

func TestListRejectsAnOversizedPageBeforeReachingTheDatabase(t *testing.T) {
	handler := NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	response := httptest.NewRecorder()
	handler.List(response, httptest.NewRequest(http.MethodGet, "/api/notifications?size=101", nil), user.User{Role: "player"})

	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"size"`) {
		t.Fatalf("want 400 with a size field error, got %d (%s)", response.Code, response.Body.String())
	}
}
