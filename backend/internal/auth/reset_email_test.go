package auth

import (
	"strings"
	"testing"
)

func TestPasswordResetEmailLinksToTheResetPage(t *testing.T) {
	message := passwordResetEmail("https://play.example.com/", "reset-record-id", "player@example.com", "a+b/c=")

	if message.IdempotencyKey != "reset-record-id" || len(message.To) != 1 || message.To[0] != "player@example.com" {
		t.Fatalf("unexpected envelope: %+v", message)
	}
	wantLink := "https://play.example.com/reset?token=a%2Bb%2Fc%3D"
	if !strings.Contains(message.Text, wantLink) || !strings.Contains(message.Text, "30 minutes") {
		t.Fatalf("plain-text body does not contain the reset link and expiry: %q", message.Text)
	}
	if !strings.Contains(message.HTML, `href="`+wantLink+`"`) || !strings.Contains(message.HTML, "30 minutes") {
		t.Fatalf("HTML body does not contain the reset link and expiry: %q", message.HTML)
	}
}
