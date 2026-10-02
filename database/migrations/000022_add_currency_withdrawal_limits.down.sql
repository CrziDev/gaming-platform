ALTER TABLE currencies
    DROP COLUMN IF EXISTS withdrawal_max_minor,
    DROP COLUMN IF EXISTS withdrawal_min_minor;
