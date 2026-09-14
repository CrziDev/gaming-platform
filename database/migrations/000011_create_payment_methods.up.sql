CREATE TABLE payment_methods (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    description        TEXT NOT NULL DEFAULT '',
    pay_to             TEXT NOT NULL,
    reference_required BOOLEAN NOT NULL DEFAULT true,
    enabled            BOOLEAN NOT NULL DEFAULT false,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO payment_methods (
    name, description, pay_to, reference_required, enabled, sort_order
) VALUES
    ('GCash', 'Send your payment to the GCash account shown below.', 'To be supplied', true, false, 10),
    ('Maya', 'Send your payment to the Maya account shown below.', 'To be supplied', true, false, 20);
