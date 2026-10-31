import request from 'supertest';
import type { Pool } from 'pg';
import { app } from '../../src/index.js';
import { hashPassword } from '../../src/common/password.js';

export type Agent = ReturnType<typeof request.agent>;

// Catalog rows are inserted with SQL so these tests depend only on the schema, not on the
// catalog API's request shapes.
export interface PlanFlags {
  autoClose?: boolean;
  allowEarlyClose?: boolean;
  allowPause?: boolean;
  allowRenew?: boolean;
  minQuantity?: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export async function loginStaff(pool: Pool, email: string, role: 'admin' | 'staff'): Promise<Agent> {
  const password = 'StaffPass1!';
  await pool.query(
    `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [email, await hashPassword(password), role, email],
  );
  const agent = request.agent(app);
  const login = await agent.post('/api/auth/login').send({ email, password });
  if (login.status !== 200) throw new Error(`login failed for ${email}: ${login.status}`);
  return agent;
}

export async function signupCustomer(pool: Pool, email: string): Promise<{ agent: Agent; customerId: number }> {
  const password = 'CustomerPass1!';
  const signup = await request(app).post('/api/auth/signup').send({ email, password });
  if (signup.status !== 201) throw new Error(`signup failed for ${email}: ${signup.status}`);
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password });
  const user = await pool.query<{ customer_id: string }>('SELECT customer_id FROM users WHERE email = $1', [email]);
  return { agent, customerId: Number(user.rows[0].customer_id) };
}

export async function createProduct(pool: Pool, sku: string, salesPrice = '1000.00', taxRate?: string) {
  const product = await pool.query<{ id: string }>(
    `INSERT INTO products (sku, name, type, sales_price, cost_price)
     VALUES ($1, $2, 'service', $3, '100.00') RETURNING id`,
    [sku, `Product ${sku}`, salesPrice],
  );
  const productId = Number(product.rows[0].id);
  const variant = await pool.query<{ id: string }>(
    `INSERT INTO product_variants (product_id, variant_key, name, value, extra_price)
     VALUES ($1, 'brand-odoo', 'brand', 'Odoo', '560.00') RETURNING id`,
    [productId],
  );
  if (taxRate) {
    const tax = await pool.query<{ id: string }>(
      `INSERT INTO tax_rules (name, jurisdiction, rate) VALUES ($1, 'IN', $2) RETURNING id`,
      [`Tax ${sku}`, taxRate],
    );
    await pool.query('INSERT INTO product_taxes (product_id, tax_id) VALUES ($1, $2)', [productId, tax.rows[0].id]);
  }
  return { productId, variantId: Number(variant.rows[0].id) };
}

export async function createPlan(pool: Pool, planNumber: string, flags: PlanFlags = {}): Promise<number> {
  const plan = await pool.query<{ id: string }>(
    `INSERT INTO plans (plan_number, name, price, period, min_quantity, available_from, available_until,
       auto_close, allow_early_close, allow_pause, allow_renew)
     VALUES ($1, $2, '99.00', $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      planNumber,
      `Plan ${planNumber}`,
      flags.period ?? 'monthly',
      flags.minQuantity ?? 1,
      flags.availableFrom ?? null,
      flags.availableUntil ?? null,
      flags.autoClose ?? false,
      flags.allowEarlyClose ?? false,
      flags.allowPause ?? false,
      flags.allowRenew ?? false,
    ],
  );
  return Number(plan.rows[0].id);
}

export async function createTemplate(
  pool: Pool,
  planId: number,
  line: { productId: number; variantId: number | null; quantity: string },
  validityDays = 30,
): Promise<number> {
  const template = await pool.query<{ id: string }>(
    `INSERT INTO quotation_templates (name, plan_id, validity_days) VALUES ('Starter', $1, $2) RETURNING id`,
    [planId, validityDays],
  );
  const templateId = Number(template.rows[0].id);
  await pool.query(
    `INSERT INTO quotation_template_lines
       (template_id, line_number, product_id, product_variant_id, quantity, quantity_value, unit_price)
     VALUES ($1, 1, $2, $3, $4, $4, '0')`,
    [templateId, line.productId, line.variantId, line.quantity],
  );
  return templateId;
}

export async function createSubscription(
  staff: Agent,
  input: { customerId: number; planId: number; productId: number; variantId?: number | null;
    quantity?: string; startDate?: string; expiryDate?: string | null },
) {
  return staff.post('/api/subscriptions').send({
    customerId: input.customerId,
    planId: input.planId,
    startDate: input.startDate ?? '2026-01-01',
    expiryDate: input.expiryDate === undefined ? null : input.expiryDate,
    lines: [{ productId: input.productId, variantId: input.variantId ?? null, quantity: input.quantity ?? '1' }],
  });
}

export async function activate(staff: Agent, id: number): Promise<void> {
  for (const to of ['Quotation', 'Confirmed', 'Active']) {
    const response = await staff.post(`/api/subscriptions/${id}/transition`).send({ to });
    if (response.status !== 200) {
      throw new Error(`transition to ${to} failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }
}
