import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { hashPassword } from '../src/common/password.js';
let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;
let staff: ReturnType<typeof request.agent>;
beforeAll(async () => {
  const hash = await hashPassword('PlanPass1!');
  await pool.query(
    "INSERT INTO users(email,password_hash,role,name) VALUES('plan-admin@test.local',$1,'admin','Admin')",
    [hash],
  );
  await pool.query(
    "INSERT INTO users(email,password_hash,role,name) VALUES('plan-staff@test.local',$1,'staff','Staff')",
    [hash],
  );
  await request(app)
    .post('/api/auth/signup')
    .send({ email: 'plan-customer@test.local', password: 'PlanPass1!' });
  admin = request.agent(app);
  staff = request.agent(app);
  customer = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'plan-admin@test.local', password: 'PlanPass1!' });
  await staff.post('/api/auth/login').send({ email: 'plan-staff@test.local', password: 'PlanPass1!' });
  await customer.post('/api/auth/login').send({ email: 'plan-customer@test.local', password: 'PlanPass1!' });
});
it('validates access, dates, periods, duplicates, filtering, and one-flag patches', async () => {
  expect((await request(app).get('/api/plans')).status).toBe(401);
  expect((await customer.get('/api/plans')).status).toBe(200);
  const payload = {
    planNumber: 'PLAN-X',
    name: 'X',
    price: '42.00',
    period: 'monthly',
    minQuantity: 1,
    availableFrom: '2026-01-01',
    availableUntil: '2027-01-01',
    autoClose: false,
    allowEarlyClose: false,
    allowPause: false,
    allowRenew: true,
  };
  expect((await customer.post('/api/plans').send(payload)).status).toBe(403);
  expect((await staff.post('/api/plans').send(payload)).status).toBe(403);
  expect((await admin.post('/api/plans').send({ ...payload, availableFrom: '2026-02-30' })).status).toBe(400);
  expect((await admin.post('/api/plans').send({ ...payload, period: 'quarterly' })).status).toBe(400);
  const created = await admin.post('/api/plans').send(payload);
  expect(created.status).toBe(201);
  expect((await admin.post('/api/plans').send(payload)).status).toBe(409);
  const changed = await admin.patch(`/api/plans/${created.body.data.id}`).send({ allowPause: true });
  expect(changed.body.data.allow_pause).toBe(true);
  expect(changed.body.data.allow_renew).toBe(true);
  expect(
    (await customer.get('/api/plans?availableOn=2026-06-01')).body.data.some(
      (p: { plan_number: string }) => p.plan_number === 'PLAN-X',
    ),
  ).toBe(true);
  expect((await admin.get('/api/plans?pageSize=101')).status).toBe(400);
  expect((await customer.get('/api/plans/99999999')).status).toBe(404);
});
