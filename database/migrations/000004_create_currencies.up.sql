CREATE TABLE currencies (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    minor_units SMALLINT NOT NULL,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT currencies_code_iso CHECK (code ~ '^[A-Z]{3}$'),
    CONSTRAINT currencies_minor_units_sane CHECK (minor_units BETWEEN 0 AND 4)
);

INSERT INTO currencies (code, name, symbol, minor_units) VALUES
    ('PHP', 'Philippine Peso', '₱', 2),
    ('USD', 'US Dollar', '$', 2);
