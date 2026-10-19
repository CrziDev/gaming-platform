package auth

import (
	"html"
	"net/url"
	"strings"

	"github.com/gaming-platform/backend/internal/mail"
)

func passwordResetEmail(publicWebURL, resetID, recipient, token string) mail.Message {
	resetURL := strings.TrimRight(publicWebURL, "/") + "/reset?token=" + url.QueryEscape(token)
	return mail.Message{
		IdempotencyKey: resetID,
		To:             []string{recipient},
		Subject:        "Reset your PLAYMEVO password",
		Text:           "Use this link to reset your password. It expires in 30 minutes:\n\n" + resetURL + "\n\nIf you did not request this, you can ignore this email.",
		HTML:           "<p>Use this link to reset your password. It expires in 30 minutes:</p><p><a href=\"" + html.EscapeString(resetURL) + "\">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>",
	}
}
