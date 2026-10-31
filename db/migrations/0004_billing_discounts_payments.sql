-- Billing, discounts and payments. Builds on the baseline invoices / invoice_line_items /
-- discount_* / payments tables: only adds columns, constraints, indexes and one history table.

-- Invoices --------------------------------------------------------------------------------
-- Numbers come from a sequence so concurrent billing runs never collide.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
ALTER TABLE invoices ALTER COLUMN invoice_number SET DEFAULT
  ('INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'));
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_global_uq ON invoices (invoice_number);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS invoices_status_due_idx ON invoices (status, due_date, id);
CREATE INDEX IF NOT EXISTS invoices_subscription_idx ON invoices (subscription_id, period_start DESC);
CREATE INDEX IF NOT EXISTS invoices_id_desc_idx ON invoices (id DESC);

ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS product_variant_id BIGINT REFERENCES product_variants(id);
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS discount_rule_ids BIGINT[] NOT NULL DEFAULT '{}';
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS line_number INT NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_id, line_number, id);

CREATE TABLE IF NOT EXISTS invoice_status_history (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS invoice_status_history_invoice_idx
  ON invoice_status_history (invoice_id, changed_at DESC, id DESC);

-- Discounts -------------------------------------------------------------------------------
-- Rules are company-wide (admin defined), so customer_id becomes optional like the catalog.
-- kind = percentage | fixed; value is the percent (0-100) or the fixed amount.
-- applies_to = subscription (whole invoice) | products (only lines whose product is in
-- discount_scopes with scope_type 'product').
ALTER TABLE discount_rules ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE discount_rules ALTER COLUMN discount_percent DROP NOT NULL;
ALTER TABLE discount_rules ALTER COLUMN discount_percent SET DEFAULT 0;
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'percentage'
  CHECK (kind IN ('percentage', 'fixed'));
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (value >= 0);
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'subscription'
  CHECK (applies_to IN ('subscription', 'products'));
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS min_purchase NUMERIC(12,2) NOT NULL DEFAULT 0
  CHECK (min_purchase >= 0);
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS min_quantity NUMERIC(12,2) NOT NULL DEFAULT 0
  CHECK (min_quantity >= 0);
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS starts_on DATE;
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS ends_on DATE;
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS usage_limit INT CHECK (usage_limit IS NULL OR usage_limit > 0);
ALTER TABLE discount_rules ADD COLUMN IF NOT EXISTS times_used INT NOT NULL DEFAULT 0 CHECK (times_used >= 0);
ALTER TABLE discount_rules DROP CONSTRAINT IF EXISTS discount_rules_percent_max;
ALTER TABLE discount_rules ADD CONSTRAINT discount_rules_percent_max
  CHECK (kind <> 'percentage' OR value <= 100);
ALTER TABLE discount_rules DROP CONSTRAINT IF EXISTS discount_rules_usage_cap;
ALTER TABLE discount_rules ADD CONSTRAINT discount_rules_usage_cap
  CHECK (usage_limit IS NULL OR times_used <= usage_limit);
ALTER TABLE discount_rules DROP CONSTRAINT IF EXISTS discount_rules_date_order;
ALTER TABLE discount_rules ADD CONSTRAINT discount_rules_date_order
  CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);
CREATE INDEX IF NOT EXISTS discount_rules_active_idx ON discount_rules (is_active, starts_on, ends_on, id);
CREATE UNIQUE INDEX IF NOT EXISTS discount_scopes_rule_target_uq
  ON discount_scopes (discount_rule_id, scope_type, scope_id);
-- One usage row per rule per invoice; usage counts can never be double-incremented.
CREATE UNIQUE INDEX IF NOT EXISTS discount_usage_rule_invoice_uq ON discount_usage (discount_rule_id, invoice_id);

-- Payments --------------------------------------------------------------------------------
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_on DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments (customer_id, id DESC);
CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON payments (paid_on DESC, id DESC);
