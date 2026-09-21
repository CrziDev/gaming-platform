package deposit

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/gaming-platform/backend/internal/audit"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrMethodNameTaken = errors.New("deposit: payment method name is already taken")

type PaymentMethodInput struct {
	Name              string
	Description       string
	PayTo             string
	ReferenceRequired bool
	Enabled           bool
}

type PaymentMethodPatch struct {
	Name              *string
	Description       *string
	PayTo             *string
	ReferenceRequired *bool
	Enabled           *bool
}

const adminMethodColumns = `id::text, name, description, pay_to, reference_required, enabled, sort_order, created_at, updated_at`

func ListAdminMethods(ctx context.Context, db *sql.DB) ([]PaymentMethod, error) {
	rows, err := db.QueryContext(ctx, `SELECT `+adminMethodColumns+` FROM payment_methods ORDER BY sort_order, name`)
	if err != nil {
		return nil, fmt.Errorf("deposit: list admin payment methods: %w", err)
	}
	defer rows.Close()

	items := make([]PaymentMethod, 0)
	for rows.Next() {
		item, err := scanAdminMethod(rows)
		if err != nil {
			return nil, fmt.Errorf("deposit: scan admin payment method: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func CreatePaymentMethod(ctx context.Context, db *sql.DB, actorID string, in PaymentMethodInput) (PaymentMethod, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: begin create payment method: %w", err)
	}
	defer tx.Rollback()

	item, err := scanAdminMethod(tx.QueryRowContext(ctx, `
		INSERT INTO payment_methods (name, description, pay_to, reference_required, enabled, sort_order)
		SELECT $1, $2, $3, $4, $5, COALESCE(MAX(sort_order), 0) + 10
		FROM payment_methods
		RETURNING `+adminMethodColumns,
		in.Name, in.Description, in.PayTo, in.ReferenceRequired, in.Enabled,
	))
	if isMethodNameConflict(err) {
		return PaymentMethod{}, ErrMethodNameTaken
	}
	if err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: create payment method: %w", err)
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: "payment_method.create", EntityType: "payment_method", EntityID: item.ID,
		Detail: "Created payment method " + item.Name, After: paymentMethodSnapshot(item),
	}); err != nil {
		return PaymentMethod{}, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: commit create payment method: %w", err)
	}
	return item, nil
}

func UpdatePaymentMethod(ctx context.Context, db *sql.DB, actorID, id string, patch PaymentMethodPatch) (PaymentMethod, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: begin update payment method: %w", err)
	}
	defer tx.Rollback()

	current, err := scanAdminMethod(tx.QueryRowContext(ctx, `SELECT `+adminMethodColumns+` FROM payment_methods WHERE id = ($1::text)::uuid FOR UPDATE`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return PaymentMethod{}, ErrNotFound
	}
	if err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: lock payment method: %w", err)
	}

	next := current
	if patch.Name != nil {
		next.Name = *patch.Name
	}
	if patch.Description != nil {
		next.Description = *patch.Description
	}
	if patch.PayTo != nil {
		next.PayTo = *patch.PayTo
	}
	if patch.ReferenceRequired != nil {
		next.ReferenceRequired = *patch.ReferenceRequired
	}
	if patch.Enabled != nil {
		next.Enabled = *patch.Enabled
	}

	updated, err := scanAdminMethod(tx.QueryRowContext(ctx, `
		UPDATE payment_methods
		SET name = $2, description = $3, pay_to = $4, reference_required = $5,
			enabled = $6, updated_at = now()
		WHERE id = ($1::text)::uuid
		RETURNING `+adminMethodColumns,
		id, next.Name, next.Description, next.PayTo, next.ReferenceRequired, next.Enabled,
	))
	if isMethodNameConflict(err) {
		return PaymentMethod{}, ErrMethodNameTaken
	}
	if err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: update payment method: %w", err)
	}

	action := "payment_method.update"
	detail := "Updated payment method " + updated.Name
	if current.Enabled != updated.Enabled {
		action = "payment_method.status_change"
		if updated.Enabled {
			detail = "Enabled payment method " + updated.Name
		} else {
			detail = "Disabled payment method " + updated.Name
		}
	}
	if err := audit.Record(ctx, tx, audit.Change{
		ActorID: actorID, Action: action, EntityType: "payment_method", EntityID: id, Detail: detail,
		Before: paymentMethodSnapshot(current), After: paymentMethodSnapshot(updated),
	}); err != nil {
		return PaymentMethod{}, err
	}
	if err := tx.Commit(); err != nil {
		return PaymentMethod{}, fmt.Errorf("deposit: commit update payment method: %w", err)
	}
	return updated, nil
}

type methodScanner interface {
	Scan(dest ...any) error
}

func scanAdminMethod(row methodScanner) (PaymentMethod, error) {
	var item PaymentMethod
	err := row.Scan(
		&item.ID, &item.Name, &item.Description, &item.PayTo, &item.ReferenceRequired,
		&item.Enabled, &item.SortOrder, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func paymentMethodSnapshot(item PaymentMethod) map[string]any {
	return map[string]any{
		"name": item.Name, "description": item.Description, "pay_to": item.PayTo,
		"reference_required": item.ReferenceRequired, "enabled": item.Enabled, "sort_order": item.SortOrder,
	}
}

func isMethodNameConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "payment_methods_name_key"
}
