-- Extend the committed Resend schema without changing its migration. Local
-- development databases may already have the lease-based columns.
DO $$
DECLARE
  adopting_legacy BOOLEAN := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'outbox_emails'
      AND column_name = 'delivery_status'
  );
BEGIN
  ALTER TABLE outbox_emails
    ADD COLUMN IF NOT EXISTS delivery_key UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
      CHECK (delivery_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS claim_token UUID,
    ADD COLUMN IF NOT EXISTS first_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS provider_id TEXT,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_error TEXT,
    ADD COLUMN IF NOT EXISTS delivery_payload JSONB;

  IF adopting_legacy THEN
    -- Preserve accepted sends. Old uncertain attempts need manual review because
    -- the previous dispatcher did not send provider idempotency keys. Unattempted
    -- historical rows are not an approved delivery backlog.
    UPDATE outbox_emails SET
      delivery_status = CASE WHEN status = 'sent' AND resend_id IS NOT NULL THEN 'sent'
        WHEN send_attempts > 0 THEN 'failed' ELSE 'skipped' END,
      provider_id = resend_id,
      attempts = send_attempts,
      last_error = CASE WHEN status = 'sent' AND resend_id IS NOT NULL THEN NULL
        WHEN send_attempts > 0 THEN 'Legacy delivery attempt; review provider logs before resending'
        ELSE 'Created before lease-based email delivery was enabled' END;
  END IF;
END $$;

-- The older migration assigned a historical sent_at even on local rows whose
-- lease-based delivery had not succeeded.
UPDATE outbox_emails SET sent_at = NULL
  WHERE delivery_status <> 'sent' AND provider_id IS NULL;

CREATE INDEX IF NOT EXISTS outbox_emails_pending_idx ON outbox_emails (next_attempt_at, id)
  WHERE delivery_status IN ('pending', 'sending');
