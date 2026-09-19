package main

import (
	"context"
	"database/sql"
	"fmt"
)

// payment_methods has no unique key, so the seed converges on a row by name:
// update what is there, insert only when nothing carries the name.
const updatePaymentMethod = `
	UPDATE payment_methods
	   SET description        = $2,
	       pay_to             = $3,
	       reference_required = $4,
	       enabled            = true,
	       sort_order         = $5,
	       updated_at         = now()
	 WHERE name = $1`

const insertPaymentMethod = `
	INSERT INTO payment_methods (name, description, pay_to, reference_required, enabled, sort_order)
	VALUES ($1, $2, $3, $4, true, $5)`

type paymentMethod struct {
	name              string
	description       string
	payTo             string
	referenceRequired bool
	sortOrder         int
}

// The destinations are visibly not accounts anyone holds: a development
// database enables the methods without ever naming a place to send money.
var paymentMethods = []paymentMethod{
	{name: "GCash", description: "Send your payment to the GCash account shown below.", payTo: "0917 000 0000 · development placeholder", referenceRequired: true, sortOrder: 10},
	{name: "Maya", description: "Send your payment to the Maya account shown below.", payTo: "0918 000 0000 · development placeholder", referenceRequired: true, sortOrder: 20},
}

func seedPaymentMethods(ctx context.Context, tx *sql.Tx) error {
	for _, m := range paymentMethods {
		result, err := tx.ExecContext(ctx, updatePaymentMethod, m.name, m.description, m.payTo, m.referenceRequired, m.sortOrder)
		if err != nil {
			return fmt.Errorf("seed: update payment method %s: %w", m.name, err)
		}
		updated, err := result.RowsAffected()
		if err != nil {
			return fmt.Errorf("seed: update payment method %s: %w", m.name, err)
		}
		if updated > 0 {
			continue
		}
		if _, err := tx.ExecContext(ctx, insertPaymentMethod, m.name, m.description, m.payTo, m.referenceRequired, m.sortOrder); err != nil {
			return fmt.Errorf("seed: insert payment method %s: %w", m.name, err)
		}
	}
	return nil
}
