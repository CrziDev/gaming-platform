ALTER TABLE deposit_requests
    DROP CONSTRAINT IF EXISTS deposit_requests_amount_json_safe;

ALTER TABLE game_rounds
    DROP CONSTRAINT IF EXISTS game_rounds_money_json_safe;

ALTER TABLE games
    DROP CONSTRAINT IF EXISTS games_wagers_json_safe;

ALTER TABLE wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_money_json_safe;

ALTER TABLE wallets
    DROP CONSTRAINT IF EXISTS wallets_balance_json_safe;

ALTER TABLE currencies
    DROP CONSTRAINT IF EXISTS currencies_deposit_limits_json_safe;
