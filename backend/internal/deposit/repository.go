package deposit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/gaming-platform/backend/internal/wallet"
)

var (
	ErrNotFound                = errors.New("deposit: not found")
	ErrInvalidMethod           = errors.New("deposit: payment method is unavailable")
	ErrInvalidCurrency         = errors.New("deposit: currency is unavailable")
	ErrAmountOutOfRange        = errors.New("deposit: amount is outside the allowed range")
	ErrReferenceRequired       = errors.New("deposit: reference is required")
	ErrRejectionReasonRequired = errors.New("deposit: rejection reason is required")
	ErrApprovalReasonRequired  = errors.New("deposit: approval adjustment reason is required")
	ErrAlreadyReviewed         = errors.New("deposit: request is already reviewed")
	ErrWalletUnavailable       = errors.New("deposit: wallet is unavailable")
	ErrAmountOverflow          = errors.New("deposit: amount overflow")
)

type PaymentMethod struct {
	ID                string
	Name              string
	Description       string
	PayTo             string
	ReferenceRequired bool
}

type Request struct {
	ID          string
	UserID      string
	WalletID    string
	Currency    string
	MethodID    string
	MethodName  string
	AmountMinor int64
	Reference   string
	Status      string
	ReviewedAt  *time.Time
	Reason      string
	CreatedAt   time.Time
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
}

func ListMethods(ctx context.Context, db *sql.DB) ([]PaymentMethod, error) {
	rows, err := db.QueryContext(ctx, `SELECT id::text, name, description, pay_to, reference_required FROM payment_methods WHERE enabled = true ORDER BY sort_order, name`)
	if err != nil {
		return nil, fmt.Errorf("deposit: list methods: %w", err)
	}
	defer rows.Close()
	result := make([]PaymentMethod, 0)
	for rows.Next() {
		var item PaymentMethod
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.PayTo, &item.ReferenceRequired); err != nil {
			return nil, fmt.Errorf("deposit: scan method: %w", err)
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

const requestColumns = `d.id::text, d.user_id::text, d.wallet_id::text, d.currency, d.method_id::text, p.name, d.amount_minor, COALESCE(d.reference, ''), d.status, d.reviewed_at, COALESCE(d.reason, ''), d.created_at`

func List(ctx context.Context, db *sql.DB, userID, status string, page, size int) ([]Request, int, error) {
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM deposit_requests WHERE user_id = ($1::text)::uuid AND ($2 = '' OR status = $2)`, userID, status).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("deposit: count requests: %w", err)
	}
	rows, err := db.QueryContext(ctx, `SELECT `+requestColumns+` FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id WHERE d.user_id = ($1::text)::uuid AND ($2 = '' OR d.status = $2) ORDER BY d.created_at DESC, d.id DESC LIMIT $3 OFFSET $4`, userID, status, size, (page-1)*size)
	if err != nil {
		return nil, 0, fmt.Errorf("deposit: list requests: %w", err)
	}
	defer rows.Close()
	items, err := scanRequests(rows)
	return items, total, err
}

func Get(ctx context.Context, db *sql.DB, userID, id string) (Request, error) {
	var item Request
	err := db.QueryRowContext(ctx, `SELECT `+requestColumns+` FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id WHERE d.user_id = ($1::text)::uuid AND d.id = ($2::text)::uuid`, userID, id).Scan(
		&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("deposit: get request: %w", err)
	}
	return item, nil
}

func GetByIdempotencyKey(ctx context.Context, db *sql.DB, userID, key string) (Request, error) {
	var item Request
	err := db.QueryRowContext(ctx, `SELECT `+requestColumns+` FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id WHERE d.user_id = ($1::text)::uuid AND d.idempotency_key = $2`, userID, key).Scan(
		&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("deposit: get idempotent request: %w", err)
	}
	return item, nil
}

func ProofPath(ctx context.Context, db *sql.DB, id string) (string, error) {
	var path sql.NullString
	err := db.QueryRowContext(ctx, `SELECT proof_path FROM deposit_requests WHERE id = ($1::text)::uuid`, id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) || !path.Valid || path.String == "" {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("deposit: proof path: %w", err)
	}
	return path.String, nil
}

func Create(ctx context.Context, db *sql.DB, userID, methodID, currency string, amountMinor int64, reference, proofPath, idempotencyKey string) (Request, bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Request{}, false, fmt.Errorf("deposit: begin create: %w", err)
	}
	defer tx.Rollback()
	var walletID string
	var minMinor, maxMinor int64
	err = tx.QueryRowContext(ctx, `SELECT w.id::text, c.deposit_min_minor, c.deposit_max_minor FROM wallets w JOIN currencies c ON c.code = w.currency WHERE w.user_id = ($1::text)::uuid AND w.currency = $2 AND c.enabled = true`, userID, currency).Scan(&walletID, &minMinor, &maxMinor)
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, false, ErrInvalidCurrency
	}
	if err != nil {
		return Request{}, false, fmt.Errorf("deposit: validate wallet: %w", err)
	}
	if amountMinor < minMinor || amountMinor > maxMinor {
		return Request{}, false, ErrAmountOutOfRange
	}
	var methodEnabled, referenceRequired bool
	err = tx.QueryRowContext(ctx, `SELECT enabled, reference_required FROM payment_methods WHERE id = ($1::text)::uuid`, methodID).Scan(&methodEnabled, &referenceRequired)
	if errors.Is(err, sql.ErrNoRows) || !methodEnabled {
		return Request{}, false, ErrInvalidMethod
	}
	if referenceRequired && reference == "" {
		return Request{}, false, ErrReferenceRequired
	}
	var item Request
	created := true
	err = tx.QueryRowContext(ctx, `INSERT INTO deposit_requests (user_id, wallet_id, currency, method_id, amount_minor, reference, proof_path, idempotency_key) VALUES (($1::text)::uuid, ($2::text)::uuid, $3, ($4::text)::uuid, $5, NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, '')) ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id::text, user_id::text, wallet_id::text, currency, method_id::text, (SELECT name FROM payment_methods WHERE id = deposit_requests.method_id), amount_minor, COALESCE(reference, ''), status, reviewed_at, COALESCE(reason, ''), created_at`, userID, walletID, currency, methodID, amountMinor, reference, proofPath, idempotencyKey).Scan(&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) && idempotencyKey != "" {
		created = false
		err = tx.QueryRowContext(ctx, `SELECT `+requestColumns+` FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id WHERE d.user_id = ($1::text)::uuid AND d.idempotency_key = $2`, userID, idempotencyKey).Scan(&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt)
	}
	if err != nil {
		return Request{}, false, fmt.Errorf("deposit: create request: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return Request{}, false, fmt.Errorf("deposit: commit create: %w", err)
	}
	return item, created, nil
}

func scanRequests(rows *sql.Rows) ([]Request, error) {
	result := make([]Request, 0)
	for rows.Next() {
		var item Request
		if err := rows.Scan(&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("deposit: scan request: %w", err)
		}
		result = append(result, item)
	}
	return result, rows.Err()
}

func ListAdmin(ctx context.Context, db *sql.DB, filter AdminListFilter) ([]AdminRequest, int, error) {
	where := `WHERE (NULLIF($1, '')::uuid IS NULL OR d.user_id = NULLIF($1, '')::uuid)
		AND ($2 = '' OR d.status = $2)`
	var total int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM deposit_requests d `+where, filter.UserID, filter.Status).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("deposit: count admin list: %w", err)
	}
	offset := int64(filter.Page-1) * int64(filter.Size)
	rows, err := db.QueryContext(ctx, `SELECT d.id::text, d.user_id::text, d.wallet_id::text, d.currency, d.method_id::text, p.name, d.amount_minor, COALESCE(d.reference, ''), d.status, d.reviewed_at, COALESCE(d.reason, ''), d.created_at, u.email, u.display_name FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id JOIN users u ON u.id = d.user_id `+where+` ORDER BY d.created_at ASC, d.id ASC LIMIT $3 OFFSET $4`, filter.UserID, filter.Status, filter.Size, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("deposit: admin list: %w", err)
	}
	defer rows.Close()
	result := make([]AdminRequest, 0)
	for rows.Next() {
		var item AdminRequest
		if err := rows.Scan(&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt, &item.UserEmail, &item.DisplayName); err != nil {
			return nil, 0, fmt.Errorf("deposit: scan pending: %w", err)
		}
		result = append(result, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return result, total, nil
}

func Review(ctx context.Context, db *sql.DB, actorID, requestID, action string, amountMinor int64, reason string) (Request, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return Request{}, fmt.Errorf("deposit: begin review: %w", err)
	}
	defer tx.Rollback()
	var item Request
	err = tx.QueryRowContext(ctx, `SELECT `+requestColumns+` FROM deposit_requests d JOIN payment_methods p ON p.id = d.method_id WHERE d.id = ($1::text)::uuid FOR UPDATE`, requestID).Scan(&item.ID, &item.UserID, &item.WalletID, &item.Currency, &item.MethodID, &item.MethodName, &item.AmountMinor, &item.Reference, &item.Status, &item.ReviewedAt, &item.Reason, &item.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return Request{}, ErrNotFound
	}
	if err != nil {
		return Request{}, fmt.Errorf("deposit: lock request: %w", err)
	}
	if item.Status != "pending" {
		return item, ErrAlreadyReviewed
	}
	originalAmount := item.AmountMinor
	if action == "approve" && amountMinor > 0 {
		item.AmountMinor = amountMinor
	}
	reason = strings.TrimSpace(reason)
	if action == "approve" && item.AmountMinor != originalAmount && reason == "" {
		return Request{}, ErrApprovalReasonRequired
	}
	if action == "reject" {
		if reason == "" {
			return Request{}, ErrRejectionReasonRequired
		}
		if _, err := tx.ExecContext(ctx, `UPDATE deposit_requests SET status = 'rejected', reviewed_by = ($1::text)::uuid, reviewed_at = now(), reason = $2, updated_at = now() WHERE id = ($3::text)::uuid`, actorID, reason, requestID); err != nil {
			return Request{}, fmt.Errorf("deposit: reject request: %w", err)
		}
		if err := writeAudit(ctx, tx, actorID, requestID, "deposit.reject", item.Status, "rejected", originalAmount, originalAmount, reason); err != nil {
			return Request{}, err
		}
	} else if action == "approve" {
		var minMinor, maxMinor int64
		if err := tx.QueryRowContext(ctx, `SELECT deposit_min_minor, deposit_max_minor FROM currencies WHERE code = $1`, item.Currency).Scan(&minMinor, &maxMinor); err != nil {
			return Request{}, fmt.Errorf("deposit: read limits: %w", err)
		}
		if item.AmountMinor < minMinor || item.AmountMinor > maxMinor {
			return Request{}, ErrAmountOutOfRange
		}
		credit, err := wallet.MoveTx(ctx, tx, wallet.Movement{
			UserID: item.UserID, Currency: item.Currency, Kind: "deposit", AmountMinor: item.AmountMinor,
			IdempotencyKey: "deposit:" + requestID, ReferenceType: "deposit", ReferenceID: requestID,
			ActorID: actorID, Reason: "deposit approval",
		})
		switch {
		case errors.Is(err, wallet.ErrNotFound), errors.Is(err, wallet.ErrWalletFrozen), errors.Is(err, wallet.ErrWalletClosed):
			return Request{}, ErrWalletUnavailable
		case errors.Is(err, wallet.ErrAmountOverflow):
			return Request{}, ErrAmountOverflow
		case err != nil:
			return Request{}, err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE deposit_requests SET status = 'approved', reviewed_by = ($1::text)::uuid, reviewed_at = now(), transaction_id = ($2::text)::uuid, amount_minor = $3, reason = NULLIF($4, ''), updated_at = now() WHERE id = ($5::text)::uuid`, actorID, credit.ID, item.AmountMinor, reason, requestID); err != nil {
			return Request{}, fmt.Errorf("deposit: approve request: %w", err)
		}
		if err := writeAudit(ctx, tx, actorID, requestID, "deposit.approve", item.Status, "approved", originalAmount, item.AmountMinor, reason); err != nil {
			return Request{}, err
		}
	} else {
		return Request{}, errors.New("deposit: review action is invalid")
	}
	if err := tx.Commit(); err != nil {
		return Request{}, fmt.Errorf("deposit: commit review: %w", err)
	}
	return Get(ctx, db, item.UserID, item.ID)
}

func writeAudit(ctx context.Context, tx *sql.Tx, actorID, entityID, action, beforeStatus, afterStatus string, beforeAmount, afterAmount int64, detail string) error {
	return audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "deposit_request", EntityID: entityID, Detail: detail,
		Before: map[string]any{"status": beforeStatus, "amount_minor": beforeAmount},
		After:  map[string]any{"status": afterStatus, "amount_minor": afterAmount},
	})
}
