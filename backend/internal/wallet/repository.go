package wallet

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"
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

func ListTransactions(ctx context.Context, db *sql.DB, userID, currency string, page, size int) ([]Transaction, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND ($2 = '' OR currency = $2)`, userID, currency).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("wallet: count transactions: %w", err)
	}
	rows, err := db.QueryContext(ctx, `SELECT id::text, wallet_id::text, user_id::text, currency, kind, amount_minor, balance_before, balance_after, COALESCE(reason, ''), created_at FROM wallet_transactions WHERE user_id = ($1::text)::uuid AND ($2 = '' OR currency = $2) ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`, userID, currency, size, (page-1)*size)
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

// Move atomically changes a wallet and appends its immutable ledger row.
// amountMinor is signed: positive credits, negative debits.
func Move(ctx context.Context, db *sql.DB, userID, currency, kind string, amountMinor int64, idempotencyKey, reason string) (Transaction, error) {
	return move(ctx, db, userID, currency, kind, amountMinor, idempotencyKey, "", reason, false)
}

// Adjust atomically changes a user's wallet, records the acting administrator,
// and appends the corresponding audit record.
func Adjust(ctx context.Context, db *sql.DB, actorID, userID, currency, direction string, amountMinor int64, reason string) (Transaction, error) {
	if amountMinor <= 0 {
		return Transaction{}, errors.New("wallet: adjustment amount must be positive")
	}
	if strings.TrimSpace(reason) == "" {
		return Transaction{}, errors.New("wallet: adjustment reason is required")
	}
	if direction != "credit" && direction != "debit" {
		return Transaction{}, errors.New("wallet: adjustment direction is invalid")
	}
	if direction == "debit" {
		amountMinor = -amountMinor
	}
	kind := "adjustment"
	return move(ctx, db, userID, currency, kind, amountMinor, "", actorID, strings.TrimSpace(reason), true)
}

func move(ctx context.Context, db *sql.DB, userID, currency, kind string, amountMinor int64, idempotencyKey, actorID, reason string, audit bool) (Transaction, error) {
	if amountMinor == 0 {
		return Transaction{}, errors.New("wallet: amount must not be zero")
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: begin movement: %w", err)
	}
	defer tx.Rollback()
	if audit {
		if err := provision(ctx, tx, userID); err != nil {
			return Transaction{}, err
		}
	}
	var w Wallet
	err = tx.QueryRowContext(ctx, `SELECT `+walletColumns+` FROM wallets WHERE user_id = ($1::text)::uuid AND currency = $2 FOR UPDATE`, userID, currency).Scan(&w.ID, &w.UserID, &w.Currency, &w.BalanceMinor, &w.Status, &w.CreatedAt, &w.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Transaction{}, ErrNotFound
	}
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: lock: %w", err)
	}
	if err := validateMovementCurrency(w, currency); err != nil {
		return Transaction{}, err
	}
	if idempotencyKey != "" {
		var existing Transaction
		err = tx.QueryRowContext(ctx, `SELECT id::text, wallet_id::text, user_id::text, currency, kind, amount_minor, balance_before, balance_after, COALESCE(reason, ''), created_at FROM wallet_transactions WHERE wallet_id = ($1::text)::uuid AND idempotency_key = $2`, w.ID, idempotencyKey).Scan(&existing.ID, &existing.WalletID, &existing.UserID, &existing.Currency, &existing.Kind, &existing.AmountMinor, &existing.BalanceBefore, &existing.BalanceAfter, &existing.Reason, &existing.CreatedAt)
		if err == nil {
			if err := tx.Commit(); err != nil {
				return Transaction{}, fmt.Errorf("wallet: commit idempotent movement: %w", err)
			}
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
	if amountMinor > 0 && w.BalanceMinor > math.MaxInt64-amountMinor {
		return Transaction{}, ErrAmountOverflow
	}
	if amountMinor == math.MinInt64 || (amountMinor < 0 && w.BalanceMinor < -amountMinor) {
		return Transaction{}, ErrInsufficientFunds
	}
	after := w.BalanceMinor + amountMinor
	if _, err = tx.ExecContext(ctx, `UPDATE wallets SET balance_minor = $1, updated_at = now() WHERE id = ($2::text)::uuid`, after, w.ID); err != nil {
		return Transaction{}, fmt.Errorf("wallet: update balance: %w", err)
	}
	var result Transaction
	actorValue := any(nil)
	if actorID != "" {
		actorValue = actorID
	}
	err = tx.QueryRowContext(ctx, `INSERT INTO wallet_transactions (wallet_id, user_id, currency, kind, amount_minor, balance_before, balance_after, idempotency_key, actor_user_id, reason) VALUES (($1::text)::uuid, ($2::text)::uuid, $3, $4, $5, $6, $7, NULLIF($8, ''), ($9::text)::uuid, NULLIF($10, '')) RETURNING id::text, wallet_id::text, user_id::text, currency, kind, amount_minor, balance_before, balance_after, COALESCE(reason, ''), created_at`, w.ID, userID, currency, kind, amountMinor, w.BalanceMinor, after, idempotencyKey, actorValue, reason).Scan(&result.ID, &result.WalletID, &result.UserID, &result.Currency, &result.Kind, &result.AmountMinor, &result.BalanceBefore, &result.BalanceAfter, &result.Reason, &result.CreatedAt)
	if err != nil {
		return Transaction{}, fmt.Errorf("wallet: insert movement: %w", err)
	}
	if audit {
		before, _ := json.Marshal(map[string]any{"balance_minor": w.BalanceMinor, "status": w.Status})
		afterData, _ := json.Marshal(map[string]any{"balance_minor": after, "status": w.Status})
		if _, err := tx.ExecContext(ctx, `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, detail, before_data, after_data) VALUES (($1::text)::uuid, $2, $3, ($4::text)::uuid, $5, $6::jsonb, $7::jsonb)`, actorID, "wallet."+map[bool]string{true: "credit", false: "debit"}[amountMinor > 0], "wallet", w.ID, reason, string(before), string(afterData)); err != nil {
			return Transaction{}, fmt.Errorf("wallet: insert audit: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return Transaction{}, fmt.Errorf("wallet: commit movement: %w", err)
	}
	return result, nil
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
