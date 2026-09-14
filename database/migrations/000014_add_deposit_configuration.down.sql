-- Remove only pristine, unreferenced seed rows. A configured or already-used
-- payment method is operator data and must survive a one-step rollback.
DELETE FROM payment_methods AS method
WHERE method.name IN ('GCash', 'Maya')
  AND method.pay_to = 'To be supplied'
  AND NOT EXISTS (
      SELECT 1
      FROM deposit_requests AS request
      WHERE request.method_id = method.id
  );

ALTER TABLE currencies
    DROP CONSTRAINT currencies_deposit_limits_valid,
    DROP COLUMN deposit_min_minor,
    DROP COLUMN deposit_max_minor;
