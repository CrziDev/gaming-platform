CREATE TABLE currencies (
    code              TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    minor_units       SMALLINT NOT NULL,
    deposit_min_minor BIGINT NOT NULL DEFAULT 10000,
    deposit_max_minor BIGINT NOT NULL DEFAULT 5000000,
    enabled           BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT currencies_code_iso CHECK (code ~ '^[A-Z]{3}$'),
    CONSTRAINT currencies_minor_units_sane CHECK (minor_units BETWEEN 0 AND 4),
    CONSTRAINT currencies_deposit_limits_valid CHECK (
        deposit_min_minor > 0 AND deposit_max_minor >= deposit_min_minor),
    CONSTRAINT currencies_deposit_limits_json_safe CHECK (
        deposit_min_minor <= 9007199254740991
        AND deposit_max_minor <= 9007199254740991)
);

INSERT INTO currencies (code, name, symbol, minor_units) VALUES
    ('PHP', 'Philippine Peso', '₱', 2),
    ('USD', 'US Dollar', '$', 2);
