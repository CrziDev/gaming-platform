CREATE TABLE game_wager_limits (
    game_id          UUID NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    currency         TEXT NOT NULL REFERENCES currencies (code),
    min_wager_minor  BIGINT NOT NULL,
    max_wager_minor  BIGINT NOT NULL,
    wager_step_minor BIGINT NOT NULL,
    PRIMARY KEY (game_id, currency),
    CONSTRAINT game_wager_limits_bounds CHECK (
        min_wager_minor > 0
        AND max_wager_minor >= min_wager_minor
        AND wager_step_minor > 0
        AND mod(max_wager_minor - min_wager_minor, wager_step_minor) = 0),
    CONSTRAINT game_wager_limits_json_safe CHECK (
        min_wager_minor <= 9007199254740991
        AND max_wager_minor <= 9007199254740991
        AND wager_step_minor <= 9007199254740991)
);

INSERT INTO game_wager_limits (game_id, currency, min_wager_minor, max_wager_minor, wager_step_minor)
SELECT g.id, currency.code, g.min_wager_minor, g.max_wager_minor, g.wager_step_minor
FROM games g
CROSS JOIN (VALUES ('PHP'), ('USD')) AS currency(code);

ALTER TABLE games
    DROP CONSTRAINT games_wager_bounds,
    DROP CONSTRAINT games_wagers_json_safe,
    DROP COLUMN currency,
    DROP COLUMN min_wager_minor,
    DROP COLUMN max_wager_minor,
    DROP COLUMN wager_step_minor;

CREATE INDEX game_wager_limits_currency ON game_wager_limits (currency);
