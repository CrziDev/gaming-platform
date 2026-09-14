ALTER TABLE games
    ADD COLUMN default_rtp_profile_id UUID;

ALTER TABLE games
    ADD CONSTRAINT games_default_rtp_profile_fk
    FOREIGN KEY (default_rtp_profile_id) REFERENCES rtp_profiles (id) ON DELETE SET NULL;

UPDATE games AS g
SET default_rtp_profile_id = p.id
FROM rtp_profiles AS p
WHERE p.game_id = g.id
  AND p.status = 'active'
  AND p.effective_until IS NULL;
