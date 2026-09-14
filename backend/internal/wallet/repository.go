package wallet

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/money"
)

var (
	ErrNotFound          = errors.New("wallet: not found")
	ErrCurrencyDisabled  = errors.New("wallet: currency is disabled")
	ErrWalletFrozen      = errors.New("wallet: wallet is frozen")
	ErrWalletClosed      = errors.New("wallet: wallet is closed")
	ErrInsufficientFunds = errors.New("wallet: insufficient funds")
	ErrCurrencyMismatch  = errors.New("wallet: currency mismatch")
	ErrAmountOverflow    = errors.New("wallet: amount overflow")
)

type Wallet struct {
	ID           string
	UserID       string
	Currency     string
	BalanceMinor int64
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Transaction struct {
	ID, WalletID, UserID, Currency, Kind     string
	AmountMinor, BalanceBefore, BalanceAfter int64
	ReferenceType, ReferenceID, Reason       string
	ActorUserID, ActorDisplayName            string
	CreatedAt                                time.Time
}

type TransactionFilter struct {
	Page     int
	Size     int
	Currency string
	Kind     string
	From     *time.Time
	To       *time.Time
}

func ListTransactions(ctx context.Context, db *sql.DB, userID string, filter TransactionFilter) ([]Transaction, int, error) {
	args := []any{userID, filter.Currency, filter.Kind, filter.From, filter.To}
	where := `WHERE user_id = ($1::text)::uuid
	      AND ($2 = '' OR currency = $2)
	      AND ($3 = '' OR kind = $3)
	      AND ($4::timestamptz IS NULL OR created_at >= $4::timestamptz)
	      AND ($5::timestamptz IS NULL OR created_at <= $5::timestamptz)`
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM wallet_transactions `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("wallet: count transactions: %w", err)
	}
	args = append(args, filter.Size, (filter.Page-1)*filter.Size)
	rows, err := db.QueryContext(ctx, `SELECT id::text, wallet_id::text, user_id::text, currency, kind, amount_minor, balance_before, balance_after, COALESCE(reason, ''), created_at FROM wallet_transactions `+where+` ORDER BY created_at DESC, id DESC LIMIT $6 OFFSET $7`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("wallet: list transactions: %w", err)
	}
	defer rows.Close()
	result := make([]Transaction, 0)
	for rows.Next() {
		var item Transaction
		if err := rows.Scan(&item.ID, &item.WalletID, &item.UserID, &item.Currency, &item.Kind, &item.AmountMinor, &item.BalanceBefore, &item.BalanceAfter, &item.Reason, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("wallet: scan transaction: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("wallet: transaction rows: %w", err)
	}
	return result, total, nil
}

type AdminTransactionFilter struct {
	Page     int
	Size     int
	UserID   string
	Currency string
	Kind     string
	From     *time.Time
	To       *time.Time
}

func ListAdminTransactions(ctx context.Context, db *sql.DB, filter AdminTransactionFilter) ([]Transaction, int, error) {
	args := []any{filter.UserID, filter.Currency, filter.Kind, filter.From, filter.To}
	where := `WHERE (NULLIF($1, '')::uuid IS NULL OR wt.user_id = NULLIF($1, '')::uuid)
	      AND ($2 = '' OR wt.currency = $2)
	      AND ($3 = '' OR wt.kind = $3)
	      AND ($4::timestamptz IS NULL OR wt.created_at >= $4::timestamptz)
	      AND ($5::timestamptz IS NULL OR wt.created_at <= $5::timestamptz)`
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM wallet_transactions wt `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("wallet: count admin transactions: %w", err)
	}
	args = append(args, filter.Size, (filter.Page-1)*filter.Size)
	rows, err := db.QueryContext(ctx, `SELECT wt.id::text, wt.wallet_id::text, wt.user_id::text, wt.currency, wt.kind, wt.amount_minor, wt.balance_before, wt.balance_after, COALESCE(wt.reason, ''), COALESCE(wt.actor_user_id::text, ''), COALESCE(actor.display_name, ''), wt.created_at FROM wallet_transactions wt LEFT JOIN users actor ON actor.id = wt.actor_user_id `+where+` ORDER BY wt.created_at DESC, wt.id DESC LIMIT $6 OFFSET $7`, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("wallet: list admin transactions: %w", err)
	}
	defer rows.Close()
	result := make([]Transaction, 0)
	for rows.Next() {
		var item Transaction
		if err := rows.Scan(&item.ID, &item.WalletID, &item.UserID, &item.Currency, &item.Kind, &item.AmountMinor, &item.BalanceBefore, &item.BalanceAfter, &item.Reason, &item.ActorUserID, &item.ActorDisplayName, &item.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("wallet: scan admin transaction: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("wallet: admin transaction rows: %w", err)
	}
	return result, total, nil
}

const walletColumns = `id::text, user_id::text, currency, balance_minor, status, created_at, updated_at`

func provision(ctx context.Context, tx *sql.Tx, userID string) error {
	_, err := tx.ExecContext(ctx, `
		INSERT INTO wallets (user_id, currency)
		SELECT ($1::text)::uuid, code FROM currencies WHERE enabled = true
		ON CONFLICT (user_id, currency) DO NOTHING`, userID)
	if err != nil {
		return fmt.Errorf("wallet: provision: %w", err)
	}
	return nil
}

func List(ctx context.Context, db *sql.DB, userID string) ([]Wallet, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("wallet: begin provision: %w", err)
	}
	defer tx.Rollback()
	if err := provision(ctx, tx, userID); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT `+walletColumns+` FROM wallets WHERE user_id = ($1::text)::uuid ORDER BY currency`, userID)
	if err != nil {
		return nil, fmt.Errorf("wallet: list: %w", err)
	}
	defer rows.Close()
	result, err := scanWallets(rows)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("wallet: commit provision: %w", err)
	}
	return result, nil
}

func Get(ctx context.Context, db *sql.DB, userID, currency string) (Wallet, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Wallet{}, fmt.Errorf("wallet: begin provision: %w", err)
	}
	defer tx.Rollback()
	if err := provision(ctx, tx, userID); err != nil {
		return Wallet{}, err
	}
	var w Wallet
	err = tx.QueryRowContext(ctx, `SELECT `+walletColumns+` FROM wallets WHERE user_id = ($1::text)::uuid AND currency = $2`, userID, currency).Scan(&w.ID, &w.UserID, &w.Currency, &w.BalanceMinor, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Wallet{}, ErrCurrencyDisabled
	}
	if err != nil {
		return Wallet{}, fmt.Errorf("wallet: get: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Wallet{}, fmt.Errorf("wallet: commit provision: %w", err)
	}
	return w, nil
}

type Movement struct {
	UserID         string
	Currency       string
	Kind           string
	AmountMinor    int64
	IdempotencyKey string
	ReferenceType  string
	ReferenceID    string
	ActorID        string
	Reason         string
}

func Move(ctx context.Context, db *sql.DB, userID, currency, kind string, amountMinor int64, idempotencyKey, reason string) (Transaction, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: begin movement: %w", err)
	}
	defer tx.Rollback()

	result, err := MoveTx(ctx, tx, Movement{
		UserID: userID, Currency: currency, Kind: kind, AmountMinor: amountMinor,
		IdempotencyKey: idempotencyKey, Reason: reason,
	})
	if err != nil {
		return Transaction{}, err
	}
	if err := tx.Commit(); err != nil {
		return Transaction{}, fmt.Errorf("wallet: commit movement: %w", err)
	}
	return result, nil
}

func Adjust(ctx context.Context, db *sql.DB, actorID, userID, currency, direction string, amountMinor int64, reason string) (Transaction, error) {
	if amountMinor <= 0 {
		return Transaction{}, errors.New("wallet: adjustment amount must be positive")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return Transaction{}, errors.New("wallet: adjustment reason is required")
	}
	action := "wallet.credit"
	switch direction {
	case "credit":
	case "debit":
		amountMinor = -amountMinor
		action = "wallet.debit"
	default:
		return Transaction{}, errors.New("wallet: adjustment direction is invalid")
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: begin adjustment: %w", err)
	}
	defer tx.Rollback()

	if err := provision(ctx, tx, userID); err != nil {
		return Transaction{}, err
	}
	result, err := MoveTx(ctx, tx, Movement{
		UserID: userID, Currency: currency, Kind: "adjustment", AmountMinor: amountMinor,
		ActorID: actorID, Reason: reason,
	})
	if err != nil {
		return Transaction{}, err
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "wallet", EntityID: result.WalletID, Detail: reason,
		Before: map[string]int64{"balance_minor": result.BalanceBefore},
		After:  map[string]int64{"balance_minor": result.BalanceAfter},
	}); err != nil {
		return Transaction{}, err
	}
	if err := tx.Commit(); err != nil {
		return Transaction{}, fmt.Errorf("wallet: commit adjustment: %w", err)
	}
	return result, nil
}

const transactionColumns = `id::text, wallet_id::text, user_id::text, currency, kind, amount_minor, balance_before, balance_after, COALESCE(reference_type, ''), COALESCE(reference_id::text, ''), COALESCE(reason, ''), COALESCE(actor_user_id::text, ''), created_at`

func MoveTx(ctx context.Context, tx *sql.Tx, m Movement) (Transaction, error) {
	if m.AmountMinor == 0 {
		return Transaction{}, errors.New("wallet: amount must not be zero")
	}

	var w Wallet
	err := tx.QueryRowContext(ctx, `SELECT `+walletColumns+` FROM wallets WHERE user_id = ($1::text)::uuid AND currency = $2 FOR UPDATE`, m.UserID, m.Currency).
		Scan(&w.ID, &w.UserID, &w.Currency, &w.BalanceMinor, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Transaction{}, ErrNotFound
	}
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: lock: %w", err)
	}
	if err := validateMovementCurrency(w, m.Currency); err != nil {
		return Transaction{}, err
	}

	if m.IdempotencyKey != "" {
		existing, err := scanTransaction(tx.QueryRowContext(ctx, `SELECT `+transactionColumns+` FROM wallet_transactions WHERE wallet_id = ($1::text)::uuid AND idempotency_key = $2`, w.ID, m.IdempotencyKey))
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return Transaction{}, fmt.Errorf("wallet: find idempotent movement: %w", err)
		}
	}

	if w.Status == "frozen" {
		return Transaction{}, ErrWalletFrozen
	}
	if w.Status == "closed" {
		return Transaction{}, ErrWalletClosed
	}
	if !money.IsSafeMinor(w.BalanceMinor) || !money.IsSafeMinor(m.AmountMinor) {
		return Transaction{}, ErrAmountOverflow
	}
	if m.AmountMinor < 0 && w.BalanceMinor < -m.AmountMinor {
		return Transaction{}, ErrInsufficientFunds
	}

	after := w.BalanceMinor + m.AmountMinor
	if !money.IsSafeMinor(after) {
		return Transaction{}, ErrAmountOverflow
	}
	if _, err := tx.ExecContext(ctx, `UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = ($2::text)::uuid`, after, w.ID); err != nil {
		return Transaction{}, fmt.Errorf("wallet: update balance: %w", err)
	}
	result, err := scanTransaction(tx.QueryRowContext(ctx, `
		INSERT INTO wallet_transactions (wallet_id, user_id, currency, kind, amount_minor, balance_before, balance_after,
			reference_type, reference_id, idempotency_key, actor_user_id, reason)
		VALUES (($1::text)::uuid, ($2::text)::uuid, $3, $4, $5, $6, $7,
			NULLIF($8, ''), NULLIF($9, '')::uuid, NULLIF($10, ''), NULLIF($11, '')::uuid, NULLIF($12, ''))
		RETURNING `+transactionColumns,
		w.ID, m.UserID, m.Currency, m.Kind, m.AmountMinor, w.BalanceMinor, after,
		m.ReferenceType, m.ReferenceID, m.IdempotencyKey, m.ActorID, m.Reason))
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: insert movement: %w", err)
	}
	return result, nil
}

func scanTransaction(row *sql.Row) (Transaction, error) {
	var item Transaction
	err := row.Scan(&item.ID, &item.WalletID, &item.UserID, &item.Currency, &item.Kind,
		&item.AmountMinor, &item.BalanceBefore, &item.BalanceAfter,
		&item.ReferenceType, &item.ReferenceID, &item.Reason, &item.ActorUserID, &item.CreatedAt)
	return item, err
}

func validateMovementCurrency(wallet Wallet, movementCurrency string) error {
	if wallet.Currency != movementCurrency {
		return ErrCurrencyMismatch
	}
	return nil
}

func scanWallets(rows *sql.Rows) ([]Wallet, error) {
	result := make([]Wallet, 0)
	for rows.Next() {
		var w Wallet
		if err := rows.Scan(&w.ID, &w.UserID, &w.Currency, &w.BalanceMinor, &w.Status, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, fmt.Errorf("wallet: scan: %w", err)
		}
		result = append(result, w)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("wallet: rows: %w", err)
	}
	return result, nil
}
