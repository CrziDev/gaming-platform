CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'player',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
    CONSTRAINT users_email_present CHECK (length(email) BETWEEN 3 AND 254),
    CONSTRAINT users_display_name_present CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
    CONSTRAINT users_role_valid CHECK (role IN ('player', 'admin')),
    CONSTRAINT users_status_valid CHECK (status IN ('active', 'suspended', 'closed'))
);

CREATE UNIQUE INDEX users_email_key ON users (email);

CREATE TABLE auth_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users (id),

    token_hash   BYTEA NOT NULL,

    csrf_token   TEXT NOT NULL,

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
