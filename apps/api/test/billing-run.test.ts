import { beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/common/db.js';
import { runBilling } from '../src/modules/billing/service.js';
import { transitionInvoice } from '../src/modules/invoices/service.js';
import {
  loginStaff,
  signupCustomer,
  createPlan,
  createProduct,
  createSubscription,
  activate,
} from './fixtures/subscriptions.js';

describe('recurring billing', () => {
  beforeAll(async () => {
    await pool.query('TRUNCATE customers RESTART IDENTITY CASCADE');
  });

  it('creates an invoice once and catches up consecutive missed periods', async () => {
    const staff = await loginStaff(pool, 'billing-run-staff@example.test', 'admin');
    const { customerId } = await signupCustomer(pool, 'billing-run-customer@example.test');
    const { productId } = await createProduct(pool, 'BILLING-RUN', '100.00', '0.18');
    const planId = await createPlan(pool, 'BILLING-RUN-PLAN', { period: 'monthly' });
    const subscriptionResponse = await createSubscription(staff, {
      customerId,
      planId,
      productId,
      startDate: '2026-01-01',
    });
    expect(subscriptionResponse.status).toBe(201);
    const subscriptionId = subscriptionResponse.body.data.id as number;
    await activate(staff, subscriptionId);
    await pool.query("UPDATE subscriptions SET next_billing_date = '2026-01-01' WHERE id = $1", [
      subscriptionId,
    ]);

    const first = await staff.post('/api/billing/run?asOf=2026-03-15');
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(3);
    expect(first.body.data.invoiceIds).toHaveLength(3);
    const second = await staff.post('/api/billing/run?asOf=2026-03-15');
    expect(second.status).toBe(200);
    expect(second.body.data.created).toBe(0);

    const rows = await pool.query<{
      period_start: string;
      period_end: string;
      subtotal: string;
      tax_amount: string;
    }>(
      `SELECT period_start::text, period_end::text, subtotal, tax_amount
       FROM invoices WHERE subscription_id = $1 ORDER BY period_start`,
      [subscriptionId],
    );
    expect(rows.rows.map((row) => [row.period_start, row.period_end])).toEqual([
      ['2026-01-01', '2026-01-31'],
      ['2026-02-01', '2026-02-28'],
      ['2026-03-01', '2026-03-31'],
    ]);
    expect(rows.rows[0].subtotal).toBe('100.00');
    expect(rows.rows[0].tax_amount).toBe('18.00');
    const nextDate = await pool.query<{ next_billing_date: string }>(
      'SELECT next_billing_date::text FROM subscriptions WHERE id = $1',
      [subscriptionId],
    );
    expect(nextDate.rows[0].next_billing_date).toBe('2026-04-01');
  });

  it('serializes concurrent runs and enforces a locked single-use discount', async () => {
    const staff = await loginStaff(pool, 'billing-concurrent-staff@example.test', 'admin');
    const { customerId } = await signupCustomer(pool, 'billing-concurrent-customer@example.test');
    const { productId } = await createProduct(pool, 'BILLING-CONCURRENT', '100.00');
    const planId = await createPlan(pool, 'BILLING-CONCURRENT-PLAN');
    const subscriptionIds: number[] = [];
    for (let index = 0; index < 2; index += 1) {
      const subscription = await createSubscription(staff, {
        customerId,
        planId,
        productId,
        startDate: '2026-01-01',
      });
      const id = subscription.body.data.id as number;
      await activate(staff, id);
      await pool.query("UPDATE subscriptions SET next_billing_date='2026-01-01' WHERE id=$1", [id]);
      subscriptionIds.push(id);
    }
    await pool.query(
      `INSERT INTO discount_rules
         (name, discount_percent, kind, value, applies_to, usage_limit, times_used, is_active)
       VALUES ('Single use', 10, 'percentage', 10, 'subscription', 1, 0, TRUE)`,
    );
    const results = await Promise.all([
      staff.post('/api/billing/run?asOf=2026-01-01'),
      staff.post('/api/billing/run?asOf=2026-01-01'),
    ]);
    expect(results.map((response) => response.status)).toEqual([200, 200]);
    const invoices = await pool.query<{ id: string }>(
      'SELECT id FROM invoices WHERE subscription_id = ANY($1::bigint[])',
      [subscriptionIds],
    );
    expect(invoices.rowCount).toBe(2);
    const usage = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM discount_usage');
    expect(usage.rows[0].count).toBe('1');
    const used = await pool.query<{ times_used: number }>(
      "SELECT times_used FROM discount_rules WHERE name='Single use'",
    );
    expect(used.rows[0].times_used).toBe(1);
  });

  it('rolls back one failed subscription and keeps billing the rest', async () => {
    const staff = await loginStaff(pool, 'billing-rollback-staff@example.test', 'admin');
    const { customerId } = await signupCustomer(pool, 'billing-rollback-customer@example.test');
    const healthy = await createProduct(pool, 'BILLING-HEALTHY', '100.00');
    const failing = await createProduct(pool, 'BILLING-FAIL', '100.00');
    const planId = await createPlan(pool, 'BILLING-ROLLBACK-PLAN');
    const subscriptionIds: number[] = [];
    // The failing subscription is billed first, so the run must carry on past it.
    for (const productId of [failing.productId, healthy.productId]) {
      const subscription = await createSubscription(staff, {
        customerId,
        planId,
        productId,
        startDate: '2026-01-01',
      });
      const id = subscription.body.data.id as number;
      await activate(staff, id);
      await pool.query("UPDATE subscriptions SET next_billing_date='2026-01-01' WHERE id=$1", [id]);
      subscriptionIds.push(id);
    }
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_billing_test_line() RETURNS trigger AS $$
      BEGIN
        IF NEW.description = 'Product BILLING-FAIL' THEN
          RAISE EXCEPTION 'simulated invoice line failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_billing_test_line_trigger
        BEFORE INSERT ON invoice_line_items FOR EACH ROW EXECUTE FUNCTION reject_billing_test_line();
    `);

    const run = await staff.post('/api/billing/run?asOf=2026-01-01').expect(200);
    expect(run.body.data.failed).toEqual([
      {
        subscription_id: subscriptionIds[0],
        error: expect.stringContaining('simulated invoice line failure'),
      },
    ]);
    const invoices = await pool.query<{ subscription_id: string }>(
      'SELECT subscription_id FROM invoices WHERE subscription_id = ANY($1::bigint[])',
      [subscriptionIds],
    );
    expect(invoices.rows.map((row) => Number(row.subscription_id))).toEqual([subscriptionIds[1]]);
    const billingDates = await pool.query<{ id: string; next_billing_date: string }>(
      `SELECT id, next_billing_date::text AS next_billing_date
       FROM subscriptions WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [subscriptionIds],
    );
    expect(billingDates.rows.map((row) => row.next_billing_date)).toEqual(['2026-01-01', '2026-02-01']);
    await pool.query('DROP TRIGGER reject_billing_test_line_trigger ON invoice_line_items');
    await pool.query("UPDATE subscriptions SET status='Closed' WHERE id=$1", [subscriptionIds[0]]);
  });

  it('does not bill paused, closed, or expired subscriptions', async () => {
    const staff = await loginStaff(pool, 'billing-inactive-staff@example.test', 'admin');
    const { customerId } = await signupCustomer(pool, 'billing-inactive-customer@example.test');
    const { productId } = await createProduct(pool, 'BILLING-INACTIVE', '100.00');
    const planId = await createPlan(pool, 'BILLING-INACTIVE-PLAN');
    const subscriptionIds: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const subscription = await createSubscription(staff, {
        customerId,
        planId,
        productId,
        startDate: '2026-01-01',
      });
      const id = subscription.body.data.id as number;
      await activate(staff, id);
      await pool.query("UPDATE subscriptions SET next_billing_date='2026-01-01' WHERE id=$1", [id]);
      subscriptionIds.push(id);
    }
    await pool.query("UPDATE subscriptions SET status='Paused' WHERE id=$1", [subscriptionIds[0]]);
    await pool.query("UPDATE subscriptions SET status='Closed' WHERE id=$1", [subscriptionIds[1]]);
    await pool.query(
      "UPDATE subscriptions SET next_billing_date='2026-01-01', expiry_date='2025-12-31' WHERE id=$1",
      [subscriptionIds[2]],
    );

    const response = await staff.post('/api/billing/run?asOf=2026-01-01').expect(200);
    expect(response.body.data.created).toBe(0);
    const invoices = await pool.query('SELECT 1 FROM invoices WHERE subscription_id = ANY($1::bigint[])', [
      subscriptionIds,
    ]);
    expect(invoices.rowCount).toBe(0);
    const billingDates = await pool.query<{ next_billing_date: string }>(
      `SELECT next_billing_date::text AS next_billing_date FROM subscriptions
       WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [subscriptionIds],
    );
    expect(billingDates.rows.map((row) => row.next_billing_date)).toEqual([
      '2026-01-01',
      '2026-01-01',
      '2026-01-01',
    ]);
  });

  it('bills multiple batches with eight workers, catches up periods, and respects a shared discount cap', async () => {
    await pool.query('TRUNCATE customers RESTART IDENTITY CASCADE');
    await pool.query('TRUNCATE discount_rules CASCADE');
    const customer = await pool.query<{ id: string }>("INSERT INTO customers (legal_name) VALUES ('Batch billing customer') RETURNING id");
    const { productId } = await createProduct(pool, 'BATCH-PRICE', '100.00');
    const planId = await createPlan(pool, 'BATCH-PLAN');
    const customerId = customer.rows[0].id;
    await pool.query(`INSERT INTO subscriptions (customer_id, plan_id, period, quantity, unit_price, start_date,
      next_billing_date, status) SELECT $1, $2, 'monthly', 1, 100, '2026-01-01', '2026-01-01', 'Active'
      FROM generate_series(1, 205)`, [customerId, planId]);
    await pool.query(`INSERT INTO subscription_items (subscription_id, product_id, description, quantity, unit_price, amount, tax_amount)
      SELECT id, $1, 'Batch line', 1, 100, 100, 0 FROM subscriptions WHERE customer_id=$2`, [productId, customerId]);
    await pool.query(`INSERT INTO discount_rules (name, kind, value, applies_to, usage_limit)
      VALUES ('Batch limited', 'percentage', 10, 'subscription', 37),
        ('Batch unlimited', 'percentage', 5, 'subscription', NULL)`);
    const results = await Promise.all([
      runBilling('2026-02-01', { id: null }, { concurrency: 8, batchSize: 25 }),
      runBilling('2026-02-01', { id: null }, { concurrency: 8, batchSize: 25 }),
    ]);
    expect(results.flatMap((r) => r.failed)).toEqual([]);
    expect(results.reduce((sum, r) => sum + r.created, 0)).toBe(410);
    const counts = await pool.query<{ name: string; times_used: number }>('SELECT name, times_used FROM discount_rules ORDER BY id');
    expect(counts.rows).toEqual([{ name: 'Batch limited', times_used: 37 }, { name: 'Batch unlimited', times_used: 410 }]);
    const totals = await pool.query('SELECT total, count(*)::int AS count FROM invoices GROUP BY total ORDER BY total');
    expect(totals.rows).toEqual([{ total: '85.50', count: 37 }, { total: '95.00', count: 373 }]);
    const existing = await pool.query<{ id: string }>('SELECT id FROM subscriptions ORDER BY id LIMIT 1');
    await pool.query("UPDATE subscriptions SET next_billing_date='2026-02-01' WHERE id=$1", [existing.rows[0].id]);
    const rerun = await runBilling('2026-02-01', { id: null });
    expect(rerun.created).toBe(0);
    expect(rerun.skippedExisting).toBe(1);
    const dates = await pool.query("SELECT DISTINCT next_billing_date::text FROM subscriptions");
    expect(dates.rows).toEqual([{ next_billing_date: '2026-03-01' }]);
    const actor = await pool.query<{ id: string }>(`INSERT INTO users (email, password_hash, role)
      VALUES ('batch-cancel@test.local', 'unused-test-hash', 'admin') RETURNING id`);
    const discounted = await pool.query<{ id: string }>("SELECT id FROM invoices WHERE total=85.50 ORDER BY id LIMIT 1");
    const [, nextRun] = await Promise.all([
      transitionInvoice(Number(discounted.rows[0].id), 'cancel', { id: Number(actor.rows[0].id) }),
      runBilling('2026-03-01', { id: null }, { concurrency: 8, batchSize: 25 }),
    ]);
    expect(nextRun.failed).toEqual([]);
    expect(nextRun.created).toBe(205);
    const usage = await pool.query<{ times_used: number; actual: number }>(`SELECT r.times_used,
      (SELECT COUNT(*)::int FROM discount_usage u WHERE u.discount_rule_id=r.id) AS actual
      FROM discount_rules r WHERE name='Batch limited'`);
    expect(usage.rows[0].times_used).toBeLessThanOrEqual(37);
    expect(usage.rows[0].times_used).toBe(usage.rows[0].actual);
  });
});
