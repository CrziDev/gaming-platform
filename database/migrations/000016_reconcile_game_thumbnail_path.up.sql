-- Some deployed databases reached legacy version 15 without this column even
-- though it is part of the current version-8 schema. Keep this idempotent so it
-- repairs those databases and is harmless on fresh installs.
ALTER TABLE games
    ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;
