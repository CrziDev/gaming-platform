ALTER TABLE notifications
    DROP CONSTRAINT notifications_kind_valid,
    ADD CONSTRAINT notifications_kind_valid CHECK (kind IN (
        'deposit_approved', 'deposit_rejected', 'round_win',
        'withdrawal_approved', 'withdrawal_rejected'));
