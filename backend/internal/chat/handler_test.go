package chat

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gaming-platform/backend/internal/user"
)

func newTestHandler(messagesPerMinute int) *Handler {
	return NewHandler(nil, slog.New(slog.NewTextHandler(io.Discard, nil)), NewHub(), Config{
		MessagesPerMinute: messagesPerMinute,
		AllowedOrigins:    []string{"http://localhost:5173", " https://play.example.com/ "},
	})
}

func post(handler *Handler, body string, account user.User) *httptest.ResponseRecorder {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/chat/messages", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	handler.Post(response, request, account)
	return response
}

func TestPostRejectsAnEmptyOversizedOrMultilineMessage(t *testing.T) {
	handler := newTestHandler(100)
	for name, body := range map[string]string{
		"empty":      `{"text":""}`,
		"whitespace": `{"text":"   "}`,
		"too long":   `{"text":"` + strings.Repeat("界", MaxMessageLength+1) + `"}`,
		"multiline":  `{"text":"one\nline"}`,
	} {
		t.Run(name, func(t *testing.T) {
			response := post(handler, body, user.User{ID: "player-1", Role: "player"})
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), `"text"`) {
				t.Fatalf("want 400 with a text field error, got %d (%s)", response.Code, response.Body.String())
			}
		})
	}
}

func TestPostRejectsUnknownFields(t *testing.T) {
	response := post(newTestHandler(100), `{"text":"hi","role":"admin"}`, user.User{ID: "player-1", Role: "player"})
	if response.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d (%s)", response.Code, response.Body.String())
	}
}

func TestPostThrottlesEachAccountSeparately(t *testing.T) {
	handler := newTestHandler(1)
	first := user.User{ID: "player-1", Role: "player"}
	second := user.User{ID: "player-2", Role: "player"}

	// The first attempt spends the budget even though the body is invalid, so
	// the limiter is exercised without a database behind the handler.
	if response := post(handler, `{"text":""}`, first); response.Code != http.StatusBadRequest {
		t.Fatalf("first attempt: want 400, got %d (%s)", response.Code, response.Body.String())
	}
	response := post(handler, `{"text":"again"}`, first)
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") != "60" {
		t.Fatalf("second attempt: want 429 with Retry-After 60, got %d %q (%s)", response.Code, response.Header().Get("Retry-After"), response.Body.String())
	}
	if response := post(handler, `{"text":""}`, second); response.Code != http.StatusBadRequest {
		t.Fatalf("another account is throttled by the first: %d (%s)", response.Code, response.Body.String())
	}
}

func TestNewHandlerKeepsOnlyTheHostOfEachAllowedOrigin(t *testing.T) {
	handler := newTestHandler(1)
	if len(handler.originHosts) != 2 || handler.originHosts[0] != "localhost:5173" || handler.originHosts[1] != "play.example.com" {
		t.Fatalf("origin hosts = %v", handler.originHosts)
	}
}
