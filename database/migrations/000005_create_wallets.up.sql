CREATE TABLE wallets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users (id),
    currency      TEXT NOT NULL REFERENCES currencies (code),
    balance_minor BIGINT NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT wallets_status_valid CHECK (status IN ('active', 'frozen', 'closed')),
    CONSTRAINT wallets_balance_non_negative CHECK (balance_minor >= 0)
);

CREATE UNIQUE INDEX wallets_user_currency_key ON wallets (user_id, currency);
