package round

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gaming-platform/backend/internal/money"
	"github.com/gaming-platform/backend/internal/rtp"
	"github.com/gaming-platform/backend/internal/wallet"
)

func Open(ctx context.Context, db *sql.DB, in OpenInput) (Round, error) {
	in.RoundKey = strings.TrimSpace(in.RoundKey)
	if in.RoundKey == "" {
		return Round{}, ErrRoundKeyRequired
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Round{}, fmt.Errorf("round: begin open: %w", err)
	}
	defer tx.Rollback()

	existing, err := findByKey(ctx, tx, in.RoundKey)
	if err == nil {
		if !sameOpenRequest(existing, in) {
			return Round{}, ErrRoundKeyConflict
		}
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Round{}, fmt.Errorf("round: find idempotent open: %w", err)
	}

	currency, err := gameCurrency(ctx, tx, in.GameID)
	if err != nil {
		return Round{}, err
	}
	walletID, err := lockWallet(ctx, tx, in.UserID, currency)
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, wallet.ErrNotFound
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: lock wallet: %w", err)
	}

	existing, err = findByKey(ctx, tx, in.RoundKey)
	if err == nil {
		if !sameOpenRequest(existing, in) {
			return Round{}, ErrRoundKeyConflict
		}
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Round{}, fmt.Errorf("round: recheck idempotent open: %w", err)
	}

	config, err := lockGame(ctx, tx, in.GameID)
	if err != nil {
		return Round{}, err
	}
	if config.Status != "active" || config.Currency != currency {
		return Round{}, ErrGameUnavailable
	}
	if !validWager(config, in.StakeMinor) {
		return Round{}, ErrInvalidWager
	}
	if _, err := rtp.RevertExpiredForGameTx(ctx, tx, in.GameID, time.Now().UTC()); err != nil {
		return Round{}, fmt.Errorf("round: reconcile RTP profile: %w", err)
	}
	profileID, err := activeProfileID(ctx, tx, in.GameID)
	if err != nil {
		return Round{}, err
	}

	opened, created, err := insertOpen(ctx, tx, in, walletID, currency, profileID)
	if err != nil {
		return Round{}, err
	}
	if !sameOpenRequest(opened, in) {
		return Round{}, ErrRoundKeyConflict
	}
	if !created {
		return opened, nil
	}

	_, err = wallet.MoveTx(ctx, tx, wallet.Movement{
		UserID:         in.UserID,
		Currency:       currency,
		Kind:           "wager",
		AmountMinor:    -in.StakeMinor,
		IdempotencyKey: "round:" + opened.ID + ":wager",
		ReferenceType:  "round",
		ReferenceID:    opened.ID,
		Reason:         "round wager",
	})
	if err != nil {
		return Round{}, err
	}
	if err := tx.Commit(); err != nil {
		return Round{}, fmt.Errorf("round: commit open: %w", err)
	}
	return opened, nil
}

func validWager(config gameConfig, stakeMinor int64) bool {
	if config.WagerStepMinor <= 0 || !money.IsSafeMinor(stakeMinor) || stakeMinor < config.MinWagerMinor || stakeMinor > config.MaxWagerMinor {
		return false
	}
	return (stakeMinor-config.MinWagerMinor)%config.WagerStepMinor == 0
}

func sameOpenRequest(item Round, in OpenInput) bool {
	return item.RoundKey == in.RoundKey && item.UserID == in.UserID && item.GameID == in.GameID && item.StakeMinor == in.StakeMinor
}

func Settle(ctx context.Context, db *sql.DB, in SettleInput) (Round, error) {
	in.RoundID = strings.TrimSpace(in.RoundID)
	in.EngineReference = strings.TrimSpace(in.EngineReference)
	if in.RoundID == "" || in.WinMinor < 0 || !money.IsSafeMinor(in.WinMinor) || in.MultiplierHundredths < 0 || int64(in.MultiplierHundredths) > 1<<31-1 || !validResultData(in.ResultData) {
		return Round{}, ErrInvalidOutcome
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Round{}, fmt.Errorf("round: begin settle: %w", err)
	}
	defer tx.Rollback()

	item, err := lockForLifecycle(ctx, tx, in.RoundID)
	if err != nil {
		return Round{}, err
	}
	if item.Status == StatusSettled {
		return item, ErrRoundSettled
	}
	if item.Status != StatusOpen {
		return item, ErrRoundClosed
	}
	if in.WinMinor > 0 {
		if _, err := wallet.MoveTx(ctx, tx, wallet.Movement{
			UserID:         item.UserID,
			Currency:       item.Currency,
			Kind:           "win",
			AmountMinor:    in.WinMinor,
			IdempotencyKey: "round:" + item.ID + ":win",
			ReferenceType:  "round",
			ReferenceID:    item.ID,
			Reason:         "round win",
		}); err != nil {
			return Round{}, err
		}
	}

	settled, err := updateSettled(ctx, tx, in)
	if err != nil {
		return Round{}, err
	}
	if err := tx.Commit(); err != nil {
		return Round{}, fmt.Errorf("round: commit settle: %w", err)
	}
	return settled, nil
}

func Cancel(ctx context.Context, db *sql.DB, in TerminateInput) (Round, error) {
	return terminate(ctx, db, in, StatusCancelled)
}

func Fail(ctx context.Context, db *sql.DB, in TerminateInput) (Round, error) {
	return terminate(ctx, db, in, StatusFailed)
}

func terminate(ctx context.Context, db *sql.DB, in TerminateInput, status string) (Round, error) {
	in.RoundID = strings.TrimSpace(in.RoundID)
	in.EngineReference = strings.TrimSpace(in.EngineReference)
	if in.RoundID == "" || !validResultData(in.ResultData) {
		return Round{}, ErrInvalidOutcome
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Round{}, fmt.Errorf("round: begin %s: %w", status, err)
	}
	defer tx.Rollback()

	item, err := lockForLifecycle(ctx, tx, in.RoundID)
	if err != nil {
		return Round{}, err
	}
	if item.Status == status {
		return item, nil
	}
	if item.Status != StatusOpen {
		return item, ErrRoundClosed
	}
	if _, err := wallet.MoveTx(ctx, tx, wallet.Movement{
		UserID:         item.UserID,
		Currency:       item.Currency,
		Kind:           "refund",
		AmountMinor:    item.StakeMinor,
		IdempotencyKey: "round:" + item.ID + ":refund",
		ReferenceType:  "round",
		ReferenceID:    item.ID,
		Reason:         "round " + status + " refund",
	}); err != nil {
		return Round{}, err
	}

	terminated, err := updateTerminated(ctx, tx, in, status)
	if err != nil {
		return Round{}, err
	}
	if err := tx.Commit(); err != nil {
		return Round{}, fmt.Errorf("round: commit %s: %w", status, err)
	}
	return terminated, nil
}

func lockForLifecycle(ctx context.Context, tx *sql.Tx, roundID string) (Round, error) {
	preview, err := findByID(ctx, tx, roundID)
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, ErrNotFound
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: find for lifecycle: %w", err)
	}
	walletID, err := lockWallet(ctx, tx, preview.UserID, preview.Currency)
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, wallet.ErrNotFound
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: lock lifecycle wallet: %w", err)
	}
	if walletID != preview.WalletID {
		return Round{}, wallet.ErrNotFound
	}

	item, err := lockByID(ctx, tx, roundID)
	if errors.Is(err, sql.ErrNoRows) {
		return Round{}, ErrNotFound
	}
	if err != nil {
		return Round{}, fmt.Errorf("round: lock for lifecycle: %w", err)
	}
	return item, nil
}

func validResultData(data json.RawMessage) bool {
	return len(data) == 0 || json.Valid(data)
}
