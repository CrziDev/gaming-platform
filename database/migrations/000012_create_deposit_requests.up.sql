CREATE TABLE deposit_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users (id),
    wallet_id       UUID NOT NULL REFERENCES wallets (id),
    currency        TEXT NOT NULL REFERENCES currencies (code),
    method_id       UUID NOT NULL REFERENCES payment_methods (id),
    amount_minor    BIGINT NOT NULL,
    reference       TEXT,
    proof_path      TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    idempotency_key TEXT,
    reviewed_by     UUID REFERENCES users (id),
    reviewed_at     TIMESTAMPTZ,
    reason          TEXT,
    transaction_id  UUID REFERENCES wallet_transactions (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT deposit_requests_status_valid CHECK (status IN ('pending', 'approved', 'rejected')),
    CONSTRAINT deposit_requests_amount_positive CHECK (amount_minor > 0),
    CONSTRAINT deposit_requests_reviewed_pair CHECK (
        (status = 'pending') = (reviewed_at IS NULL AND reviewed_by IS NULL)),
    CONSTRAINT deposit_requests_rejection_has_reason CHECK (
        status <> 'rejected' OR length(btrim(coalesce(reason, ''))) > 0),
    CONSTRAINT deposit_requests_approval_has_movement CHECK (
        (status = 'approved') = (transaction_id IS NOT NULL))
);

CREATE UNIQUE INDEX deposit_requests_idempotency_key
    ON deposit_requests (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX deposit_requests_status_created ON deposit_requests (status, created_at DESC);
CREATE INDEX deposit_requests_user_created ON deposit_requests (user_id, created_at DESC);
CREATE INDEX deposit_requests_wallet_id ON deposit_requests (wallet_id);
