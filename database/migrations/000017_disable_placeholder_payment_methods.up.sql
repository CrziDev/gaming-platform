UPDATE payment_methods
SET enabled = false,
    updated_at = now()
WHERE pay_to = 'To be supplied';
