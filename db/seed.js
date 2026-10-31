#!/usr/bin/env node
/**
 * Seed script for local demos.
 *
 *   SEED_ADMIN_ONLY=true npm run seed   -> only the admin account
 *   npm run seed                        -> admin, staff, demo customers, catalog, plans, template,
 *                                          a volume discount, and subscriptions in every
 *                                          lifecycle state (run POST /api/billing/run to invoice them)
 *   SEED_SCALE=10000 npm run seed       -> additionally tops up to N bulk subscriptions for
 *                                          pagination/performance checks
 *
 * Re-runnable: every insert is keyed on a natural unique value or guarded by an existence check.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

const DEMO_PASSWORD = 'DemoPass123!';
const DEMO_CUSTOMERS = ['Northwind Labs', 'Contoso Studio', 'Fabrikam Works'];
const SCALE_CUSTOMERS = 200;

// Must match apps/api/src/common/password.ts (bcrypt over a SHA-256 pre-hash).
function hashPassword(password) {
  const digest = createHash('sha256').update(password, 'utf8').digest('base64');
  return bcrypt.hash(`brightloop-v1:${digest}`, 12);
}

async function upsertStaffUser(email, password, role, name) {
  await client.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lower(email)) DO UPDATE
     SET customer_id = NULL, password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role, name = EXCLUDED.name, is_active = true,
         updated_at = CURRENT_TIMESTAMP`,
    [email, await hashPassword(password), role, name],
  );
}

async function seedCustomers(passwordHash) {
  const customers = [];
  for (const [index, legalName] of DEMO_CUSTOMERS.entries()) {
    const customer = await client.query(
      `INSERT INTO customers (legal_name) VALUES ($1)
       ON CONFLICT (legal_name) DO UPDATE SET legal_name = EXCLUDED.legal_name
       RETURNING id`,
      [legalName],
    );
    const customerId = Number(customer.rows[0].id);
    const email = `customer${index + 1}@brightloop.local`;
    await client.query(
      `INSERT INTO users (customer_id, email, password_hash, role, name)
       VALUES ($1, $2, $3, 'customer', $4)
       ON CONFLICT (lower(email)) DO UPDATE
       SET customer_id = EXCLUDED.customer_id, password_hash = EXCLUDED.password_hash,
           role = 'customer', is_active = true`,
      [customerId, email, passwordHash, legalName],
    );
    customers.push({ id: customerId, email, legalName });
  }
  return customers;
}

async function seedCatalog() {
  const tax = await client.query(
    `INSERT INTO tax_rules (name, jurisdiction, rate) VALUES ('GST 18%', 'IN', 0.18)
     ON CONFLICT (name) DO UPDATE SET rate = EXCLUDED.rate
     RETURNING id`,
  );
  const taxId = Number(tax.rows[0].id);

  const products = {};
  for (const product of [
    { sku: 'ERP-LICENSE', name: 'ERP License', price: '1000.00', cost: '300.00' },
    { sku: 'SUPPORT-HOURS', name: 'Support Hours', price: '250.00', cost: '120.00' },
  ]) {
    const row = await client.query(
      `INSERT INTO products (sku, name, type, sales_price, cost_price, notes)
       VALUES ($1, $2, 'service', $3, $4, 'Demo product')
       ON CONFLICT (sku) DO UPDATE SET sales_price = EXCLUDED.sales_price, cost_price = EXCLUDED.cost_price
       RETURNING id`,
      [product.sku, product.name, product.price, product.cost],
    );
    products[product.sku] = Number(row.rows[0].id);
    await client.query(
      'INSERT INTO product_taxes (product_id, tax_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [products[product.sku], taxId],
    );
  }

  const variant = await client.query(
    `INSERT INTO product_variants (product_id, variant_key, name, value, extra_price)
     VALUES ($1, 'brand-odoo', 'Brand', 'Odoo', 560)
     ON CONFLICT (product_id, variant_key) DO UPDATE SET extra_price = EXCLUDED.extra_price
     RETURNING id`,
    [products['ERP-LICENSE']],
  );
  return { products, odooVariantId: Number(variant.rows[0].id), taxId };
}

async function seedPlans() {
  const plans = {};
  for (const plan of [
    // Flexible: customers can pause, close early and renew.
    { number: 'MONTHLY-FLEX', name: 'Monthly Flex', price: '99.00', period: 'monthly',
      autoClose: false, earlyClose: true, pause: true, renew: true },
    // Fixed annual contract: renewable, closes itself at expiry, no pause or early exit.
    { number: 'YEARLY-FIXED', name: 'Yearly Fixed', price: '999.00', period: 'yearly',
      autoClose: true, earlyClose: false, pause: false, renew: true },
    // Short trial: no pause, no renewal, auto-closes.
    { number: 'WEEKLY-TRIAL', name: 'Weekly Trial', price: '25.00', period: 'weekly',
      autoClose: true, earlyClose: true, pause: false, renew: false },
  ]) {
    const row = await client.query(
      `INSERT INTO plans (plan_number, name, price, period, min_quantity, auto_close,
         allow_early_close, allow_pause, allow_renew)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)
       ON CONFLICT (plan_number) DO UPDATE
       SET name = EXCLUDED.name, price = EXCLUDED.price, period = EXCLUDED.period,
           auto_close = EXCLUDED.auto_close, allow_early_close = EXCLUDED.allow_early_close,
           allow_pause = EXCLUDED.allow_pause, allow_renew = EXCLUDED.allow_renew
       RETURNING id, period`,
      [plan.number, plan.name, plan.price, plan.period, plan.autoClose, plan.earlyClose, plan.pause, plan.renew],
    );
    plans[plan.number] = { id: Number(row.rows[0].id), period: row.rows[0].period, price: plan.price };
  }
  return plans;
}

async function seedTemplate(planId, catalog) {
  const existing = await client.query("SELECT id FROM quotation_templates WHERE name = 'Starter ERP bundle'");
  if (existing.rowCount) return;
  const template = await client.query(
    `INSERT INTO quotation_templates (name, description, plan_id, validity_days)
     VALUES ('Starter ERP bundle', 'ERP license (Odoo brand) plus two support hours', $1, 30)
     RETURNING id`,
    [planId],
  );
  const templateId = template.rows[0].id;
  await client.query(
    `INSERT INTO quotation_template_lines
       (template_id, line_number, product_id, product_variant_id, quantity, quantity_value, unit_price)
     VALUES ($1, 1, $2, $3, 1, 1, 1560), ($1, 2, $4, NULL, 2, 2, 250)`,
    [templateId, catalog.products['ERP-LICENSE'], catalog.odooVariantId, catalog.products['SUPPORT-HOURS']],
  );
}

// A volume discount the billing run applies by itself to subscriptions with 2+ seats.
async function seedDiscount() {
  await client.query(
    `INSERT INTO discount_rules (name, description, kind, value, applies_to, min_quantity, usage_limit)
     SELECT 'Volume 10% (2+ seats)', 'Applied automatically when an invoice has 2 or more units',
       'percentage', 10, 'subscription', 2, 100
     WHERE NOT EXISTS (SELECT 1 FROM discount_rules WHERE name = 'Volume 10% (2+ seats)')`,
  );
}

// Each demo subscription walks the real lifecycle so its history reads like the API produced it.
const LIFECYCLE = ['Draft', 'Quotation', 'Confirmed', 'Active'];
const ACTIONS = {
  'Draft->Quotation': 'send_quotation',
  'Quotation->Confirmed': 'confirm',
  'Confirmed->Active': 'activate',
  'Active->Paused': 'pause',
  'Active->Closed': 'close',
};

function statusPath(status) {
  if (status === 'Paused' || status === 'Closed') return [...LIFECYCLE, status];
  return LIFECYCLE.slice(0, LIFECYCLE.indexOf(status) + 1);
}

async function seedDemoSubscriptions(customers, plans, catalog) {
  const existing = await client.query(
    'SELECT 1 FROM subscriptions WHERE customer_id = ANY($1::bigint[]) LIMIT 1',
    [customers.map((customer) => customer.id)],
  );
  if (existing.rowCount) return 0;

  const demos = [
    { customer: 0, plan: 'MONTHLY-FLEX', status: 'Active', expiresInDays: 12 },
    { customer: 0, plan: 'MONTHLY-FLEX', status: 'Paused', expiresInDays: 200 },
    { customer: 0, plan: 'YEARLY-FIXED', status: 'Quotation', expiresInDays: 365 },
    { customer: 1, plan: 'YEARLY-FIXED', status: 'Active', expiresInDays: 25 },
    { customer: 1, plan: 'WEEKLY-TRIAL', status: 'Active', expiresInDays: 5 },
    { customer: 1, plan: 'MONTHLY-FLEX', status: 'Draft', expiresInDays: 90 },
    { customer: 2, plan: 'MONTHLY-FLEX', status: 'Confirmed', expiresInDays: 120 },
    { customer: 2, plan: 'YEARLY-FIXED', status: 'Active', expiresInDays: 300 },
    { customer: 2, plan: 'WEEKLY-TRIAL', status: 'Closed', expiresInDays: -10 },
    { customer: 2, plan: 'MONTHLY-FLEX', status: 'Active', expiresInDays: null },
  ];

  for (const demo of demos) {
    const plan = plans[demo.plan];
    const live = demo.status === 'Active' || demo.status === 'Paused';
    const subscription = await client.query(
      `INSERT INTO subscriptions (customer_id, plan_id, period, quantity, unit_price, start_date,
         expiry_date, payment_terms, status, next_billing_date, paused_at, closed_at)
       VALUES ($1, $2, $3, 3, $4, CURRENT_DATE - 30,
         CASE WHEN $5::int IS NULL THEN NULL ELSE CURRENT_DATE + $5::int END,
         'Net 15', $6,
         CASE WHEN $7 THEN CURRENT_DATE + 5 ELSE NULL END,
         CASE WHEN $6 = 'Paused' THEN CURRENT_DATE - 3 ELSE NULL END,
         CASE WHEN $6 = 'Closed' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING id`,
      [customers[demo.customer].id, plan.id, plan.period, plan.price, demo.expiresInDays, demo.status, live],
    );
    const subscriptionId = subscription.rows[0].id;

    // ERP license with the Odoo brand variant (1000 + 560) and two support hours, 18% GST.
    await client.query(
      `INSERT INTO subscription_items (subscription_id, product_id, product_variant_id, description,
         quantity, unit_price, amount, tax_amount, tax_ids)
       VALUES
         ($1, $2, $3, 'ERP License (Brand: Odoo)', 1, 1560.00, 1560.00, 280.80, ARRAY[$5]::bigint[]),
         ($1, $4, NULL, 'Support Hours', 2, 250.00, 500.00, 90.00, ARRAY[$5]::bigint[])`,
      [subscriptionId, catalog.products['ERP-LICENSE'], catalog.odooVariantId,
        catalog.products['SUPPORT-HOURS'], catalog.taxId],
    );

    let previous = null;
    for (const status of statusPath(demo.status)) {
      const action = previous === null ? 'created' : ACTIONS[`${previous}->${status}`];
      await client.query(
        `INSERT INTO subscription_history (subscription_id, status, from_status, to_status, action, reason)
         VALUES ($1, $2, $3, $2, $4, 'seed')`,
        [subscriptionId, status, previous, action],
      );
      previous = status;
    }
  }
  return demos.length;
}

// Bulk rows for the "fast at 10k+ subscriptions" requirement; built set-wise in SQL.
async function seedScale(target, plans, catalog) {
  if (!Number.isInteger(target) || target <= 0) return 0;
  await client.query(
    `INSERT INTO customers (legal_name)
     SELECT 'Scale Customer ' || n FROM generate_series(1, $1) AS n
     ON CONFLICT (legal_name) DO NOTHING`,
    [SCALE_CUSTOMERS],
  );
  const existing = await client.query(
    `SELECT count(*)::int AS total FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id WHERE c.legal_name LIKE 'Scale Customer %'`,
  );
  const missing = target - existing.rows[0].total;
  if (missing <= 0) return 0;

  const planIds = Object.values(plans).map((plan) => plan.id);
  await client.query('BEGIN');
  try {
    const inserted = await client.query(
      `WITH scale_customers AS (
         SELECT id, row_number() OVER (ORDER BY id) - 1 AS slot
         FROM customers WHERE legal_name LIKE 'Scale Customer %'
       ),
       rows AS (
         SELECT n, (n % $2) AS customer_slot, ($3::bigint[])[1 + n % cardinality($3::bigint[])] AS plan_id,
           (ARRAY['Draft','Quotation','Confirmed','Active','Active','Active','Paused','Closed'])[1 + n % 8] AS status
         FROM generate_series(1, $1) AS n
       )
       INSERT INTO subscriptions (customer_id, plan_id, period, quantity, unit_price, start_date,
         expiry_date, payment_terms, status, next_billing_date)
       SELECT c.id, r.plan_id, p.period, 1, p.price, CURRENT_DATE - (r.n % 300),
         CURRENT_DATE + (r.n % 400) - 30, 'Due on receipt', r.status,
         CASE WHEN r.status = 'Active' THEN CURRENT_DATE + (r.n % 28) ELSE NULL END
       FROM rows r
       JOIN scale_customers c ON c.slot = r.customer_slot
       JOIN plans p ON p.id = r.plan_id
       RETURNING id, status`,
      [missing, SCALE_CUSTOMERS, planIds],
    );
    await client.query(
      `INSERT INTO subscription_items (subscription_id, product_id, description, quantity, unit_price,
         amount, tax_amount, tax_ids)
       SELECT id, $2, 'Support Hours', 1, 250.00, 250.00, 45.00, ARRAY[$3]::bigint[]
       FROM unnest($1::bigint[]) AS id`,
      [inserted.rows.map((row) => row.id), catalog.products['SUPPORT-HOURS'], catalog.taxId],
    );
    await client.query(
      `INSERT INTO subscription_history (subscription_id, status, from_status, to_status, action, reason)
       SELECT id, status, NULL, status, 'created', 'scale seed'
       FROM unnest($1::bigint[], $2::text[]) AS row(id, status)`,
      [inserted.rows.map((row) => row.id), inserted.rows.map((row) => row.status)],
    );
    await client.query('COMMIT');
    return inserted.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function seed() {
  await client.connect();
  try {
    const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@brightloop.local').trim().toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
    await upsertStaffUser(adminEmail, adminPassword, 'admin', 'Brightloop Administrator');
    console.log(`✓ Admin account ${adminEmail}`);
    if (process.env.SEED_ADMIN_ONLY === 'true') {
      console.log('✓ Admin-only seed complete');
      return;
    }

    await upsertStaffUser('staff@brightloop.local', DEMO_PASSWORD, 'staff', 'Brightloop Staff');
    const customers = await seedCustomers(await hashPassword(DEMO_PASSWORD));
    const catalog = await seedCatalog();
    const plans = await seedPlans();
    await seedTemplate(plans['MONTHLY-FLEX'].id, catalog);
    await seedDiscount();
    const demoCount = await seedDemoSubscriptions(customers, plans, catalog);
    console.log(`✓ Catalog, plans, template; ${demoCount} new demo subscriptions`);

    const scaleCount = await seedScale(Number(process.env.SEED_SCALE || 0), plans, catalog);
    if (scaleCount) console.log(`✓ ${scaleCount} bulk subscriptions for scale testing`);

    console.log('\nDemo logins:');
    console.log(`  admin     ${adminEmail} / ${adminPassword}`);
    console.log(`  staff     staff@brightloop.local / ${DEMO_PASSWORD}`);
    for (const customer of customers) {
      console.log(`  customer  ${customer.email} / ${DEMO_PASSWORD}  (${customer.legalName})`);
    }
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
