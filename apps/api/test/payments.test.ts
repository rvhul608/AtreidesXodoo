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
let customerId: number;
let planId: number;
let productId: number;
async function confirmedInvoice(total = '100.00'): Promise<number> {
  const draft = await staff
    .post('/api/subscriptions')
    .send({ customerId, planId, startDate: '2026-01-01', lines: [{ productId, quantity: '1' }] });
  const subscriptionId = draft.body.data.id as number;
  for (const status of ['Quotation', 'Confirmed']) {
    const changed = await staff.post(`/api/subscriptions/${subscriptionId}/transition`).send({ to: status });
    if (changed.status !== 200)
      throw new Error(`Unable to confirm subscription: ${JSON.stringify(changed.body)}`);
  }
  return insertInvoice(pool, { customerId, subscriptionId, total });
}
beforeAll(async () => {
  admin = await loginStaff(pool, 'payment-admin@test.local', 'admin');
  staff = await loginStaff(pool, 'payment-staff@test.local', 'staff');
  ({ agent: customer, customerId } = await signupCustomer(pool, 'payment-customer@test.local'));
  ({ productId } = await createProduct(pool, 'PAY-P1'));
  planId = await createPlan(pool, 'PAY-PLAN');
});
afterAll(async () => {
  await pool.end();
});

describe('payment recording', () => {
  it('enforces staff/admin access and rejects future paid dates', async () => {
    const id = await confirmedInvoice();
    expect((await request(app).post(`/api/invoices/${id}/payments`).send({})).status).toBe(401);
    expect((await customer.post(`/api/invoices/${id}/payments`).send({})).status).toBe(403);
    const future = await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'cash', amount: '1.00', paidOn: '2099-01-01' });
    expect(future.status).toBe(400);
  });
  it('rejects payments for Draft, Cancelled and Paid invoices', async () => {
    const id = await confirmedInvoice();
    for (const status of ['Draft', 'Cancelled', 'Paid']) {
      await pool.query('UPDATE invoices SET status=$2 WHERE id=$1', [id, status]);
      const response = await staff.post(`/api/invoices/${id}/payments`).send({
        method: 'cash',
        amount: '1.00',
        paidOn: '2026-10-31',
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('INVOICE_NOT_PAYABLE');
    }
  });
  it('records partial then full amounts and marks invoice Paid with history', async () => {
    const id = await confirmedInvoice('100.00');
    const partial = await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'upi', amount: '40.00', paidOn: '2026-10-30' });
    expect(partial.body.data.invoice).toMatchObject({
      status: 'Confirmed',
      amount_paid: '40.00',
      outstanding: '60.00',
    });
    const full = await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'cash', amount: '60.00', paidOn: '2026-10-31' });
    expect(full.body.data.invoice).toMatchObject({
      status: 'Paid',
      amount_paid: '100.00',
      outstanding: '0.00',
    });
    const persisted = await pool.query<{ status: string; paid_at: Date | null }>(
      'SELECT status,paid_at FROM invoices WHERE id=$1',
      [id],
    );
    expect(persisted.rows[0].status).toBe('Paid');
    expect(persisted.rows[0].paid_at).not.toBeNull();
    const history = await pool.query<{ action: string }>(
      "SELECT action FROM invoice_status_history WHERE invoice_id=$1 AND action='paid'",
      [id],
    );
    expect(history.rows).toHaveLength(1);
  });
  it('rejects overpayments and serializes concurrent attempts', async () => {
    const id = await confirmedInvoice('100.00');
    const partial = await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'card', amount: '70.00', paidOn: '2026-10-31' });
    expect(partial.status).toBe(201);
    const excessive = await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'card', amount: '40.00', paidOn: '2026-10-31' });
    expect(excessive.status).toBe(409);
    expect(excessive.body.error.details.outstanding).toBe('30.00');
    const raceId = await confirmedInvoice('100.00');
    const attempts = await Promise.all(
      ['60.00', '50.00'].map((amount) =>
        staff
          .post(`/api/invoices/${raceId}/payments`)
          .send({ method: 'bank_transfer', amount, paidOn: '2026-10-31' }),
      ),
    );
    expect(attempts.map((item) => item.status).sort()).toEqual([201, 409]);
    expect(attempts.find((item) => item.status === 409)?.body.error.code).toBe('OVERPAYMENT');
  });
  it('lists filtered payments and exact summary totals', async () => {
    const id = await confirmedInvoice('10.25');
    await staff
      .post(`/api/invoices/${id}/payments`)
      .send({ method: 'cheque', amount: '10.25', paidOn: '2026-10-31' });
    const listing = await admin.get(`/api/payments?method=cheque&invoiceId=${id}`);
    expect(listing.body.data).toHaveLength(1);
    expect(listing.body.data[0].amount).toBe('10.25');
    const invoicePayments = await admin.get(`/api/invoices/${id}/payments`);
    expect(invoicePayments.body.data).toHaveLength(1);
    const filtered = await admin.get(`/api/payments?customerId=${customerId}&from=2026-10-31&to=2026-10-31`);
    expect(filtered.body.data.some((row: { invoice_id: number }) => row.invoice_id === id)).toBe(true);
    const summary = await admin.get('/api/payments/summary?from=2026-10-31&to=2026-10-31');
    expect(summary.status).toBe(200);
    expect(summary.body.data.count).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.total).toMatch(/^\d+\.\d{2}$/);
    expect(summary.body.data.by_method.find((row: { method: string }) => row.method === 'cheque').total).toBe(
      '10.25',
    );
  });
});
