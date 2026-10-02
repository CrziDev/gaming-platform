-- Rolling back removes withdrawal notifications, which the restored check cannot hold.
DELETE FROM notifications WHERE kind IN ('withdrawal_approved', 'withdrawal_rejected');

ALTER TABLE notifications
    DROP CONSTRAINT notifications_kind_valid,
    ADD CONSTRAINT notifications_kind_valid CHECK (kind IN ('deposit_approved', 'deposit_rejected', 'round_win'));
