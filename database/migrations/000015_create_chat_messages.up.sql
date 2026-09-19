CREATE TABLE chat_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users (id),
    text       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chat_messages_text_length CHECK (length(btrim(text)) BETWEEN 1 AND 280)
);

CREATE INDEX chat_messages_created ON chat_messages (created_at DESC, id DESC);
