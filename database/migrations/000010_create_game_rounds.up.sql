CREATE TABLE game_rounds (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_key             TEXT NOT NULL,
    user_id               UUID NOT NULL REFERENCES users (id),
    game_id               UUID NOT NULL REFERENCES games (id),
    wallet_id             UUID NOT NULL REFERENCES wallets (id),
    currency              TEXT NOT NULL REFERENCES currencies (code),
    rtp_profile_id        UUID REFERENCES rtp_profiles (id),
    status                TEXT NOT NULL DEFAULT 'open',
    stake_minor           BIGINT NOT NULL,
    win_minor             BIGINT,
    multiplier_hundredths INTEGER,
    engine_reference      TEXT,
    result_data           JSONB,
    started_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT game_rounds_status_valid CHECK (status IN ('open', 'settled', 'cancelled', 'failed')),
    CONSTRAINT game_rounds_stake_positive CHECK (stake_minor > 0),
    CONSTRAINT game_rounds_win_non_negative CHECK (win_minor IS NULL OR win_minor >= 0),
    CONSTRAINT game_rounds_settled_has_outcome CHECK (
        (status = 'settled') = (settled_at IS NOT NULL AND win_minor IS NOT NULL)),
    CONSTRAINT game_rounds_money_json_safe CHECK (
        stake_minor <= 9007199254740991
        AND (win_minor IS NULL OR win_minor <= 9007199254740991))
);

CREATE UNIQUE INDEX game_rounds_round_key_key ON game_rounds (round_key);
CREATE INDEX game_rounds_user_started ON game_rounds (user_id, started_at DESC);
CREATE INDEX game_rounds_game_started ON game_rounds (game_id, started_at DESC);
CREATE INDEX game_rounds_wallet_id ON game_rounds (wallet_id);
