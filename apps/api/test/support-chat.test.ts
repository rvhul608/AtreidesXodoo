import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { pool } from '../src/common/db.js';
import { app } from '../src/index.js';
import { activate, createPlan, createProduct, createSubscription, loginStaff, signupCustomer, type Agent } from './fixtures/subscriptions.js';

let staff: Agent;
let customer: Agent;
let otherCustomer: Agent;
let customerId: number;
let otherCustomerId: number;

beforeAll(async () => {
  staff = await loginStaff(pool, 'support-staff@test.local', 'staff');
  const first = await signupCustomer(pool, 'support-customer@test.local');
  const second = await signupCustomer(pool, 'support-other@test.local');
  customer = first.agent;
  customerId = first.customerId;
  otherCustomer = second.agent;
  otherCustomerId = second.customerId;
});

afterAll(async () => { vi.unstubAllGlobals(); await pool.end(); });

describe('support knowledge and chat', () => {
  it('limits publishing to staff and retrieves only published documents', async () => {
    expect((await request(app).post('/api/support-knowledge').send({ title: 'No', body: 'No' })).status).toBe(401);
    expect((await customer.post('/api/support-knowledge').send({ title: 'No', body: 'No' })).status).toBe(403);
    expect((await staff.post('/api/support-knowledge').send({ title: 'Weekly reports', body: 'Brightloop offers weekly reports.', published: true })).status).toBe(201);
    expect((await staff.post('/api/support-knowledge').send({ title: 'Weekly secret', body: 'Weekly private draft.', published: false })).status).toBe(201);
    const fakeFetch = vi.fn(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content).toContain('Brightloop offers weekly reports.');
      expect(body.messages[1].content).not.toContain('Weekly private draft.');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Weekly reports are available.' } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fakeFetch);
    const answer = await customer.post('/api/support/chat').send({ message: 'weekly reports' });
    expect(answer.status).toBe(200);
    expect(answer.body.data.sources).toHaveLength(1);
    expect(answer.body.data.answer).toBe('Weekly reports are available.');
    expect(fakeFetch).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('does not query account details supplied by the client as another customer', async () => {
    expect((await customer.post('/api/support/chat').send({ message: 'my account', customerId: 999 })).status).toBe(422);
    expect((await customer.post('/api/support/message').send({ topic: 'subscriptions', customerId: 999 })).status).toBe(422);
    expect((await request(app).post('/api/support/chat').send({ message: 'hello' })).status).toBe(401);
  });

  it('returns only the authenticated customer subscriptions and invoice details', async () => {
    const { productId } = await createProduct(pool, 'SUPPORT-ISOLATION');
    const planId = await createPlan(pool, 'SUPPORT-ISOLATION');
    const first = await createSubscription(staff, { customerId, planId, productId });
    const second = await createSubscription(staff, { customerId: otherCustomerId, planId, productId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    await activate(staff, first.body.data.id);
    await activate(staff, second.body.data.id);
    const invoices = await pool.query<{ id: string }>(`
      INSERT INTO invoices (customer_id, subscription_id, invoice_number, period_start, period_end,
        subtotal, tax_amount, total, issued_date, due_date, status)
      VALUES ($1, $2, 'SUPPORT-OTHER-INVOICE', '2026-01-01', '2026-01-31',
        100, 0, 100, '2026-01-01', '2026-02-01', 'Confirmed') RETURNING id
    `, [otherCustomerId, second.body.data.id]);
    const foreignId = Number(invoices.rows[0].id);
    const ownSubscriptions = await customer.post('/api/support/message').send({ topic: 'subscriptions' });
    expect(ownSubscriptions.status).toBe(200);
    expect(ownSubscriptions.body.data.items.map((item: { id: string }) => item.id)).toEqual([String(first.body.data.id)]);
    const foreignInvoice = await customer.post('/api/support/message').send({ topic: 'invoice_details', invoiceId: foreignId });
    expect(foreignInvoice.body.data).toEqual({ message: 'Invoice not found.', items: [] });
    const ownInvoice = await otherCustomer.post('/api/support/message').send({ topic: 'invoice_details', invoiceId: foreignId });
    expect(ownInvoice.body.data.items[0].invoice_number).toBe('SUPPORT-OTHER-INVOICE');
    const unpaid = await customer.post('/api/support/message').send({ topic: 'unpaid_invoices' });
    expect(unpaid.body.data.items).toEqual([]);
  });

  it('returns a safe error if the local model cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const result = await customer.post('/api/support/chat').send({ message: 'weekly reports' });
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe('MODEL_UNAVAILABLE');
    vi.unstubAllGlobals();
  });
});
