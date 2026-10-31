CREATE TABLE IF NOT EXISTS renewal_chase_log (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('pre_due', 'due', 'overdue_7')),
  outbox_email_id BIGINT REFERENCES outbox_emails(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (invoice_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_renewal_chase_invoice ON renewal_chase_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_outbox_emails_recipient ON outbox_emails(recipient);
