package withdrawal

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

type rowQueryer interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

const requestColumns = `r.id::text, r.user_id::text, r.wallet_id::text, r.currency, r.method_id::text, p.name, r.amount_minor,
	r.account_name, r.account_number, r.status, COALESCE(r.payout_reference, ''), COALESCE(r.reason, ''),
	r.reviewed_at, r.cancelled_at, r.created_at`

const requestFrom = ` FROM withdrawal_requests r JOIN payment_methods p ON p.id = r.method_id `

type scanner interface {
	Scan(dest ...any) error
}

func scanRequest(row scanner, extra ...any) (Request, error) {
	var item Request
	dest := []any{
		&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor,
		&item.AccountName, &item.AccountNumber, &item.Status, &item.PayoutReference, &item.Reason,
		&item.ReviewedAt, &item.CancelledAt, &item.CreatedAt,
	}
	err := row.Scan(append(dest, extra...)...)
	return item, err
}

func List(ctx context.Context, db *sql.DB, userID, status string, page, size int) ([]Request, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM withdrawal_requests WHERE user_id = ($1::text)::uuid AND ($2 = '' OR status = $2)`, userID, status).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("withdrawal: count requests: %w", err)
	}
	rows, err := db.QueryContext(ctx, `SELECT `+requestColumns+requestFrom+`WHERE r.user_id = ($1::text)::uuid AND ($2 = '' OR r.status = $2) ORDER BY r.created_at DESC, r.id DESC LIMIT $3 OFFSET $4`, userID, status, size, int64(page-1)*int64(size))
	if err != nil {
		return nil, 0, fmt.Errorf("withdrawal: list requests: %w", err)
	}
	defer rows.Close()
	result := make([]Request, 0)
	for rows.Next() {
		item, err := scanRequest(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("withdrawal: scan request: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("withdrawal: request rows: %w", err)
	}
	return result, total, nil
}

func Get(ctx context.Context, db *sql.DB, userID, id string) (Request, error) {
	item, err := scanRequest(db.QueryRowContext(ctx, `SELECT `+requestColumns+requestFrom+`WHERE r.user_id = ($1::text)::uuid AND r.id = ($2::text)::uuid`, userID, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: get request: %w", err)
	}
	return item, nil
}

func getByID(ctx context.Context, q rowQueryer, id string) (Request, error) {
	item, err := scanRequest(q.QueryRowContext(ctx, `SELECT `+requestColumns+requestFrom+`WHERE r.id = ($1::text)::uuid`, id))
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: read request: %w", err)
	}
	return item, nil
}

func getByIdempotencyKey(ctx context.Context, q rowQueryer, userID, key string) (Request, error) {
	item, err := scanRequest(q.QueryRowContext(ctx, `SELECT `+requestColumns+requestFrom+`WHERE r.user_id = ($1::text)::uuid AND r.idempotency_key = $2`, userID, key))
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: get idempotent request: %w", err)
	}
	return item, nil
}

func ListAdmin(ctx context.Context, db *sql.DB, filter AdminListFilter) ([]AdminRequest, int, error) {
	where := `WHERE (NULLIF($1, '')::uuid IS NULL OR r.user_id = NULLIF($1, '')::uuid)
		AND ($2 = '' OR r.status = $2)
		AND ($3 = ''
			OR position(lower($3) in lower(r.account_name)) > 0
			OR position(lower($3) in lower(r.account_number)) > 0
			OR position(lower($3) in lower(COALESCE(r.payout_reference, ''))) > 0
			OR position(lower($3) in lower(u.email)) > 0
			OR position(lower($3) in lower(r.id::text)) > 0)`
	from := requestFrom + `JOIN users u ON u.id = r.user_id `
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*)`+from+where, filter.UserID, filter.Status, filter.Search).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("withdrawal: count admin list: %w", err)
	}
	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, `SELECT `+requestColumns+`, u.email, u.display_name`+from+where+` ORDER BY r.created_at ASC, r.id ASC LIMIT $4 OFFSET $5`, filter.UserID, filter.Status, filter.Search, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("withdrawal: admin list: %w", err)
	}
	defer rows.Close()
	result := make([]AdminRequest, 0)
	for rows.Next() {
		var item AdminRequest
		request, err := scanRequest(rows, &item.UserEmail, &item.DisplayName)
		if err != nil {
			return nil, 0, fmt.Errorf("withdrawal: scan admin request: %w", err)
		}
		item.Request = request
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("withdrawal: admin rows: %w", err)
	}
	return result, total, nil
}

func lockWallet(ctx context.Context, tx *sql.Tx, userID, currency string) (walletID string, minMinor, maxMinor int64, err error) {
	err = tx.QueryRowContext(ctx, `SELECT w.id::text, c.withdrawal_min_minor, c.withdrawal_max_minor FROM wallets w JOIN currencies c ON c.code = w.currency WHERE w.user_id = ($1::text)::uuid AND w.currency = $2 AND c.enabled = true FOR UPDATE OF w`, userID, currency).Scan(&walletID, &minMinor, &maxMinor)
	if errors.Is(err, sql.ErrNoRows) {
		return "", 0, 0, ErrInvalidCurrency
	}
	if err != nil {
		return "", 0, 0, fmt.Errorf("withdrawal: lock wallet: %w", err)
	}
	return walletID, minMinor, maxMinor, nil
}

func methodEnabled(ctx context.Context, tx *sql.Tx, methodID string) (bool, error) {
	var enabled bool
	err := tx.QueryRowContext(ctx, `SELECT enabled FROM payment_methods WHERE id = ($1::text)::uuid`, methodID).Scan(&enabled)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("withdrawal: read method: %w", err)
	}
	return enabled, nil
}

func hasPending(ctx context.Context, tx *sql.Tx, walletID string) (bool, error) {
	var pending bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM withdrawal_requests WHERE wallet_id = ($1::text)::uuid AND status = 'pending')`, walletID).Scan(&pending); err != nil {
		return false, fmt.Errorf("withdrawal: read pending: %w", err)
	}
	return pending, nil
}

func newID(ctx context.Context, tx *sql.Tx) (string, error) {
	var id string
	if err := tx.QueryRowContext(ctx, `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
		return "", fmt.Errorf("withdrawal: generate id: %w", err)
	}
	return id, nil
}

func insert(ctx context.Context, tx *sql.Tx, id, walletID, holdTransactionID string, in NewRequest) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO withdrawal_requests (id, user_id, wallet_id, currency, method_id, amount_minor, account_name, account_number, idempotency_key, hold_transaction_id)
		VALUES (($1::text)::uuid, ($2::text)::uuid, ($3::text)::uuid, $4, ($5::text)::uuid, $6, $7, $8, $9, ($10::text)::uuid)`,
		id, in.UserID, walletID, in.Currency, in.MethodID, in.AmountMinor, in.AccountName, in.AccountNumber, in.IdempotencyKey, holdTransactionID)
	switch {
	case isUniqueViolation(err, "withdrawal_requests_idempotency_key"):
		return errIdempotencyRace
	case isUniqueViolation(err, "withdrawal_requests_one_pending_per_wallet"):
		return ErrPendingExists
	case err != nil:
		return fmt.Errorf("withdrawal: insert request: %w", err)
	}
	return nil
}

func isUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == constraint
}

func lockRequest(ctx context.Context, tx *sql.Tx, id string) (Request, error) {
	item, err := scanRequest(tx.QueryRowContext(ctx, `SELECT `+requestColumns+requestFrom+`WHERE r.id = ($1::text)::uuid FOR UPDATE OF r`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("withdrawal: lock request: %w", err)
	}
	return item, nil
}

func markApproved(ctx context.Context, tx *sql.Tx, id, actorID, payoutReference string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE withdrawal_requests SET status = 'approved', reviewed_by = ($1::text)::uuid, reviewed_at = now(), payout_reference = $2, updated_at = now() WHERE id = ($3::text)::uuid`, actorID, payoutReference, id); err != nil {
		return fmt.Errorf("withdrawal: approve request: %w", err)
	}
	return nil
}

func markRejected(ctx context.Context, tx *sql.Tx, id, actorID, reason, releaseTransactionID string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE withdrawal_requests SET status = 'rejected', reviewed_by = ($1::text)::uuid, reviewed_at = now(), reason = $2, release_transaction_id = ($3::text)::uuid, updated_at = now() WHERE id = ($4::text)::uuid`, actorID, reason, releaseTransactionID, id); err != nil {
		return fmt.Errorf("withdrawal: reject request: %w", err)
	}
	return nil
}

func markCancelled(ctx context.Context, tx *sql.Tx, id, releaseTransactionID string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE withdrawal_requests SET status = 'cancelled', cancelled_at = now(), release_transaction_id = ($1::text)::uuid, updated_at = now() WHERE id = ($2::text)::uuid`, releaseTransactionID, id); err != nil {
		return fmt.Errorf("withdrawal: cancel request: %w", err)
	}
	return nil
}
