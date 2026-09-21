-- A game's return is one of the options its engine ships, chosen by an operator
-- and stored as the basis points alone. The profile rows that carried drafts,
-- verification evidence, and schedules go with the workflow they served.
ALTER TABLE games
    ADD COLUMN rtp_basis_points INTEGER,
    ADD CONSTRAINT games_rtp_sane CHECK (rtp_basis_points IS NULL OR rtp_basis_points BETWEEN 5000 AND 20000);

ALTER TABLE game_rounds ADD COLUMN rtp_basis_points INTEGER;

UPDATE game_rounds r
SET rtp_basis_points = p.target_basis_points
FROM rtp_profiles p
WHERE p.id = r.rtp_profile_id;

ALTER TABLE game_rounds
    ALTER COLUMN rtp_basis_points SET NOT NULL,
    ADD CONSTRAINT game_rounds_rtp_sane CHECK (rtp_basis_points BETWEEN 5000 AND 20000),
    DROP COLUMN rtp_profile_id;

-- games.rtp_basis_points stays NULL: the retired 9600 profile is not an option,
-- so an operator picks one before the game plays again.
ALTER TABLE games DROP COLUMN default_rtp_profile_id;

DROP TABLE rtp_profiles;
