CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users (id),
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     TEXT NOT NULL,
    detail        TEXT NOT NULL DEFAULT '',
    before_data   JSONB,
    after_data    JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_created ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX audit_logs_entity ON audit_logs (entity_type, entity_id);
