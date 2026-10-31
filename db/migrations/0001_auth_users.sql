ALTER TABLE users ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
UPDATE users SET role = 'customer' WHERE role IN ('user', 'viewer');
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'customer';
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'staff', 'customer'));
ALTER TABLE users
  ADD CONSTRAINT users_customer_required_check
  CHECK (role <> 'customer' OR customer_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (lower(email));

ALTER TABLE audit_log ALTER COLUMN customer_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS outbox_emails (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_emails_created_at ON outbox_emails (created_at DESC);
