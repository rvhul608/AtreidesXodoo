import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { hashPassword } from '../src/common/password.js';
import { createBillingFixture } from './fixtures/billing.js';

const adminEmail = 'renewals-admin@test.local';
const adminPassword = 'RenewalsAdmin1!';
let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;

beforeAll(async () => {
  await pool.query('INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4)',
    [adminEmail, await hashPassword(adminPassword), 'admin', 'Renewals Admin']);
  admin = request.agent(app);
  expect((await admin.post('/api/auth/login').send({ email: adminEmail, password: adminPassword })).status).toBe(200);
  const fixture = await createBillingFixture(pool, 'renew-user', '2026-12-01');
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword('Customer1!'), fixture.userId]);
  customer = request.agent(app);
  expect((await customer.post('/api/auth/login').send({ email: 'renew-user@billing.test', password: 'Customer1!' })).status).toBe(200);
});

afterAll(async () => { await pool.end(); });

describe('renewal chase and admin outbox', () => {
  it('enforces authentication and staff/admin access', async () => {
    expect((await request(app).post('/api/renewals/chase/run')).status).toBe(401);
    expect((await customer.post('/api/renewals/chase/run')).status).toBe(403);
    expect((await request(app).get('/api/admin/outbox')).status).toBe(401);
    expect((await customer.get('/api/admin/outbox')).status).toBe(403);
  });

  it('chases exact dates, excludes paid and cancelled, and is idempotent', async () => {
    await createBillingFixture(pool, 'pre-due', '2026-11-04');
    await createBillingFixture(pool, 'due', '2026-11-01');
    await createBillingFixture(pool, 'overdue', '2026-10-25');
    await createBillingFixture(pool, 'paid', '2026-11-01', 'Paid');
    await createBillingFixture(pool, 'cancelled', '2026-11-01', 'Cancelled');
    await createBillingFixture(pool, 'missed', '2026-11-03');

    expect((await admin.post('/api/renewals/chase/run?asOf=2026-11-01')).body.data.counts)
      .toEqual({ pre_due: 1, due: 1, overdue_7: 1 });
    expect((await admin.post('/api/renewals/chase/run?asOf=2026-11-01')).body.data.counts)
      .toEqual({ pre_due: 0, due: 0, overdue_7: 0 });
    const entries = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM renewal_chase_log');
    expect(Number(entries.rows[0].count)).toBe(3);
    const outbox = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM outbox_emails');
    expect(Number(outbox.rows[0].count)).toBe(3);
  });

  it('validates asOf and paginates newest-first outbox records', async () => {
    expect((await admin.post('/api/renewals/chase/run?asOf=2026-02-30')).status).toBe(400);
    const first = await admin.get('/api/admin/outbox?page=1&pageSize=2');
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3 });
    expect(first.body.data[0].id).toBeGreaterThan(first.body.data[1].id);
    const filtered = await admin.get('/api/admin/outbox?recipient=due%40billing.test');
    expect(filtered.body.meta.total).toBe(1);
    expect((await admin.get('/api/admin/outbox?pageSize=101')).status).toBe(400);
  });
});
