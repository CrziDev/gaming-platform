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
