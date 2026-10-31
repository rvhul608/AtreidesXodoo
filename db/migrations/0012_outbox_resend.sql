-- Delivery tracking for the transactional outbox, sent through the Resend API.
-- Rows stay 'pending' until the dispatcher marks them sent or gives up on 'failed'.

ALTER TABLE outbox_emails
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resend_id TEXT,
  ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbox_emails_status_check') THEN
    ALTER TABLE outbox_emails
      ADD CONSTRAINT outbox_emails_status_check CHECK (status IN ('pending', 'sent', 'failed'));
  END IF;
END $$;

-- Emails written before the Resend integration were "delivered" by the
-- database-only outbox; mark them sent so the dispatcher never re-sends them.
UPDATE outbox_emails SET status = 'sent', sent_at = created_at WHERE sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_emails_pending
  ON outbox_emails (next_attempt_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_emails_status ON outbox_emails (status);
