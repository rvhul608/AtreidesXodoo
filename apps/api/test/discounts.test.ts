import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import {
  createPlan,
  createProduct,
  loginStaff,
  signupCustomer,
  type Agent,
} from './fixtures/subscriptions.js';
import { insertInvoice } from './fixtures/invoices.js';

let admin: Agent;
let staff: Agent;
let customer: Agent;
let productId: number;
let customerId: number;
let planId: number;
beforeAll(async () => {
  admin = await loginStaff(pool, 'discount-admin@test.local', 'admin');
  staff = await loginStaff(pool, 'discount-staff@test.local', 'staff');
  ({ agent: customer, customerId } = await signupCustomer(pool, 'discount-customer@test.local'));
  ({ productId } = await createProduct(pool, 'DISC-P1'));
  planId = await createPlan(pool, 'DISC-PLAN');
});
afterAll(async () => {
  await pool.end();
});

describe('discount administration', () => {
  it('restricts every route to admins', async () => {
    expect((await request(app).get('/api/discounts')).status).toBe(401);
    expect((await staff.get('/api/discounts')).status).toBe(403);
    expect((await customer.get('/api/discounts')).status).toBe(403);
  });
  it('validates targets and values, creates and replaces product targets', async () => {
    expect(
      (
        await admin
          .post('/api/discounts')
          .send({ name: 'bad', kind: 'percentage', value: '101', appliesTo: 'subscription' })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin
          .post('/api/discounts')
          .send({ name: 'product', kind: 'fixed', value: '2.00', appliesTo: 'products' })
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.post('/api/discounts').send({
          name: 'missing',
          kind: 'fixed',
          value: '2.00',
          appliesTo: 'products',
          productIds: [99999999],
        })
      ).status,
    ).toBe(400);
    const fixed = await admin.post('/api/discounts').send({
      name: 'Fixed',
      kind: 'fixed',
      value: '4.50',
      appliesTo: 'subscription',
    });
    expect(fixed.status).toBe(201);
    expect(fixed.body.data.value).toBe('4.50');
    expect(
      (
        await admin.post('/api/discounts').send({
          name: 'Bad dates',
          kind: 'fixed',
          value: '1',
          appliesTo: 'subscription',
          startsOn: '2026-12-01',
          endsOn: '2026-11-30',
        })
      ).status,
    ).toBe(400);
    const created = await admin.post('/api/discounts').send({
      name: 'Launch',
      kind: 'percentage',
      value: '10.00',
      appliesTo: 'products',
      productIds: [productId],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.product_ids).toEqual([productId]);
    const other = await createProduct(pool, 'DISC-P2');
    const patched = await admin
      .patch(`/api/discounts/${created.body.data.id}`)
      .send({ productIds: [other.productId] });
    expect(patched.body.data.product_ids).toEqual([other.productId]);
  });

  it('guards used limits and deletes only unused rules', async () => {
    const unused = await admin.post('/api/discounts').send({
      name: 'Unused',
      kind: 'fixed',
      value: '3.00',
      appliesTo: 'subscription',
      usageLimit: 5,
    });
    expect((await admin.delete(`/api/discounts/${unused.body.data.id}`)).status).toBe(204);

    const used = await admin.post('/api/discounts').send({
      name: 'Used',
      kind: 'fixed',
      value: '3.00',
      appliesTo: 'subscription',
      usageLimit: 3,
    });
    await pool.query('UPDATE discount_rules SET times_used=2 WHERE id=$1', [used.body.data.id]);
    expect(
      (await admin.patch(`/api/discounts/${used.body.data.id}`).send({ usageLimit: 1 })).body.error.code,
    ).toBe('USAGE_LIMIT_BELOW_USED');
    const subscription = await staff.post('/api/subscriptions').send({
      customerId,
      planId,
      startDate: '2026-01-01',
      lines: [{ productId, quantity: '1' }],
    });
    const invoice = await insertInvoice(pool, { customerId, subscriptionId: subscription.body.data.id });
    await pool.query('INSERT INTO discount_usage (discount_rule_id,invoice_id,amount) VALUES ($1,$2,$3)', [
      used.body.data.id,
      invoice,
      '3.00',
    ]);
    const rejected = await admin.delete(`/api/discounts/${used.body.data.id}`);
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('DISCOUNT_IN_USE');
  });

  it('derives scheduled and expired state and paginates', async () => {
    await admin
      .post('/api/discounts')
      .send({ name: 'Future', kind: 'fixed', value: '1', appliesTo: 'subscription', startsOn: '2099-01-01' });
    await admin
      .post('/api/discounts')
      .send({ name: 'Past', kind: 'fixed', value: '1', appliesTo: 'subscription', endsOn: '2000-01-01' });
    const exhausted = await admin.post('/api/discounts').send({
      name: 'Exhausted',
      kind: 'fixed',
      value: '1',
      appliesTo: 'subscription',
      usageLimit: 1,
    });
    await pool.query('UPDATE discount_rules SET times_used=usage_limit WHERE id=$1', [
      exhausted.body.data.id,
    ]);
    const future = await admin.get('/api/discounts?status=scheduled&pageSize=1');
    const past = await admin.get('/api/discounts?status=expired');
    const usedUp = await admin.get('/api/discounts?status=exhausted');
    expect(future.body.data).toHaveLength(1);
    expect(future.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(past.body.data[0].state).toBe('expired');
    expect(usedUp.body.data.some((row: { id: number }) => row.id === exhausted.body.data.id)).toBe(true);
  });
});
