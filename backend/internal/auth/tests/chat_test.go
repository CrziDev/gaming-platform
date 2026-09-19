package auth_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func dialChat(t *testing.T, base, origin string) (*websocket.Conn, *http.Response) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(base, "http")+"/api/chat/socket", &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": []string{origin}},
	})
	if err != nil {
		if response == nil {
			t.Fatalf("dial chat socket: %v", err)
		}
		return nil, response
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn, response
}

func readEvent(t *testing.T, conn *websocket.Conn) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	kind, payload, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("read socket event: %v", err)
	}
	if kind != websocket.MessageText {
		t.Fatalf("socket event type = %v, want text", kind)
	}
	return string(payload)
}

func TestChatHTTPAndSocketFlow(t *testing.T) {
	db := requireDB(t)
	base, client := newServer(t, db)

	if status, body := send(t, clientWithCookies(t), http.MethodPost, base+"/api/chat/messages", map[string]string{"text": "hello"}); status != http.StatusUnauthorized {
		t.Fatalf("anonymous post: want 401, got %d (%s)", status, body)
	}
	status, body := send(t, clientWithCookies(t), http.MethodGet, base+"/api/chat/messages", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"online":0`)) || !bytes.Contains(body, []byte(`"messages":[]`)) {
		t.Fatalf("anonymous read of an empty room: want 200 with nobody online, got %d (%s)", status, body)
	}

	if status, body := register(t, client, base); status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d (%s)", status, body)
	}
	status, body = send(t, client, http.MethodPost, base+"/api/chat/messages", map[string]string{"text": "  first  "})
	if status != http.StatusCreated {
		t.Fatalf("post: want 201, got %d (%s)", status, body)
	}
	var posted struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
		Role        string `json:"role"`
		Text        string `json:"text"`
		CreatedAt   string `json:"created_at"`
	}
	if err := json.Unmarshal(body, &posted); err != nil || posted.ID == "" || posted.DisplayName != testName || posted.Role != "player" || posted.Text != "first" {
		t.Fatalf("posted message: %+v err=%v (%s)", posted, err, body)
	}
	if _, err := time.Parse(time.RFC3339, posted.CreatedAt); err != nil {
		t.Fatalf("created_at is not RFC 3339: %q", posted.CreatedAt)
	}

	if _, response := dialChat(t, base, "http://evil.example.com"); response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("a socket from an unlisted origin must be refused with 403, got %+v", response)
	}

	first, _ := dialChat(t, base, webOrigin)
	if got := readEvent(t, first); got != `{"type":"presence","online":1}` {
		t.Fatalf("first socket's opening event = %s", got)
	}
	status, body = send(t, clientWithCookies(t), http.MethodGet, base+"/api/chat/messages", nil)
	if status != http.StatusOK || !bytes.Contains(body, []byte(`"online":1`)) {
		t.Fatalf("room with one socket open: %d (%s)", status, body)
	}

	if status, body := send(t, client, http.MethodPost, base+"/api/chat/messages", map[string]string{"text": "second"}); status != http.StatusCreated {
		t.Fatalf("post second: want 201, got %d (%s)", status, body)
	}
	if got := readEvent(t, first); got != `{"type":"message"}` {
		t.Fatalf("socket after a post = %s", got)
	}
	status, body = send(t, clientWithCookies(t), http.MethodGet, base+"/api/chat/messages", nil)
	var room struct {
		Online   int `json:"online"`
		Messages []struct {
			Text string `json:"text"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &room); err != nil || status != http.StatusOK {
		t.Fatalf("decode room: %v %d (%s)", err, status, body)
	}
	if len(room.Messages) != 2 || room.Messages[0].Text != "first" || room.Messages[1].Text != "second" {
		t.Fatalf("room is not oldest first: %+v", room.Messages)
	}

	second, _ := dialChat(t, base, webOrigin)
	if got := readEvent(t, second); got != `{"type":"presence","online":2}` {
		t.Fatalf("second socket's opening event = %s", got)
	}
	if got := readEvent(t, first); got != `{"type":"presence","online":2}` {
		t.Fatalf("first socket sees the second join: %s", got)
	}
	if err := second.Close(websocket.StatusNormalClosure, "done"); err != nil {
		t.Fatalf("close second: %v", err)
	}
	if got := readEvent(t, first); got != `{"type":"presence","online":1}` {
		t.Fatalf("first socket sees the second leave: %s", got)
	}

	if status, body := send(t, client, http.MethodPost, base+"/api/chat/messages", map[string]string{"text": strings.Repeat("x", 281)}); status != http.StatusBadRequest || !bytes.Contains(body, []byte(`"text"`)) {
		t.Fatalf("oversized post: want 400 with a text field error, got %d (%s)", status, body)
	}
}

func TestChatSocketOutlivesTheServerRequestTimeouts(t *testing.T) {
	db := requireDB(t)
	server := httptest.NewUnstartedServer(newHandler(db))
	server.Config.ReadTimeout = 200 * time.Millisecond
	server.Config.WriteTimeout = 200 * time.Millisecond
	server.Start()
	t.Cleanup(server.Close)
	client := clientWithCookies(t)
	if status, body := register(t, client, server.URL); status != http.StatusCreated {
		t.Fatalf("register: want 201, got %d (%s)", status, body)
	}

	conn, _ := dialChat(t, server.URL, webOrigin)
	readEvent(t, conn)
	time.Sleep(600 * time.Millisecond)

	if status, body := send(t, client, http.MethodPost, server.URL+"/api/chat/messages", map[string]string{"text": "still here"}); status != http.StatusCreated {
		t.Fatalf("post after the timeouts elapsed: want 201, got %d (%s)", status, body)
	}
	if got := readEvent(t, conn); got != `{"type":"message"}` {
		t.Fatalf("socket after the server's deadlines would have fired = %s", got)
	}
}
