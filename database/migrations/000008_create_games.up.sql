CREATE TABLE games (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    category_slug    TEXT NOT NULL REFERENCES game_categories (slug),
    provider         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'draft',
    integration      TEXT NOT NULL DEFAULT 'unreviewed',
    currency         TEXT NOT NULL REFERENCES currencies (code),
    min_wager_minor  BIGINT NOT NULL,
    max_wager_minor  BIGINT NOT NULL,
    wager_step_minor BIGINT NOT NULL,
    frontend_path    TEXT,
    thumbnail_path   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT games_status_valid CHECK (status IN ('draft', 'active', 'maintenance', 'retired')),
    CONSTRAINT games_integration_valid CHECK (integration IN (
        'unreviewed', 'under_review', 'supported', 'integrated', 'unsupported')),
    CONSTRAINT games_wager_bounds CHECK (
        min_wager_minor > 0
        AND max_wager_minor >= min_wager_minor
        AND wager_step_minor > 0)
);

CREATE UNIQUE INDEX games_slug_key ON games (slug);
CREATE INDEX games_status_category ON games (status, category_slug);
CREATE INDEX games_category_slug ON games (category_slug);
