ALTER TABLE currencies
    ADD COLUMN withdrawal_min_minor BIGINT NOT NULL DEFAULT 10000,
    ADD COLUMN withdrawal_max_minor BIGINT NOT NULL DEFAULT 5000000,
    ADD CONSTRAINT currencies_withdrawal_limits_valid CHECK (
        withdrawal_min_minor > 0 AND withdrawal_max_minor >= withdrawal_min_minor),
    ADD CONSTRAINT currencies_withdrawal_limits_json_safe CHECK (
        withdrawal_min_minor <= 9007199254740991
        AND withdrawal_max_minor <= 9007199254740991);
