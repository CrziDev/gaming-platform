CREATE TABLE auth_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id),
    token_hash   BYTEA NOT NULL,
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ,
    user_agent   TEXT,
    ip_address   INET,

    CONSTRAINT auth_sessions_token_hash_length CHECK (octet_length(token_hash) = 32),
    CONSTRAINT auth_sessions_expiry_after_issue CHECK (expires_at > issued_at)
);

CREATE UNIQUE INDEX auth_sessions_token_hash_key ON auth_sessions (token_hash);
CREATE INDEX auth_sessions_user_id ON auth_sessions (user_id);
