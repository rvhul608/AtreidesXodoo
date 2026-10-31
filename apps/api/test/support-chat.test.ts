import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { pool } from '../src/common/db.js';
import { app } from '../src/index.js';
import { loginStaff, signupCustomer, type Agent } from './fixtures/subscriptions.js';

let staff: Agent;
let customer: Agent;

beforeAll(async () => {
  staff = await loginStaff(pool, 'support-staff@test.local', 'staff');
  customer = (await signupCustomer(pool, 'support-customer@test.local')).agent;
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
});
