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
let alice: Agent;
let bob: Agent;
let aliceSubscription: number;
let bobSubscription: number;
let aliceInvoice: number;
let bobInvoice: number;

async function insertInvoice(customerId: number, subscriptionId: number, number: string, dueDate: string) {
  const invoice = await pool.query<{ id: string }>(
    `INSERT INTO invoices (customer_id, subscription_id, invoice_number, period_start, period_end,
       subtotal, tax_amount, total, issued_date, due_date, status)
     VALUES ($1, $2, $3, '2025-01-01', '2025-01-31', '100.00', '18.00', '118.00', '2025-01-01', $4, 'Confirmed')
     RETURNING id`,
    [customerId, subscriptionId, number, dueDate],
  );
  return Number(invoice.rows[0].id);
}

beforeAll(async () => {
  staff = await loginStaff(pool, 'portal-staff@test.local', 'staff');
  const aliceAccount = await signupCustomer(pool, 'portal-alice@test.local');
  const bobAccount = await signupCustomer(pool, 'portal-bob@test.local');
  alice = aliceAccount.agent;
  bob = bobAccount.agent;
  const { productId } = await createProduct(pool, 'PORTAL-P1', '100.00');
  const pausable = await createPlan(pool, 'PORTAL-PAUSE', { allowPause: true, allowRenew: false });

  const a = await createSubscription(staff, { customerId: aliceAccount.customerId, planId: pausable, productId });
  const b = await createSubscription(staff, { customerId: bobAccount.customerId, planId: pausable, productId });
  aliceSubscription = a.body.data.id;
  bobSubscription = b.body.data.id;
  await activate(staff, aliceSubscription);
  await activate(staff, bobSubscription);

  // Due dates far from the renewal-chase test window so the two suites never interact.
  aliceInvoice = await insertInvoice(aliceAccount.customerId, aliceSubscription, 'INV-PORTAL-A', '2025-02-01');
  bobInvoice = await insertInvoice(bobAccount.customerId, bobSubscription, 'INV-PORTAL-B', '2099-02-01');
  await pool.query(
    `INSERT INTO payments (invoice_id, customer_id, amount, payment_method)
     VALUES ($1, $2, '18.00', 'bank')`,
    [aliceInvoice, aliceAccount.customerId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('customer portal', () => {
  it('is only for customers', async () => {
    expect((await staff.get('/api/portal/subscriptions')).status).toBe(403);
    expect((await staff.get('/api/portal/invoices')).status).toBe(403);
  });

  it('lists only the caller’s own subscriptions and invoices', async () => {
    const subscriptions = await alice.get('/api/portal/subscriptions');
    expect(subscriptions.status).toBe(200);
    expect(subscriptions.body.meta.total).toBe(1);
    expect(subscriptions.body.data.map((row: { id: number }) => row.id)).toEqual([aliceSubscription]);

    const invoices = await alice.get('/api/portal/invoices');
    expect(invoices.body.meta.total).toBe(1);
    expect(invoices.body.data[0]).toMatchObject({
      id: aliceInvoice,
      total: '118.00',
      amount_paid: '18.00',
      outstanding: '100.00',
      is_overdue: true,
    });

    const bobInvoices = await bob.get('/api/portal/invoices');
    expect(bobInvoices.body.data.map((row: { id: number }) => row.id)).toEqual([bobInvoice]);
    expect(bobInvoices.body.data[0].is_overdue).toBe(false);
  });

  it('returns 404 for another customer’s rows and actions', async () => {
    expect((await alice.get(`/api/portal/subscriptions/${bobSubscription}`)).status).toBe(404);
    expect((await alice.get(`/api/portal/invoices/${bobInvoice}`)).status).toBe(404);
    expect((await alice.post(`/api/portal/subscriptions/${bobSubscription}/pause`)).status).toBe(404);
    const untouched = await pool.query<{ status: string }>('SELECT status FROM subscriptions WHERE id = $1', [
      bobSubscription,
    ]);
    expect(untouched.rows[0].status).toBe('Active');
  });

  it('shows history and allows plan-permitted actions on own subscriptions', async () => {
    const detail = await alice.get(`/api/portal/subscriptions/${aliceSubscription}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.history.length).toBe(4);

    const paused = await alice.post(`/api/portal/subscriptions/${aliceSubscription}/pause`);
    expect(paused.status).toBe(200);
    expect(paused.body.data.to).toBe('Paused');
    const resumed = await alice.post(`/api/portal/subscriptions/${aliceSubscription}/resume`);
    expect(resumed.body.data.to).toBe('Active');

    const renew = await alice.post(`/api/portal/subscriptions/${aliceSubscription}/renew`);
    expect(renew.status).toBe(409);
    expect((await alice.post(`/api/portal/subscriptions/${aliceSubscription}/delete`)).status).toBe(400);
  });
});
