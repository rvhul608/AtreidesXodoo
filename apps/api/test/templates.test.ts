import { beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { hashPassword } from '../src/common/password.js';
let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;
beforeAll(async () => {
  const hash = await hashPassword('TemplatePass1!');
  await pool.query(
    "INSERT INTO users(email,password_hash,role,name) VALUES('template-admin@test.local',$1,'admin','Admin')",
    [hash],
  );
  await request(app).post('/api/auth/signup').send({
    email: 'template-customer@test.local',
    password: 'TemplatePass1!',
  });
  admin = request.agent(app);
  customer = request.agent(app);
  await admin
    .post('/api/auth/login')
    .send({ email: 'template-admin@test.local', password: 'TemplatePass1!' });
  await customer.post('/api/auth/login').send({
    email: 'template-customer@test.local',
    password: 'TemplatePass1!',
  });
});
it('prices lines, rejects foreign variants, reports expiry and protects referenced products', async () => {
  expect((await request(app).get('/api/templates')).status).toBe(401);
  expect((await customer.get('/api/templates')).status).toBe(200);
  const p1 = await admin.post('/api/products').send({
    sku: 'TPL-P1',
    name: 'One',
    type: 'service',
    salesPrice: '1000.00',
    costPrice: '0.00',
  });
  const p2 = await admin.post('/api/products').send({
    sku: 'TPL-P2',
    name: 'Two',
    type: 'service',
    salesPrice: '50.00',
    costPrice: '0.00',
  });
  const v = await admin
    .post(`/api/products/${p1.body.data.id}/variants`)
    .send({ name: 'pack', value: 'large', extraPrice: '560.00' });
  const plan = await admin.post('/api/plans').send({
    planNumber: 'TPL-PLAN',
    name: 'Plan',
    price: '10.00',
    period: 'monthly',
    minQuantity: 1,
    autoClose: false,
    allowEarlyClose: false,
    allowPause: false,
    allowRenew: true,
  });
  const body = {
    name: 'Quote',
    planId: plan.body.data.id,
    validityDays: 1,
    lines: [{ productId: p1.body.data.id, variantId: v.body.data.id, quantity: '2' }],
  };
  expect(
    (
      await admin.post('/api/templates').send({
        ...body,
        lines: [{ ...body.lines[0], productId: p2.body.data.id }],
      })
    ).status,
  ).toBe(400);
  const created = await admin.post('/api/templates').send(body);
  expect(created.status).toBe(201);
  expect(created.body.data.lines[0].unit_price).toBe('1560.00');
  await pool.query(
    "UPDATE quotation_templates SET created_at=CURRENT_TIMESTAMP - INTERVAL '3 days' WHERE id=$1",
    [created.body.data.id],
  );
  expect((await admin.get(`/api/templates/${created.body.data.id}`)).body.data.is_expired).toBe(true);
  expect((await admin.delete(`/api/products/${p1.body.data.id}`)).status).toBe(409);
  const second = await admin.post('/api/templates').send({ ...body, name: 'Quote two' });
  expect(second.status).toBe(201);
  const page1 = await admin.get('/api/templates?page=1&pageSize=1');
  const page2 = await admin.get('/api/templates?page=2&pageSize=1');
  expect(page1.body.meta).toMatchObject({
    page: 1,
    pageSize: 1,
    total: expect.any(Number),
  });
  expect(page2.status).toBe(200);
  expect(page2.body.data).toHaveLength(1);
  expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
  expect((await admin.get('/api/templates/99999999')).status).toBe(404);
});
