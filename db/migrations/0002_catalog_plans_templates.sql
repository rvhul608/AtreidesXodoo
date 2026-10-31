-- The hackathon product is a single-company catalog; tenant ownership on these
-- baseline tables would duplicate shared products and plans for every customer.
ALTER TABLE products ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_customer_id_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_global_uq ON products (sku);
ALTER TABLE products ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'service';
ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sales_price >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'default';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT '';
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS extra_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_price >= 0);

ALTER TABLE tax_rules ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE tax_rules DROP CONSTRAINT IF EXISTS tax_rules_customer_id_jurisdiction_key;
ALTER TABLE tax_rules ADD COLUMN IF NOT EXISTS name TEXT;
UPDATE tax_rules SET name = jurisdiction WHERE name IS NULL;
ALTER TABLE tax_rules ALTER COLUMN name SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tax_rules_name_global_uq ON tax_rules (name);
CREATE TABLE IF NOT EXISTS product_taxes (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tax_id BIGINT NOT NULL REFERENCES tax_rules(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, tax_id)
);
CREATE INDEX IF NOT EXISTS product_taxes_tax_idx ON product_taxes (tax_id, product_id);

ALTER TABLE plans ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_customer_id_plan_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS plans_plan_number_global_uq ON plans (plan_number);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('daily','weekly','monthly','yearly'));
ALTER TABLE plans ADD COLUMN IF NOT EXISTS auto_close BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_early_close BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_pause BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS allow_renew BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE quotation_templates ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE quotation_templates ADD COLUMN IF NOT EXISTS plan_id BIGINT REFERENCES plans(id);
ALTER TABLE quotation_templates ADD COLUMN IF NOT EXISTS validity_days INT NOT NULL DEFAULT 30 CHECK (validity_days > 0);
ALTER TABLE quotation_template_lines ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES products(id);
ALTER TABLE quotation_template_lines ADD COLUMN IF NOT EXISTS quantity_value NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity_value > 0);
ALTER TABLE audit_log ALTER COLUMN customer_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS products_name_id_idx ON products (name, id);
CREATE INDEX IF NOT EXISTS plans_availability_idx ON plans (available_from, available_until, id);
CREATE INDEX IF NOT EXISTS templates_created_id_idx ON quotation_templates (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS template_lines_template_line_idx ON quotation_template_lines (template_id, line_number, id);
