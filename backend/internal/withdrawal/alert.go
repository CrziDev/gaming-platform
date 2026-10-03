package withdrawal

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"time"

	"github.com/gaming-platform/backend/internal/mail"
	"github.com/gaming-platform/backend/internal/money"
	"github.com/gaming-platform/backend/internal/user"
)

const adminAlertTimeout = 30 * time.Second

// alertAdmins emails every active administrator with alerts on about a new
// request without holding up the player's response. A failed alert is logged;
// the request stands.
func (h *Handler) alertAdmins(request Request, player user.User) {
	if h.cfg.Mailer == nil {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), adminAlertTimeout)
		defer cancel()
		if err := h.sendAdminAlert(ctx, request, player); err != nil {
			h.logger.Error("withdrawal admin alert failed", slog.String("withdrawal_id", request.ID), slog.Any("error", err))
		}
	}()
}

func (h *Handler) sendAdminAlert(ctx context.Context, request Request, player user.User) error {
	recipients, err := user.AlertRecipientEmails(ctx, h.db)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}
	var minorUnits int
	if err := h.db.QueryRowContext(ctx, `SELECT minor_units FROM currencies WHERE code = $1`, request.Currency).Scan(&minorUnits); err != nil {
		return fmt.Errorf("withdrawal: read currency minor units: %w", err)
	}
	return h.cfg.Mailer.Send(ctx, withdrawalAlertEmail(h.cfg.PublicWebURL, recipients, request, player, minorUnits))
}

func withdrawalAlertEmail(publicWebURL string, recipients []string, request Request, player user.User, minorUnits int) mail.Message {
	amount := request.Currency + " " + money.FormatMinor(request.AmountMinor, minorUnits)
	queueURL := strings.TrimRight(publicWebURL, "/") + "/admin/withdrawals"
	rows := [][2]string{
		{"Player", fmt.Sprintf("%s (%s)", player.DisplayName, player.Email)},
		{"Amount", amount},
		{"Method", request.MethodName},
		{"Account name", request.AccountName},
		{"Account number", request.AccountNumber},
		{"Submitted", request.CreatedAt.UTC().Format("2006-01-02 15:04 MST")},
		{"Request ID", request.ID},
	}

	var text, table strings.Builder
	text.WriteString("A player submitted a withdrawal request that is waiting for review.\n\n")
	for _, row := range rows {
		text.WriteString(row[0] + ": " + row[1] + "\n")
		table.WriteString("<tr><td style=\"padding:2px 12px 2px 0;color:#555\">" + html.EscapeString(row[0]) + "</td><td>" + html.EscapeString(row[1]) + "</td></tr>")
	}
	text.WriteString("\nReview it in the withdrawal queue: " + queueURL + "\n")

	return mail.Message{
		IdempotencyKey: "withdrawal-request-" + request.ID,
		To:             recipients,
		Subject:        "New withdrawal request: " + amount,
		Text:           text.String(),
		HTML: "<p>A player submitted a withdrawal request that is waiting for review.</p><table>" + table.String() +
			"</table><p><a href=\"" + html.EscapeString(queueURL) + "\">Open the withdrawal queue</a></p>",
	}
}
