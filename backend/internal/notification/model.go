package notification

import "time"

const (
	KindDepositApproved    = "deposit_approved"
	KindDepositRejected    = "deposit_rejected"
	KindRoundWin           = "round_win"
	KindWithdrawalApproved = "withdrawal_approved"
	KindWithdrawalRejected = "withdrawal_rejected"
)

type Notification struct {
	ID            string
	UserID        string
	Kind          string
	AmountMinor   *int64
	Currency      string
	ReferenceType string
	ReferenceID   string
	Detail        string
	ReadAt        *time.Time
	CreatedAt     time.Time
}
