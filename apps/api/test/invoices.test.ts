import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import {
  loginStaff,
  signupCustomer,
  createPlan,
  createProduct,
  createSubscription,
  activate,
} from './fixtures/subscriptions.js';

describe('invoice lifecycle and queries', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  });

  it('requires staff access, confirms and sends invoices, and prints escaped invoice data', async () => {
    const staff = await loginStaff(pool, 'invoice-staff@example.test', 'admin');
    const { agent: customerAgent, customerId } = await signupCustomer(pool, 'invoice-customer@example.test');
    const { productId } = await createProduct(pool, 'INVOICE-TEST', '80.00');
    const planId = await createPlan(pool, 'INVOICE-TEST-PLAN');
    const subscription = await createSubscription(staff, {
      customerId,
      planId,
      productId,
      startDate: '2026-01-01',
    });
    const subscriptionId = subscription.body.data.id as number;
    await activate(staff, subscriptionId);
    await pool.query("UPDATE subscriptions SET next_billing_date='2026-01-01' WHERE id=$1", [subscriptionId]);
    await staff.post('/api/billing/run?asOf=2026-01-01').expect(200);
    const invoiceId = Number(
      (await pool.query<{ id: string }>('SELECT id FROM invoices WHERE subscription_id=$1', [subscriptionId]))
        .rows[0].id,
    );

    await request(app).get('/api/invoices').expect(401);
    await customerAgent.get('/api/invoices').expect(403);
    await staff.post(`/api/invoices/${invoiceId}/confirm`).send({}).expect(200);
    const sent = await staff.post(`/api/invoices/${invoiceId}/send`).send({ reason: 'Ready' });
    expect(sent.status).toBe(200);
    const history = await pool.query<{ action: string }>(
      'SELECT action FROM invoice_status_history WHERE invoice_id=$1 ORDER BY id',
      [invoiceId],
    );
    expect(history.rows.map((row) => row.action)).toEqual(['generated', 'confirm', 'send']);
    const outbox = await pool.query('SELECT 1 FROM outbox_emails WHERE customer_id=$1', [customerId]);
    expect(outbox.rowCount).toBe(1);
    await pool.query(
      `INSERT INTO payments (invoice_id, customer_id, amount, payment_method, status)
       VALUES ($1, $2, '1.00', 'manual', 'Received')`,
      [invoiceId, customerId],
    );
    await staff.post(`/api/invoices/${invoiceId}/cancel`).send({}).expect(409);
    const detail = await staff.get(`/api/invoices/${invoiceId}`).expect(200);
    expect(detail.body.data.lines).toHaveLength(1);
    expect(detail.body.data.history).toHaveLength(3);
    expect(detail.body.data.payments).toHaveLength(1);
    const printed = await staff.get(`/api/invoices/${invoiceId}/print`).expect(200);
    expect(printed.text).toContain('Brightloop Software');
    expect(printed.text).toContain('INV-');
    expect((await staff.get('/api/invoices?page=1&pageSize=1')).body.meta).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 1,
    });
    expect((await staff.get('/api/invoices?overdue=true')).body.data).toHaveLength(1);
  });

  it('rejects invalid moves and releases usage when a draft invoice is cancelled', async () => {
    const staff = await loginStaff(pool, 'invoice-cancel-staff@example.test', 'staff');
    const { customerId } = await signupCustomer(pool, 'invoice-cancel-customer@example.test');
    const { productId } = await createProduct(pool, 'INVOICE-CANCEL', '25.00');
    const planId = await createPlan(pool, 'INVOICE-CANCEL-PLAN');
    const subscription = await createSubscription(staff, {
      customerId,
      planId,
      productId,
      startDate: '2026-01-01',
    });
    const subscriptionId = subscription.body.data.id as number;
    await activate(staff, subscriptionId);
    await pool.query("UPDATE subscriptions SET next_billing_date='2026-01-01' WHERE id=$1", [subscriptionId]);
    await staff.post('/api/billing/run?asOf=2026-01-01').expect(200);
    const invoiceId = Number(
      (await pool.query<{ id: string }>('SELECT id FROM invoices WHERE subscription_id=$1', [subscriptionId]))
        .rows[0].id,
    );
    await staff.post(`/api/invoices/${invoiceId}/send`).send({}).expect(409);
    const discount = await pool.query<{ id: string }>(
      `INSERT INTO discount_rules (name, discount_percent, kind, value, usage_limit, times_used)
       VALUES ('Released discount', 10, 'percentage', 10, 1, 1) RETURNING id`,
    );
    await pool.query(
      'INSERT INTO discount_usage (discount_rule_id, invoice_id, amount) VALUES ($1, $2, 2.50)',
      [discount.rows[0].id, invoiceId],
    );
    await staff.post(`/api/invoices/${invoiceId}/cancel`).send({ reason: 'Duplicate' }).expect(200);
    const status = await pool.query<{ status: string }>('SELECT status FROM invoices WHERE id=$1', [
      invoiceId,
    ]);
    expect(status.rows[0].status).toBe('Cancelled');
    const released = await pool.query<{ times_used: number }>(
      'SELECT times_used FROM discount_rules WHERE id=$1',
      [discount.rows[0].id],
    );
    expect(released.rows[0].times_used).toBe(0);
  });
});
