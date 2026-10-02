package withdrawal

import (
	"errors"
	"time"
)

var (
	ErrNotFound                = errors.New("withdrawal: not found")
	ErrInvalidMethod           = errors.New("withdrawal: payment method is unavailable")
	ErrInvalidCurrency         = errors.New("withdrawal: currency is unavailable")
	ErrAmountOutOfRange        = errors.New("withdrawal: amount is outside the allowed range")
	ErrPendingExists           = errors.New("withdrawal: wallet already has a pending request")
	ErrIdempotencyKeyReused    = errors.New("withdrawal: idempotency key belongs to a different request")
	ErrAlreadyReviewed         = errors.New("withdrawal: request is no longer pending")
	ErrPayoutReferenceRequired = errors.New("withdrawal: payout reference is required")
	ErrRejectionReasonRequired = errors.New("withdrawal: rejection reason is required")

	errIdempotencyRace = errors.New("withdrawal: idempotency key was claimed concurrently")
)

type Request struct {
	ID              string
	UserID          string
	WalletID        string
	Currency        string
	MethodID        string
	MethodName      string
	AmountMinor     int64
	AccountName     string
	AccountNumber   string
	Status          string
	PayoutReference string
	Reason          string
	ReviewedAt      *time.Time
	CancelledAt     *time.Time
	CreatedAt       time.Time
}

type AdminRequest struct {
	Request
	UserEmail   string
	DisplayName string
}

type AdminListFilter struct {
	Page   int
	Size   int
	UserID string
	Status string
	Search string
}

type NewRequest struct {
	UserID         string
	MethodID       string
	Currency       string
	AmountMinor    int64
	AccountName    string
	AccountNumber  string
	IdempotencyKey string
}

func (n NewRequest) matches(item Request) bool {
	return item.MethodID == n.MethodID && item.Currency == n.Currency && item.AmountMinor == n.AmountMinor &&
		item.AccountName == n.AccountName && item.AccountNumber == n.AccountNumber
}
