CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets (id),
    user_id         UUID NOT NULL REFERENCES users (id),
    currency        TEXT NOT NULL REFERENCES currencies (code),
    kind            TEXT NOT NULL,
    amount_minor    BIGINT NOT NULL,
    balance_before  BIGINT NOT NULL,
    balance_after   BIGINT NOT NULL,
    reference_type  TEXT,
    reference_id    UUID,
    idempotency_key TEXT,
    actor_user_id   UUID REFERENCES users (id),
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wallet_transactions_kind_valid CHECK (
        kind IN ('deposit', 'withdrawal', 'wager', 'win', 'refund', 'adjustment')),
    CONSTRAINT wallet_transactions_amount_non_zero CHECK (amount_minor <> 0),
    CONSTRAINT wallet_transactions_arithmetic CHECK (balance_after = balance_before + amount_minor),
    CONSTRAINT wallet_transactions_money_json_safe CHECK (
        amount_minor BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_before BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_after BETWEEN -9007199254740991 AND 9007199254740991)
);

CREATE UNIQUE INDEX wallet_transactions_idempotency_key
    ON wallet_transactions (wallet_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX wallet_transactions_one_win_per_round
    ON wallet_transactions (reference_id) WHERE reference_type = 'round' AND kind = 'win';

CREATE INDEX wallet_transactions_wallet_created
    ON wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX wallet_transactions_user_created
    ON wallet_transactions (user_id, created_at DESC);
