import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/common/db.js';
import {
  activate,
  createPlan,
  createProduct,
  createSubscription,
  loginStaff,
  signupCustomer,
  type Agent,
} from './fixtures/subscriptions.js';

let staff: Agent;
let customer: Agent;
let soon: number;
let blocked: number;
let later: number;

// asOf is pinned to 2031 so subscriptions created by other test files never fall in the window.
const asOf = '2031-06-01';

beforeAll(async () => {
  staff = await loginStaff(pool, 'queue-staff@test.local', 'staff');
  const account = await signupCustomer(pool, 'queue-customer@test.local');
  customer = account.agent;
  const { productId } = await createProduct(pool, 'QUEUE-P1');
  const renewable = await createPlan(pool, 'QUEUE-RENEW', { allowRenew: true });
  const fixed = await createPlan(pool, 'QUEUE-FIXED', { allowRenew: false });
  const make = async (planId: number, expiryDate: string) => {
    const created = await createSubscription(staff, { customerId: account.customerId, planId, productId, expiryDate });
    await activate(staff, created.body.data.id);
    return created.body.data.id as number;
  };
  soon = await make(renewable, '2031-06-10');
  blocked = await make(fixed, '2031-06-20');
  later = await make(renewable, '2031-08-01');
});

afterAll(async () => {
  await pool.end();
});

describe('renewal queue', () => {
  it('is staff only', async () => {
    expect((await customer.get('/api/renewals/queue')).status).toBe(403);
  });

  it('lists active subscriptions expiring inside the window, soonest first', async () => {
    const queue = await staff.get(`/api/renewals/queue?asOf=${asOf}&days=30`);
    expect(queue.status).toBe(200);
    expect(queue.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(queue.body.data.map((row: { id: number }) => row.id)).toEqual([soon, blocked]);
    expect(queue.body.data[0]).toMatchObject({ days_left: 9, can_renew: true, expiry_date: '2031-06-10' });
    expect(queue.body.data[1].can_renew).toBe(false);

    const wider = await staff.get(`/api/renewals/queue?asOf=${asOf}&days=90`);
    expect(wider.body.data.map((row: { id: number }) => row.id)).toContain(later);
    expect((await staff.get('/api/renewals/queue?days=-1')).status).toBe(400);
  });

  it('renews through the transition rules', async () => {
    const renewed = await staff.post(`/api/renewals/${soon}/renew`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.data.expiry_date).toBe('2031-07-10');

    const refused = await staff.post(`/api/renewals/${blocked}/renew`);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PLAN_DISALLOWS');
  });
});
