package withdrawal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/notification"
	"github.com/gaming-platform/backend/internal/wallet"
)

// Create debits the wallet in the same transaction that records the request, so
// the requested amount stops being spendable the moment the request exists. The
// wallet row is locked before anything else: it serializes requests on one
// wallet, and it is taken ahead of the request insert's foreign-key lock.
func Create(ctx context.Context, db *sql.DB, in NewRequest) (Request, bool, error) {
	item, created, err := create(ctx, db, in)
	if !errors.Is(err, errIdempotencyRace) {
		return item, created, err
	}
	existing, err := getByIdempotencyKey(ctx, db, in.UserID, in.IdempotencyKey)
	if err != nil {
		return Request{}, false, err
	}
	if !in.matches(existing) {
		return Request{}, false, ErrIdempotencyKeyReused
	}
	return existing, false, nil
}

func create(ctx context.Context, db *sql.DB, in NewRequest) (Request, bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Request{}, false, fmt.Errorf("withdrawal: begin create: %w", err)
	}
	defer tx.Rollback()

	walletID, minMinor, maxMinor, err := lockWallet(ctx, tx, in.UserID, in.Currency)
	if err != nil {
		return Request{}, false, err
	}
	existing, err := getByIdempotencyKey(ctx, tx, in.UserID, in.IdempotencyKey)
	if err == nil {
		if !in.matches(existing) {
			return Request{}, false, ErrIdempotencyKeyReused
		}
		return existing, false, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return Request{}, false, err
	}
	if in.AmountMinor < minMinor || in.AmountMinor > maxMinor {
		return Request{}, false, ErrAmountOutOfRange
	}
	enabled, err := methodEnabled(ctx, tx, in.MethodID)
	if err != nil {
		return Request{}, false, err
	}
	if !enabled {
		return Request{}, false, ErrInvalidMethod
	}
	pending, err := hasPending(ctx, tx, walletID)
	if err != nil {
		return Request{}, false, err
	}
	if pending {
		return Request{}, false, ErrPendingExists
	}

	id, err := newID(ctx, tx)
	if err != nil {
		return Request{}, false, err
	}
	hold, err := wallet.MoveTx(ctx, tx, wallet.Movement{
		UserID: in.UserID, Currency: in.Currency, Kind: "withdrawal", AmountMinor: -in.AmountMinor,
		IdempotencyKey: "withdrawal:" + id + ":hold", ReferenceType: "withdrawal", ReferenceID: id,
		ActorID: in.UserID, Reason: "withdrawal request",
	})
	if err != nil {
		return Request{}, false, err
	}
	if err := insert(ctx, tx, id, walletID, hold.ID, in); err != nil {
		return Request{}, false, err
	}
	if err := writeAudit(ctx, tx, in.UserID, id, "withdrawal.request", "", "pending", in.AmountMinor, ""); err != nil {
		return Request{}, false, err
	}
	item, err := getByID(ctx, tx, id)
	if err != nil {
		return Request{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return Request{}, false, fmt.Errorf("withdrawal: commit create: %w", err)
	}
	return item, true, nil
}

// Review settles a pending request. An approval moves no money, because the
// amount left the balance when the request was made; a rejection returns it.
func Review(ctx context.Context, db *sql.DB, actorID, id, action, payoutReference, reason string) (Request, error) {
	payoutReference = strings.TrimSpace(payoutReference)
	reason = strings.TrimSpace(reason)
	switch {
	case action == "approve" && payoutReference == "":
		return Request{}, ErrPayoutReferenceRequired
	case action == "reject" && reason == "":
		return Request{}, ErrRejectionReasonRequired
	case action != "approve" && action != "reject":
		return Request{}, errors.New("withdrawal: review action is invalid")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: begin review: %w", err)
	}
	defer tx.Rollback()

	item, err := lockRequest(ctx, tx, id)
	if err != nil {
		return Request{}, err
	}
	if item.Status != "pending" {
		return item, ErrAlreadyReviewed
	}

	if action == "approve" {
		if err := markApproved(ctx, tx, id, actorID, payoutReference); err != nil {
			return Request{}, err
		}
		if err := writeAudit(ctx, tx, actorID, id, "withdrawal.approve", item.Status, "approved", item.AmountMinor, payoutReference); err != nil {
			return Request{}, err
		}
		if err := notification.Create(ctx, tx, notification.Notification{
			UserID: item.UserID, Kind: notification.KindWithdrawalApproved, AmountMinor: &item.AmountMinor, Currency: item.Currency,
			ReferenceType: "withdrawal", ReferenceID: id,
		}); err != nil {
			return Request{}, err
		}
	} else {
		release, err := releaseHold(ctx, tx, item, actorID, "withdrawal rejected")
		if err != nil {
			return Request{}, err
		}
		if err := markRejected(ctx, tx, id, actorID, reason, release.ID); err != nil {
			return Request{}, err
		}
		if err := writeAudit(ctx, tx, actorID, id, "withdrawal.reject", item.Status, "rejected", item.AmountMinor, reason); err != nil {
			return Request{}, err
		}
		if err := notification.Create(ctx, tx, notification.Notification{
			UserID: item.UserID, Kind: notification.KindWithdrawalRejected, AmountMinor: &item.AmountMinor, Currency: item.Currency,
			ReferenceType: "withdrawal", ReferenceID: id, Detail: reason,
		}); err != nil {
			return Request{}, err
		}
	}

	reviewed, err := getByID(ctx, tx, id)
	if err != nil {
		return Request{}, err
	}
	if err := tx.Commit(); err != nil {
		return Request{}, fmt.Errorf("withdrawal: commit review: %w", err)
	}
	return reviewed, nil
}

// Cancel takes the same request lock as Review, so a player's cancel and an
// operator's review cannot both act on one request.
func Cancel(ctx context.Context, db *sql.DB, userID, id string) (Request, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: begin cancel: %w", err)
	}
	defer tx.Rollback()

	item, err := lockRequest(ctx, tx, id)
	if err != nil {
		return Request{}, err
	}
	if item.UserID != userID {
		return Request{}, ErrNotFound
	}
	if item.Status != "pending" {
		return item, ErrAlreadyReviewed
	}
	release, err := releaseHold(ctx, tx, item, userID, "withdrawal cancelled")
	if err != nil {
		return Request{}, err
	}
	if err := markCancelled(ctx, tx, id, release.ID); err != nil {
		return Request{}, err
	}
	if err := writeAudit(ctx, tx, userID, id, "withdrawal.cancel", item.Status, "cancelled", item.AmountMinor, ""); err != nil {
		return Request{}, err
	}
	cancelled, err := getByID(ctx, tx, id)
	if err != nil {
		return Request{}, err
	}
	if err := tx.Commit(); err != nil {
		return Request{}, fmt.Errorf("withdrawal: commit cancel: %w", err)
	}
	return cancelled, nil
}

func releaseHold(ctx context.Context, tx *sql.Tx, item Request, actorID, reason string) (wallet.Transaction, error) {
	return wallet.MoveTx(ctx, tx, wallet.Movement{
		UserID: item.UserID, Currency: item.Currency, Kind: "refund", AmountMinor: item.AmountMinor,
		IdempotencyKey: "withdrawal:" + item.ID + ":release", ReferenceType: "withdrawal", ReferenceID: item.ID,
		ActorID: actorID, Reason: reason,
	})
}

func writeAudit(ctx context.Context, tx *sql.Tx, actorID, entityID, action, beforeStatus, afterStatus string, amountMinor int64, detail string) error {
	var before any
	if beforeStatus != "" {
		before = map[string]any{"status": beforeStatus, "amount_minor": amountMinor}
	}
	return audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "withdrawal_request", EntityID: entityID, Detail: detail,
		Before: before,
		After:  map[string]any{"status": afterStatus, "amount_minor": amountMinor},
	})
}
