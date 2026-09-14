CREATE TABLE rtp_profiles (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id                  UUID NOT NULL REFERENCES games (id),
    name                     TEXT NOT NULL,
    version                  INTEGER NOT NULL,
    target_basis_points      INTEGER NOT NULL,
    status                   TEXT NOT NULL DEFAULT 'draft',
    engine_config_ref        TEXT,
    theoretical_basis_points INTEGER,
    observed_basis_points    INTEGER,
    verification_method      TEXT,
    sample_size              BIGINT,
    verified_at              TIMESTAMPTZ,
    effective_from           TIMESTAMPTZ,
    effective_until          TIMESTAMPTZ,
    created_by               UUID REFERENCES users (id),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT rtp_profiles_status_valid CHECK (status IN ('draft', 'verified', 'active', 'retired')),
    CONSTRAINT rtp_profiles_target_sane CHECK (target_basis_points BETWEEN 5000 AND 20000),
    CONSTRAINT rtp_profiles_version_positive CHECK (version > 0),
    CONSTRAINT rtp_profiles_schedule_ordered CHECK (
        effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
    CONSTRAINT rtp_profiles_verified_has_evidence CHECK (
        status IN ('draft', 'retired')
        OR (verified_at IS NOT NULL AND observed_basis_points IS NOT NULL))
);

CREATE UNIQUE INDEX rtp_profiles_game_name_version_key ON rtp_profiles (game_id, name, version);
CREATE UNIQUE INDEX rtp_profiles_one_active_per_game ON rtp_profiles (game_id) WHERE status = 'active';

ALTER TABLE games
    ADD COLUMN default_rtp_profile_id UUID,
    ADD CONSTRAINT games_default_rtp_profile_fk
        FOREIGN KEY (default_rtp_profile_id) REFERENCES rtp_profiles (id) ON DELETE SET NULL;
