CREATE TABLE announcements (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text       TEXT NOT NULL,
    enabled    BOOLEAN NOT NULL DEFAULT true,
    ends_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT announcements_text_valid CHECK (
        char_length(btrim(text)) BETWEEN 1 AND 280
        AND text !~ E'[\r\n]'
    )
);

CREATE INDEX announcements_enabled_created
    ON announcements (created_at DESC, id DESC)
    WHERE enabled = true;
