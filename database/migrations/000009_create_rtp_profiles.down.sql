ALTER TABLE games
    DROP CONSTRAINT games_default_rtp_profile_fk,
    DROP COLUMN default_rtp_profile_id;

DROP TABLE IF EXISTS rtp_profiles;
