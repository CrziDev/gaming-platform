ALTER TABLE games
    ADD COLUMN currency TEXT REFERENCES currencies (code),
    ADD COLUMN min_wager_minor BIGINT,
    ADD COLUMN max_wager_minor BIGINT,
    ADD COLUMN wager_step_minor BIGINT;

UPDATE games g
SET currency = 'PHP',
    min_wager_minor = limits.min_wager_minor,
    max_wager_minor = limits.max_wager_minor,
    wager_step_minor = limits.wager_step_minor
FROM game_wager_limits limits
WHERE limits.game_id = g.id AND limits.currency = 'PHP';

ALTER TABLE games
    ALTER COLUMN currency SET NOT NULL,
    ALTER COLUMN min_wager_minor SET NOT NULL,
    ALTER COLUMN max_wager_minor SET NOT NULL,
    ALTER COLUMN wager_step_minor SET NOT NULL,
    ADD CONSTRAINT games_wager_bounds CHECK (
        min_wager_minor > 0
        AND max_wager_minor >= min_wager_minor
        AND wager_step_minor > 0),
    ADD CONSTRAINT games_wagers_json_safe CHECK (
        min_wager_minor <= 9007199254740991
        AND max_wager_minor <= 9007199254740991
        AND wager_step_minor <= 9007199254740991);

DROP TABLE game_wager_limits;
