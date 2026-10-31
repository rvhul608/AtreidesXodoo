#!/usr/bin/env node
/**
 * Idempotent, set-based demo seed. It creates 5,000 demo customers, 10,000
 * subscriptions, invoice/payment history, and labelled leakage-test anomalies.
 */

import crypto from 'node:crypto';

import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

const DEMO_CUSTOMERS = "legal_name ~ '^Demo Company [0-9]+$'";
const DEMO_SUBSCRIPTIONS = "subscription_number LIKE 'DEMO-SUB-%'";
const DEMO_INVOICES = "invoice_number LIKE 'DEMO-INV-%'";
const demoPasswordHash = crypto.createHash('sha256').update('password').digest('hex');

async function runStep(name, sql, values = []) {
  const result = await client.query(sql, values);
  console.log(`✓ ${name}: ${result.rowCount ?? 0} row(s)`);
}

async function seed() {
  try {
    await client.connect();
    await client.query('BEGIN');

    await runStep('customers', `
      INSERT INTO customers (legal_name)
      SELECT 'Demo Company ' || number
      FROM generate_series(1, 5000) AS number
      ON CONFLICT (legal_name) DO NOTHING
    `);

    await runStep('demo administrators', `
      INSERT INTO users (customer_id, email, password_hash, role)
      SELECT id, 'admin@company' || id || '.local', $1, 'admin'
      FROM customers
      WHERE ${DEMO_CUSTOMERS}
      ON CONFLICT (customer_id, email) DO NOTHING
    `, [demoPasswordHash]);

    await runStep('products', `
      INSERT INTO products (customer_id, sku, name, description)
      SELECT id, 'DEMO-PROD-' || id, 'Brightloop Subscription',
        'Seeded subscription product with an Odoo add-on variant'
      FROM customers
      WHERE ${DEMO_CUSTOMERS}
      ON CONFLICT (customer_id, sku) DO NOTHING
    `);

    await runStep('product variants', `
      INSERT INTO product_variants (product_id, variant_key, description)
      SELECT products.id, variants.variant_key, variants.description
      FROM products
      CROSS JOIN (VALUES
        ('standard', 'Standard subscription'),
        ('odoo-addon', 'Odoo add-on (+560)')
      ) AS variants(variant_key, description)
      WHERE products.sku LIKE 'DEMO-PROD-%'
      ON CONFLICT (product_id, variant_key) DO NOTHING
    `);

    await runStep('tax rules', `
      INSERT INTO tax_rules (customer_id, jurisdiction, tax_code, rate)
      SELECT id, 'DEMO-LOCAL', 'DEMO-TAX', 0.0825
      FROM customers
      WHERE ${DEMO_CUSTOMERS}
      ON CONFLICT (customer_id, jurisdiction) DO NOTHING
    `);

    await runStep('plans', `
      INSERT INTO plans (customer_id, plan_number, name, description, min_quantity, auto_renew_allowed)
      SELECT id, 'DEMO-PLAN-' || id, 'Brightloop Monthly',
        'Monthly seeded plan', 1, true
      FROM customers
      WHERE ${DEMO_CUSTOMERS}
      ON CONFLICT (customer_id, plan_number) DO NOTHING
    `);

    await runStep('plan pricing', `
      INSERT INTO plan_pricing (plan_id, period, price)
      SELECT plans.id, 'monthly', 99.99
      FROM plans
      WHERE plans.plan_number LIKE 'DEMO-PLAN-%'
      ON CONFLICT (plan_id, period) DO NOTHING
    `);

    await runStep('subscriptions', `
      INSERT INTO subscriptions (
        customer_id, subscription_number, plan_id, period, quantity, unit_price,
        start_date, next_billing_date, auto_renew, status
      )
      SELECT plans.customer_id,
        'DEMO-SUB-' || plans.id || '-' || slots.number,
        plans.id,
        'monthly',
        '1.00',
        '99.99',
        CURRENT_DATE - INTERVAL '120 days',
        CURRENT_DATE + (((plans.id + slots.number) % 28)::integer),
        true,
        CASE
          WHEN (plans.id + slots.number) % 20 = 0 THEN 'Paused'
          WHEN (plans.id + slots.number) % 37 = 0 THEN 'Cancelled'
          ELSE 'Active'
        END
      FROM plans
      CROSS JOIN (VALUES (1), (2)) AS slots(number)
      WHERE plans.plan_number LIKE 'DEMO-PLAN-%'
      ON CONFLICT (customer_id, subscription_number) DO NOTHING
    `);

    await runStep('subscription items', `
      INSERT INTO subscription_items (subscription_id, product_variant_id, quantity, unit_price)
      SELECT subscriptions.id, variants.id, '1.00', '99.99'
      FROM subscriptions
      JOIN products ON products.customer_id = subscriptions.customer_id
        AND products.sku LIKE 'DEMO-PROD-%'
      JOIN product_variants AS variants ON variants.product_id = products.id
        AND variants.variant_key = 'standard'
      WHERE ${DEMO_SUBSCRIPTIONS}
        AND NOT EXISTS (
          SELECT 1 FROM subscription_items
          WHERE subscription_items.subscription_id = subscriptions.id
        )
    `);

    await runStep('invoice history', `
      INSERT INTO invoices (
        customer_id, subscription_id, invoice_number, period_start, period_end,
        subtotal, tax_amount, discount_total, total, issued_date, due_date, status, trace
      )
      SELECT subscriptions.customer_id,
        subscriptions.id,
        'DEMO-INV-' || subscriptions.id || '-' || cycles.number,
        (date_trunc('month', CURRENT_DATE) - (cycles.number * INTERVAL '1 month'))::date,
        (date_trunc('month', CURRENT_DATE) - ((cycles.number - 1) * INTERVAL '1 month') - INTERVAL '1 day')::date,
        '99.99', '8.25', '0.00', '108.24',
        (date_trunc('month', CURRENT_DATE) - (cycles.number * INTERVAL '1 month'))::date,
        (date_trunc('month', CURRENT_DATE) - (cycles.number * INTERVAL '1 month') + INTERVAL '15 days')::date,
        CASE WHEN cycles.number = 3 THEN 'Paid' ELSE 'Confirmed' END,
        jsonb_build_object('seeded', true, 'cycle', cycles.number)
      FROM subscriptions
      CROSS JOIN generate_series(1, 3) AS cycles(number)
      WHERE ${DEMO_SUBSCRIPTIONS}
      ON CONFLICT (subscription_id, period_start) DO NOTHING
    `);

    await runStep('invoice line items', `
      INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price, line_total,
        tax_rate, tax_amount, discount_percent, discount_amount
      )
      SELECT invoices.id, 'Brightloop monthly service', '1.00', '99.99', '99.99',
        0.0825, '8.25', '0.00', '0.00'
      FROM invoices
      WHERE ${DEMO_INVOICES}
        AND NOT EXISTS (
          SELECT 1 FROM invoice_line_items
          WHERE invoice_line_items.invoice_id = invoices.id
        )
    `);

    await runStep('payments', `
      INSERT INTO payments (invoice_id, customer_id, amount, payment_method, status, notes)
      SELECT invoices.id,
        invoices.customer_id,
        CASE
          WHEN invoices.status = 'Paid' THEN '108.24'::numeric
          ELSE '54.12'::numeric
        END,
        'local-demo',
        'Received',
        'Seeded payment'
      FROM invoices
      JOIN subscriptions ON subscriptions.id = invoices.subscription_id
      WHERE ${DEMO_INVOICES}
        AND (
          invoices.status = 'Paid'
          OR (invoices.status = 'Confirmed' AND subscriptions.id % 10 = 0)
        )
        AND NOT EXISTS (
          SELECT 1 FROM payments
          WHERE payments.invoice_id = invoices.id AND payments.notes = 'Seeded payment'
        )
    `);

    await runStep('discount rules', `
      INSERT INTO discount_rules (customer_id, name, discount_percent, description, is_active)
      SELECT customers.id, 'Demo expected 10% discount', 10.00,
        'Used by the seeded missing-discount leakage scenario', true
      FROM customers
      WHERE ${DEMO_CUSTOMERS}
        AND customers.id = (
          SELECT min(id) FROM customers WHERE ${DEMO_CUSTOMERS}
        )
        AND NOT EXISTS (
          SELECT 1 FROM discount_rules
          WHERE discount_rules.customer_id = customers.id
            AND discount_rules.name = 'Demo expected 10% discount'
        )
    `);

    await runStep('missing-invoice anomaly subscription', `
      INSERT INTO subscriptions (
        customer_id, subscription_number, plan_id, period, quantity, unit_price,
        start_date, next_billing_date, auto_renew, status
      )
      SELECT plans.customer_id, 'DEMO-ANOM-MISSING-INVOICE', plans.id, 'monthly',
        '1.00', '99.99', CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '7 days',
        true, 'Active'
      FROM plans
      WHERE plans.customer_id = (SELECT min(id) FROM customers WHERE ${DEMO_CUSTOMERS})
        AND plans.plan_number LIKE 'DEMO-PLAN-%'
      ON CONFLICT (customer_id, subscription_number) DO NOTHING
    `);

    await runStep('duplicate-invoice anomaly', `
      WITH targets AS (
        SELECT invoices.id
        FROM invoices
        JOIN subscriptions ON subscriptions.id = invoices.subscription_id
        WHERE ${DEMO_SUBSCRIPTIONS}
          AND invoices.period_start = (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date
        ORDER BY invoices.id
        LIMIT 2
      )
      UPDATE invoices
      SET invoice_number = 'DEMO-DUPLICATE-INVOICE'
      FROM targets
      WHERE invoices.id = targets.id
    `);

    await runStep('missing-discount anomaly', `
      WITH target AS (
        SELECT invoices.id
        FROM invoices
        JOIN subscriptions ON subscriptions.id = invoices.subscription_id
        WHERE ${DEMO_INVOICES}
          AND subscriptions.customer_id = (SELECT min(id) FROM customers WHERE ${DEMO_CUSTOMERS})
        ORDER BY invoices.id
        LIMIT 1
      )
      UPDATE invoices
      SET trace = jsonb_build_object(
        'seed_anomaly', 'missing_discount',
        'expected_discount_percent', '10.00'
      )
      FROM target
      WHERE invoices.id = target.id
    `);

    await runStep('unmatched-payment anomaly', `
      WITH target AS (
        SELECT invoices.id, invoices.customer_id
        FROM invoices
        WHERE ${DEMO_INVOICES}
        ORDER BY invoices.id DESC
        LIMIT 1
      ), cancelled AS (
        UPDATE invoices
        SET status = 'Cancelled'
        FROM target
        WHERE invoices.id = target.id
        RETURNING invoices.id, invoices.customer_id
      )
      INSERT INTO payments (invoice_id, customer_id, amount, payment_method, status, notes)
      SELECT id, customer_id, '108.24', 'local-demo', 'Received', 'Seeded unmatched payment'
      FROM cancelled
      WHERE NOT EXISTS (
        SELECT 1 FROM payments
        WHERE payments.invoice_id = cancelled.id
          AND payments.notes = 'Seeded unmatched payment'
      )
    `);

    const counts = await client.query(`
      SELECT
        (SELECT count(*) FROM customers WHERE ${DEMO_CUSTOMERS}) AS customers,
        (SELECT count(*) FROM subscriptions WHERE ${DEMO_SUBSCRIPTIONS}) AS subscriptions,
        (SELECT count(*) FROM invoices WHERE ${DEMO_INVOICES}) AS invoices
    `);

    await client.query('COMMIT');
    console.log(`✓ Seed complete: ${counts.rows[0].customers} customers, ${counts.rows[0].subscriptions} subscriptions, ${counts.rows[0].invoices} invoices`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

seed();
