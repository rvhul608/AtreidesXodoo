import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { addPeriod, todayIso } from '../src/modules/subscriptions/lifecycle.js';
import {
  activate,
  createPlan,
  createProduct,
  createSubscription,
  createTemplate,
  loginStaff,
  signupCustomer,
  type Agent,
} from './fixtures/subscriptions.js';

let staff: Agent;
let customer: Agent;
let customerId: number;
let productId: number;
let variantId: number;
let strictPlan: number;
let flexiblePlan: number;

async function historyOf(id: number) {
  const result = await pool.query<{ from_status: string | null; to_status: string; actor_user_id: string | null }>(
    'SELECT from_status, to_status, actor_user_id FROM subscription_history WHERE subscription_id = $1 ORDER BY id',
    [id],
  );
  return result.rows;
}

async function newActive(planId: number, expiryDate: string | null = null): Promise<number> {
  const created = await createSubscription(staff, { customerId, planId, productId, expiryDate });
  expect(created.status).toBe(201);
  await activate(staff, created.body.data.id);
  return created.body.data.id as number;
}

beforeAll(async () => {
  staff = await loginStaff(pool, 'subs-staff@test.local', 'staff');
  ({ agent: customer, customerId } = await signupCustomer(pool, 'subs-customer@test.local'));
  ({ productId, variantId } = await createProduct(pool, 'SUBS-P1', '1000.00', '0.1800'));
  strictPlan = await createPlan(pool, 'SUBS-STRICT', { minQuantity: 2 });
  flexiblePlan = await createPlan(pool, 'SUBS-FLEX', {
    allowPause: true,
    allowEarlyClose: true,
    allowRenew: true,
    autoClose: true,
  });
});

afterAll(async () => {
  await pool.end();
});

describe('subscription access and creation', () => {
  it('requires staff or admin', async () => {
    expect((await request(app).get('/api/subscriptions')).status).toBe(401);
    expect((await customer.get('/api/subscriptions')).status).toBe(403);
    expect((await customer.post('/api/subscriptions').send({})).status).toBe(403);
  });

  it('prices variant lines with taxes and numbers subscriptions from a sequence', async () => {
    const first = await createSubscription(staff, {
      customerId, planId: strictPlan, productId, variantId, quantity: '2',
    });
    expect(first.status).toBe(201);
    expect(first.body.data.subscription_number).toMatch(/^SUB-\d{6}$/);
    expect(first.body.data.status).toBe('Draft');
    expect(first.body.data.lines[0]).toMatchObject({
      unit_price: '1560.00',
      quantity: '2.00',
      amount: '3120.00',
      tax_amount: '561.60',
    });
    expect(first.body.data.totals).toEqual({ untaxed: '3120.00', tax: '561.60', total: '3681.60' });

    const second = await createSubscription(staff, { customerId, planId: strictPlan, productId, quantity: '2' });
    expect(second.body.data.subscription_number).not.toBe(first.body.data.subscription_number);
    expect(second.body.data.lines[0].unit_price).toBe('1000.00');

    const history = await historyOf(first.body.data.id);
    expect(history).toEqual([expect.objectContaining({ from_status: null, to_status: 'Draft' })]);
  });

  it('rejects quantity below the plan minimum, unavailable plans and bad input', async () => {
    const belowMinimum = await createSubscription(staff, { customerId, planId: strictPlan, productId, quantity: '1' });
    expect(belowMinimum.status).toBe(400);
    expect(belowMinimum.body.error.code).toBe('MIN_QUANTITY');

    const futurePlan = await createPlan(pool, 'SUBS-FUTURE', { availableFrom: '2030-01-01' });
    const unavailable = await createSubscription(staff, { customerId, planId: futurePlan, productId });
    expect(unavailable.body.error.code).toBe('PLAN_UNAVAILABLE');

    const badExpiry = await createSubscription(staff, {
      customerId, planId: flexiblePlan, productId, startDate: '2026-02-01', expiryDate: '2026-01-01',
    });
    expect(badExpiry.body.error.code).toBe('INVALID_EXPIRY');

    const other = await createProduct(pool, 'SUBS-P2');
    const mismatch = await createSubscription(staff, {
      customerId, planId: flexiblePlan, productId, variantId: other.variantId,
    });
    expect(mismatch.body.error.code).toBe('VARIANT_MISMATCH');

    const missingCustomer = await createSubscription(staff, { customerId: 99999999, planId: flexiblePlan, productId });
    expect(missingCustomer.status).toBe(404);

    const badDate = await createSubscription(staff, { customerId, planId: flexiblePlan, productId, startDate: '2026-02-30' });
    expect(badDate.status).toBe(400);
  });

  it('creates from a valid template and rejects an expired one', async () => {
    const templateId = await createTemplate(pool, flexiblePlan, { productId, variantId, quantity: '3' });
    const created = await staff.post('/api/subscriptions/from-template').send({
      templateId, customerId, startDate: '2026-01-01',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ template_id: templateId, plan_id: flexiblePlan });
    expect(created.body.data.lines[0]).toMatchObject({ unit_price: '1560.00', quantity: '3.00' });

    const expired = await createTemplate(pool, flexiblePlan, { productId, variantId: null, quantity: '1' }, 5);
    await pool.query("UPDATE quotation_templates SET created_at = now() - interval '10 days' WHERE id = $1", [expired]);
    const rejected = await staff.post('/api/subscriptions/from-template').send({
      templateId: expired, customerId, startDate: '2026-01-01',
    });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('TEMPLATE_EXPIRED');
  });

  it('edits and deletes only drafts or quotations', async () => {
    const created = await createSubscription(staff, { customerId, planId: flexiblePlan, productId });
    const id = created.body.data.id as number;
    const patched = await staff.patch(`/api/subscriptions/${id}`).send({
      paymentTerms: '30 days',
      lines: [{ productId, variantId, quantity: '4' }],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ payment_terms: '30 days', totals: { total: '7363.20' } });

    await activate(staff, id);
    expect((await staff.patch(`/api/subscriptions/${id}`).send({ paymentTerms: 'x' })).status).toBe(409);
    expect((await staff.delete(`/api/subscriptions/${id}`)).status).toBe(409);

    const draft = await createSubscription(staff, { customerId, planId: flexiblePlan, productId });
    expect((await staff.delete(`/api/subscriptions/${draft.body.data.id}`)).status).toBe(204);
    expect((await staff.get(`/api/subscriptions/${draft.body.data.id}`)).status).toBe(404);
  });

  it('lists with pagination and filters', async () => {
    const page = await staff.get(`/api/subscriptions?customerId=${customerId}&status=Draft&pageSize=1`);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 1, pageSize: 1 });
    expect(page.body.meta.total).toBeGreaterThan(1);
    expect(page.body.data[0].status).toBe('Draft');
    expect((await staff.get('/api/subscriptions?pageSize=101')).status).toBe(400);
    expect((await staff.get('/api/subscriptions?status=Cancelled')).status).toBe(400);
  });
});

describe('subscription lifecycle', () => {
  it('walks Draft -> Quotation -> Confirmed -> Active and records history', async () => {
    const created = await createSubscription(staff, { customerId, planId: flexiblePlan, productId });
    const id = created.body.data.id as number;

    const skip = await staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Active' });
    expect(skip.status).toBe(409);
    expect(skip.body.error.code).toBe('INVALID_TRANSITION');

    await activate(staff, id);
    const detail = await staff.get(`/api/subscriptions/${id}`);
    expect(detail.body.data.status).toBe('Active');
    // Start date 2026-01-01 is in the past, so billing starts today.
    expect(detail.body.data.next_billing_date).toBe(todayIso());
    expect(detail.body.data.history).toHaveLength(4);

    const history = await historyOf(id);
    expect(history.map((row) => [row.from_status, row.to_status])).toEqual([
      [null, 'Draft'],
      ['Draft', 'Quotation'],
      ['Quotation', 'Confirmed'],
      ['Confirmed', 'Active'],
    ]);
    expect(history.every((row) => row.actor_user_id !== null)).toBe(true);
  });

  it('enforces the pause flag and freezes then resumes billing', async () => {
    const strict = await createSubscription(staff, { customerId, planId: strictPlan, productId, quantity: '2' });
    await activate(staff, strict.body.data.id);
    const blocked = await staff.post(`/api/subscriptions/${strict.body.data.id}/transition`).send({ to: 'Paused' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('PLAN_DISALLOWS');

    const id = await newActive(flexiblePlan);
    const paused = await staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Paused' });
    expect(paused.status).toBe(200);
    const pausedDetail = await staff.get(`/api/subscriptions/${id}`);
    expect(pausedDetail.body.data).toMatchObject({ status: 'Paused', paused_at: todayIso() });
    expect(pausedDetail.body.data.next_billing_date).toBe(todayIso());

    const resumed = await staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Active' });
    expect(resumed.status).toBe(200);
    expect(resumed.body.data.next_billing_date).toBe(todayIso());
  });

  it('enforces early close and clears billing on close', async () => {
    const strict = await createSubscription(staff, {
      customerId, planId: strictPlan, productId, quantity: '2', expiryDate: '2099-01-01',
    });
    await activate(staff, strict.body.data.id);
    const blocked = await staff.post(`/api/subscriptions/${strict.body.data.id}/transition`).send({ to: 'Closed' });
    expect(blocked.body.error.code).toBe('PLAN_DISALLOWS');

    const id = await newActive(flexiblePlan, '2099-01-01');
    const closed = await staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Closed', reason: 'moving' });
    expect(closed.status).toBe(200);
    expect(closed.body.data).toMatchObject({ to: 'Closed', action: 'early_close', next_billing_date: null });
    expect((await staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Active' })).status).toBe(409);
  });

  it('renews by one plan period only when the plan allows it', async () => {
    const strict = await createSubscription(staff, {
      customerId, planId: strictPlan, productId, quantity: '2', expiryDate: '2099-01-31',
    });
    await activate(staff, strict.body.data.id);
    expect((await staff.post(`/api/subscriptions/${strict.body.data.id}/renew`)).status).toBe(409);

    const id = await newActive(flexiblePlan, '2099-01-31');
    const renewed = await staff.post(`/api/subscriptions/${id}/renew`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.data).toMatchObject({ from: 'Active', to: 'Active', action: 'renew', expiry_date: '2099-02-28' });
  });

  it('auto-closes expired subscriptions on auto-close plans only', async () => {
    const expiring = await newActive(flexiblePlan, '2027-03-01');
    const strict = await createSubscription(staff, {
      customerId, planId: strictPlan, productId, quantity: '2', expiryDate: '2027-03-01',
    });
    await activate(staff, strict.body.data.id);

    const run = await staff.post('/api/subscriptions/auto-close/run?asOf=2027-03-02');
    expect(run.status).toBe(200);
    expect(run.body.data.subscription_ids).toContain(expiring);
    expect(run.body.data.subscription_ids).not.toContain(strict.body.data.id);
    const history = await pool.query<{ reason: string }>(
      "SELECT reason FROM subscription_history WHERE subscription_id = $1 AND to_status = 'Closed'",
      [expiring],
    );
    expect(history.rows).toEqual([{ reason: 'auto_close' }]);
  });

  it('serialises concurrent transitions on one subscription', async () => {
    const id = await newActive(flexiblePlan);
    const results = await Promise.all([
      staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Paused' }),
      staff.post(`/api/subscriptions/${id}/transition`).send({ to: 'Paused' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const paused = await pool.query("SELECT 1 FROM subscription_history WHERE subscription_id = $1 AND to_status = 'Paused'", [id]);
    expect(paused.rowCount).toBe(1);
  });
});

describe('lifecycle date maths', () => {
  it('clamps month ends and handles each period', () => {
    expect(addPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addPeriod('2028-02-29', 'yearly')).toBe('2029-02-28');
    expect(addPeriod('2026-12-31', 'daily')).toBe('2027-01-01');
    expect(addPeriod('2026-12-29', 'weekly')).toBe('2027-01-05');
  });
});
