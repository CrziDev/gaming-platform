UPDATE auth_sessions SET csrf_token = '' WHERE csrf_token IS NULL;

ALTER TABLE auth_sessions ALTER COLUMN csrf_token SET NOT NULL;
