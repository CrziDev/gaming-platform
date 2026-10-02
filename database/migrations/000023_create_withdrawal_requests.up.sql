CREATE TABLE withdrawal_requests (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL REFERENCES users (id),
    wallet_id              UUID NOT NULL REFERENCES wallets (id),
    currency               TEXT NOT NULL REFERENCES currencies (code),
    method_id              UUID NOT NULL REFERENCES payment_methods (id),
    amount_minor           BIGINT NOT NULL,
    account_name           TEXT NOT NULL,
    account_number         TEXT NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'pending',
    idempotency_key        TEXT NOT NULL,
    hold_transaction_id    UUID NOT NULL REFERENCES wallet_transactions (id),
    release_transaction_id UUID REFERENCES wallet_transactions (id),
    payout_reference       TEXT,
    reason                 TEXT,
    reviewed_by            UUID REFERENCES users (id),
    reviewed_at            TIMESTAMPTZ,
    cancelled_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT withdrawal_requests_status_valid CHECK (
        status IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT withdrawal_requests_amount_positive CHECK (amount_minor > 0),
    CONSTRAINT withdrawal_requests_amount_json_safe CHECK (amount_minor <= 9007199254740991),
    CONSTRAINT withdrawal_requests_account_present CHECK (
        length(btrim(account_name)) > 0 AND length(btrim(account_number)) > 0),
    CONSTRAINT withdrawal_requests_reviewed_pair CHECK (
        (status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)),
    CONSTRAINT withdrawal_requests_cancelled_at CHECK (
        (status = 'cancelled') = (cancelled_at IS NOT NULL)),
    CONSTRAINT withdrawal_requests_approval_has_payout_reference CHECK (
        status <> 'approved' OR length(btrim(coalesce(payout_reference, ''))) > 0),
    CONSTRAINT withdrawal_requests_rejection_has_reason CHECK (
        status <> 'rejected' OR length(btrim(coalesce(reason, ''))) > 0),
    CONSTRAINT withdrawal_requests_release_movement CHECK (
        (status IN ('rejected', 'cancelled')) = (release_transaction_id IS NOT NULL))
);

CREATE UNIQUE INDEX withdrawal_requests_idempotency_key ON withdrawal_requests (user_id, idempotency_key);
CREATE UNIQUE INDEX withdrawal_requests_one_pending_per_wallet
    ON withdrawal_requests (wallet_id) WHERE status = 'pending';

CREATE INDEX withdrawal_requests_status_created ON withdrawal_requests (status, created_at DESC);
CREATE INDEX withdrawal_requests_user_created ON withdrawal_requests (user_id, created_at DESC);
