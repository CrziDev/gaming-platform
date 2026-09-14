ALTER TABLE currencies
    ADD CONSTRAINT currencies_deposit_limits_json_safe
    CHECK (deposit_min_minor <= 9007199254740991 AND deposit_max_minor <= 9007199254740991);

ALTER TABLE wallets
    ADD CONSTRAINT wallets_balance_json_safe
    CHECK (balance_minor <= 9007199254740991);

ALTER TABLE wallet_transactions
    ADD CONSTRAINT wallet_transactions_money_json_safe
    CHECK (
        amount_minor BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_before BETWEEN -9007199254740991 AND 9007199254740991
        AND balance_after BETWEEN -9007199254740991 AND 9007199254740991
    );

ALTER TABLE games
    ADD CONSTRAINT games_wagers_json_safe
    CHECK (
        min_wager_minor <= 9007199254740991
        AND max_wager_minor <= 9007199254740991
        AND wager_step_minor <= 9007199254740991
    );

ALTER TABLE game_rounds
    ADD CONSTRAINT game_rounds_money_json_safe
    CHECK (
        stake_minor <= 9007199254740991
        AND (win_minor IS NULL OR win_minor <= 9007199254740991)
    );

ALTER TABLE deposit_requests
    ADD CONSTRAINT deposit_requests_amount_json_safe
    CHECK (amount_minor <= 9007199254740991);
