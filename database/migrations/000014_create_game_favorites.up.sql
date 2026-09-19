CREATE TABLE game_favorites (
    user_id    UUID NOT NULL REFERENCES users (id),
    game_id    UUID NOT NULL REFERENCES games (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, game_id)
);

CREATE INDEX game_favorites_user_created ON game_favorites (user_id, created_at DESC);
