CREATE TABLE notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users (id),
    kind           TEXT NOT NULL,
    amount_minor   BIGINT,
    currency       TEXT REFERENCES currencies (code),
    reference_type TEXT NOT NULL,
    reference_id   UUID NOT NULL,
    detail         TEXT,
    read_at        TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_kind_valid CHECK (kind IN ('deposit_approved', 'deposit_rejected', 'round_win')),
    CONSTRAINT notifications_amount_json_safe CHECK (
        amount_minor IS NULL OR amount_minor BETWEEN -9007199254740991 AND 9007199254740991),
    CONSTRAINT notifications_amount_has_currency CHECK ((amount_minor IS NULL) = (currency IS NULL))
);

CREATE UNIQUE INDEX notifications_one_per_reference ON notifications (kind, reference_id);
CREATE INDEX notifications_user_created ON notifications (user_id, created_at DESC);
