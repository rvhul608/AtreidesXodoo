-- Subscription lifecycle for Section A. Only adds columns and swaps CHECK constraints: the
-- billing engine reads subscriptions.period/quantity/unit_price/next_billing_date, so nothing
-- is renamed or dropped. Legacy "Cancelled" rows map to the new terminal status "Closed".

UPDATE subscriptions SET status = 'Closed' WHERE status = 'Cancelled';
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('Draft','Quotation','Confirmed','Active','Paused','Closed'));
ALTER TABLE subscriptions ALTER COLUMN status SET DEFAULT 'Draft';
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_period_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_period_check
  CHECK (period IN ('daily','weekly','monthly','yearly','quarterly','annual'));
CREATE SEQUENCE IF NOT EXISTS subscription_number_seq;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'Due on receipt';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS template_id BIGINT REFERENCES quotation_templates(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS paused_at DATE;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE subscriptions ALTER COLUMN subscription_number SET DEFAULT
  ('SUB-' || lpad(nextval('subscription_number_seq')::text, 6, '0'));
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_number_global_uq ON subscriptions(subscription_number);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_desc_idx ON subscriptions(customer_id,id DESC);
CREATE INDEX IF NOT EXISTS subscriptions_status_id_desc_idx ON subscriptions(status,id DESC);
CREATE INDEX IF NOT EXISTS subscriptions_expiry_active_idx ON subscriptions(expiry_date)
  WHERE status='Active';
CREATE INDEX IF NOT EXISTS subscriptions_billing_active_idx ON subscriptions(next_billing_date)
  WHERE status='Active';
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id);
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS tax_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE subscription_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS from_status TEXT;
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS to_status TEXT;
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS actor_user_id BIGINT REFERENCES users(id);
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE subscription_history ADD COLUMN IF NOT EXISTS action TEXT;
UPDATE subscription_history SET to_status=status WHERE to_status IS NULL;
CREATE INDEX IF NOT EXISTS subscription_history_sub_changed_idx
  ON subscription_history(subscription_id,changed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS invoices_customer_id_desc_idx ON invoices(customer_id,id DESC);
