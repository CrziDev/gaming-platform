DELETE FROM payment_methods WHERE name IN ('GCash', 'Maya');

ALTER TABLE currencies
    DROP CONSTRAINT currencies_deposit_limits_valid,
    DROP COLUMN deposit_min_minor,
    DROP COLUMN deposit_max_minor;
