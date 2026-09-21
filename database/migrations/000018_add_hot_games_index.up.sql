CREATE INDEX game_rounds_hot_activity
    ON game_rounds (started_at DESC, game_id)
    WHERE status = 'settled';
