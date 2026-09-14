ALTER TABLE currencies
    ADD COLUMN deposit_min_minor BIGINT NOT NULL DEFAULT 10000,
    ADD COLUMN deposit_max_minor BIGINT NOT NULL DEFAULT 5000000;

ALTER TABLE currencies
    ADD CONSTRAINT currencies_deposit_limits_valid
    CHECK (deposit_min_minor > 0 AND deposit_max_minor >= deposit_min_minor);

INSERT INTO payment_methods (name, description, pay_to, reference_required, enabled, sort_order)
SELECT seed.name, seed.description, seed.pay_to, seed.reference_required, seed.enabled, seed.sort_order
FROM (VALUES
    ('GCash', 'Send your payment to the GCash account shown below.', 'To be supplied', true, true, 10),
    ('Maya', 'Send your payment to the Maya account shown below.', 'To be supplied', true, true, 20)
) AS seed(name, description, pay_to, reference_required, enabled, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM payment_methods AS existing WHERE existing.name = seed.name
);
