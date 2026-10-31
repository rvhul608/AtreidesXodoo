-- Phase 1: Complete Schema for Brightloop Subscription System
-- All money fields use NUMERIC(12,2) for exact arithmetic.
-- States: invoices (Draft/Confirmed/Paid/Cancelled), subscriptions (Active/Paused/Cancelled), etc.

-- Customers (Tenants)
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  legal_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(legal_name)
);

-- Users with roles and customer ownership
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, email)
);

-- Single-use reset tokens (hashed, expiring)
CREATE TABLE IF NOT EXISTS reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log for compliance
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  action TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Outbox for async email/notifications (database-backed only)
CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_at TIMESTAMP,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products (catalog items)
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, sku)
);

-- Product variants (for packaging/options)
CREATE TABLE IF NOT EXISTS product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_key TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, variant_key)
);

-- Tax rules
CREATE TABLE IF NOT EXISTS tax_rules (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  jurisdiction TEXT NOT NULL,
  tax_code TEXT,
  rate NUMERIC(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, jurisdiction)
);

-- Attachments (invoices, documents, etc.)
CREATE TABLE IF NOT EXISTS attachments (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entity_type TEXT,
  entity_id BIGINT,
  mime_type TEXT,
  file_name TEXT NOT NULL,
  file_size INT,
  file_path TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Billing periods and plans
CREATE TABLE IF NOT EXISTS plans (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Availability periods
  available_from DATE,
  available_until DATE,
  -- Constraints
  min_quantity INT DEFAULT 1,
  max_quantity INT,
  -- Policy flags
  auto_renew_allowed BOOLEAN DEFAULT true,
  early_termination_allowed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, plan_number)
);

-- Plan pricing for different periods
CREATE TABLE IF NOT EXISTS plan_pricing (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'annual')),
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, period)
);

-- Quotation templates
CREATE TABLE IF NOT EXISTS quotation_templates (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotation template lines
CREATE TABLE IF NOT EXISTS quotation_template_lines (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  product_variant_id BIGINT REFERENCES product_variants(id),
  quantity NUMERIC(12,2) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  discount_percent NUMERIC(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions with unique number
CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_number TEXT NOT NULL,
  plan_id BIGINT NOT NULL REFERENCES plans(id),
  -- Contract terms
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'annual')),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  -- Dates
  start_date DATE NOT NULL,
  end_date DATE,
  next_billing_date DATE,
  -- Configuration
  auto_renew BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Paused', 'Cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(customer_id, subscription_number),
  INDEX on status,
  INDEX on next_billing_date WHERE status = 'Active'
);

-- Subscription history (for audit/reporting)
CREATE TABLE IF NOT EXISTS subscription_history (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subscription line items
CREATE TABLE IF NOT EXISTS subscription_items (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_variant_id BIGINT REFERENCES product_variants(id),
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoices with UNIQUE(subscription_id, period_start)
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Totals (computed and snapshotted)
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  -- Dates
  issued_date DATE NOT NULL,
  due_date DATE NOT NULL,
  -- State machine: Draft -> Confirmed -> Paid or Cancelled
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Confirmed', 'Paid', 'Cancelled')),
  -- Trace: snapshot of rules applied
  trace JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subscription_id, period_start),
  INDEX on status,
  INDEX on due_date,
  INDEX on customer_id
);

-- Invoice line items (snapshot of prices/taxes/discounts)
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
  tax_rate NUMERIC(5,4) DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 1),
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_percent NUMERIC(5,2) DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments (local records only, no external integrations)
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'Received' CHECK (status IN ('Received', 'Failed', 'Reversed')),
  transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX on invoice_id
);

-- Discount rules
CREATE TABLE IF NOT EXISTS discount_rules (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discount scopes (applies to plans, products, subscriptions)
CREATE TABLE IF NOT EXISTS discount_scopes (
  id BIGSERIAL PRIMARY KEY,
  discount_rule_id BIGINT NOT NULL REFERENCES discount_rules(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('plan', 'product', 'subscription')),
  scope_id BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Discount usage tracking
CREATE TABLE IF NOT EXISTS discount_usage (
  id BIGSERIAL PRIMARY KEY,
  discount_rule_id BIGINT NOT NULL REFERENCES discount_rules(id) ON DELETE CASCADE,
  invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_customer_id ON audit_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_customer_id ON email_outbox(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_sent ON email_outbox(sent_at);
CREATE INDEX IF NOT EXISTS idx_products_customer_id ON products(customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_rules_customer_id ON tax_rules(customer_id);
CREATE INDEX IF NOT EXISTS idx_plans_customer_id ON plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON subscriptions(next_billing_date) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_discount_usage_invoice_id ON discount_usage(invoice_id);
CREATE INDEX IF NOT EXISTS idx_discount_usage_rule_id ON discount_usage(discount_rule_id);

-- LISTEN/NOTIFY channels for real-time updates (schema support)
-- These will be used by the application to emit and subscribe to events:
-- - subscription_updated: { subscription_id, status, next_billing_date }
-- - invoice_ready: { invoice_id, status, due_date }
-- - payment_processed: { payment_id, invoice_id, status }
