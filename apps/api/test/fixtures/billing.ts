import type { Pool } from 'pg';

export async function createBillingFixture(pool: Pool, suffix: string, dueDate: string, status = 'Confirmed') {
  const customer = await pool.query<{ id: string }>(
    'INSERT INTO customers (legal_name) VALUES ($1) RETURNING id', [`Billing ${suffix}`],
  );
  const customerId = Number(customer.rows[0].id);
  const user = await pool.query<{ id: string }>(
    `INSERT INTO users (customer_id, email, password_hash, role, name)
     VALUES ($1, $2, 'unused', 'customer', $3) RETURNING id`,
    [customerId, `${suffix}@billing.test`, suffix],
  );
  const plan = await pool.query<{ id: string }>(
    `INSERT INTO plans (customer_id, plan_number, name) VALUES ($1, $2, $3) RETURNING id`,
    [customerId, `PLAN-${suffix}`, `Plan ${suffix}`],
  );
  const subscription = await pool.query<{ id: string }>(
    `INSERT INTO subscriptions (customer_id, subscription_number, plan_id, period, quantity, unit_price, start_date)
     VALUES ($1, $2, $3, 'monthly', 1, 10, '2026-01-01') RETURNING id`,
    [customerId, `SUB-${suffix}`, plan.rows[0].id],
  );
  const invoice = await pool.query<{ id: string }>(
    `INSERT INTO invoices (customer_id, subscription_id, invoice_number, period_start, period_end,
       issued_date, due_date, status)
     VALUES ($1, $2, $3, '2026-01-01', '2026-01-31', '2026-01-01', $4, $5) RETURNING id`,
    [customerId, subscription.rows[0].id, `INV-${suffix}`, dueDate, status],
  );
  return { customerId, userId: Number(user.rows[0].id), invoiceId: Number(invoice.rows[0].id) };
}
