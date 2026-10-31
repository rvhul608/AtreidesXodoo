import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { hashPassword } from '../src/common/password.js';

let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;
beforeAll(async () => {
  const hash = await hashPassword('CatalogPass1!');
  await pool.query(
    "INSERT INTO users(email,password_hash,role,name) VALUES('catalog-admin@test.local',$1,'admin','Catalog Admin')",
    [hash],
  );
  admin = request.agent(app);
  await admin.post('/api/auth/login').send({ email: 'catalog-admin@test.local', password: 'CatalogPass1!' });
  const signup = await request(app)
    .post('/api/auth/signup')
    .send({ email: 'catalog-customer@test.local', password: 'CustomerPass1!' });
  customer = request.agent(app);
  await customer
    .post('/api/auth/login')
    .send({ email: 'catalog-customer@test.local', password: 'CustomerPass1!' });
  expect(signup.status).toBe(201);
});
afterAll(async () => {
  await pool.end();
});

describe('catalog, plans, and quotation templates', () => {
  it('enforces authentication and admin writes while exposing catalog reads', async () => {
    expect((await request(app).get('/api/products')).status).toBe(401);
    expect((await customer.post('/api/products').send({})).status).toBe(403);
    expect((await customer.get('/api/products?pageSize=101')).status).toBe(400);
    expect((await customer.get('/api/products')).body.meta).toMatchObject({
      page: 1,
      pageSize: 20,
      total: expect.any(Number),
    });
  });

  it('computes exact variant pricing and replaces tax links', async () => {
    const bad = await admin.post('/api/products').send({
      sku: 'BAD',
      name: 'Bad',
      type: 'service',
      salesPrice: 'NaN',
      costPrice: '0.00',
    });
    expect(bad.status).toBe(400);
    expect(
      (
        await admin.post('/api/products').send({
          sku: 'NEGATIVE',
          name: 'Negative',
          type: 'service',
          salesPrice: '-1.00',
          costPrice: '0.00',
        })
      ).status,
    ).toBe(400);
    const product = await admin.post('/api/products').send({
      sku: 'A2-P1',
      name: 'Widget',
      type: 'service',
      salesPrice: '1000.00',
      costPrice: '400.00',
    });
    expect(product.status).toBe(201);
    const pid = product.body.data.id as number;
    const variant = await admin
      .post(`/api/products/${pid}/variants`)
      .send({ name: 'brand', value: 'Odoo', extraPrice: '560.00' });
    expect(variant.status).toBe(201);
    const price = await customer.get(`/api/products/${pid}/price?variantId=${variant.body.data.id}`);
    expect(price.body.data).toEqual({
      base: '1000.00',
      extra: '560.00',
      unitPrice: '1560.00',
    });
    const otherProduct = await admin.post('/api/products').send({
      sku: 'A2-P2',
      name: 'Other',
      type: 'service',
      salesPrice: '1.00',
      costPrice: '0.00',
    });
    expect(
      (
        await customer.get(
          `/api/products/${otherProduct.body.data.id}/price?variantId=${variant.body.data.id}`,
        )
      ).status,
    ).toBe(400);
    const tax = await admin.post('/api/taxes').send({ name: 'GST-A2', jurisdiction: 'IN', rate: '0.1800' });
    expect(tax.status).toBe(201);
    expect(
      (await admin.post('/api/taxes').send({ name: 'GST-A2', jurisdiction: 'IN', rate: '0.1800' })).status,
    ).toBe(409);
    expect(
      (
        await admin.put(`/api/products/${pid}/taxes`).send({
          taxIds: [Number(tax.body.data.id), Number(tax.body.data.id)],
        })
      ).status,
    ).toBe(200);
    expect((await admin.put(`/api/products/${pid}/taxes`).send({ taxIds: [99999999] })).status).toBe(400);
    expect(
      (await customer.get('/api/products')).body.data.find((p: { id: number }) => p.id === pid).taxes,
    ).toHaveLength(1);
    expect(
      (
        await admin.post('/api/products').send({
          sku: 'A2-P1',
          name: 'Duplicate',
          type: 'service',
          salesPrice: '1',
          costPrice: '1',
        })
      ).status,
    ).toBe(409);
  });

  it('persists plan flags and derives template line pricing and expiry', async () => {
    const invalid = await admin.post('/api/plans').send({
      planNumber: 'BAD',
      name: 'Bad',
      price: '20',
      period: 'quarterly',
      minQuantity: 1,
      availableFrom: '2026-02-01',
      availableUntil: '2026-01-01',
      autoClose: false,
      allowEarlyClose: false,
      allowPause: false,
      allowRenew: false,
    });
    expect(invalid.status).toBe(400);
    const plan = await admin.post('/api/plans').send({
      planNumber: 'A2-PLAN',
      name: 'Monthly',
      price: '99.00',
      period: 'monthly',
      minQuantity: 1,
      availableFrom: '2026-01-01',
      availableUntil: '2027-01-01',
      autoClose: true,
      allowEarlyClose: true,
      allowPause: true,
      allowRenew: false,
    });
    expect(plan.status).toBe(201);
    expect(plan.body.data).toMatchObject({
      auto_close: true,
      allow_early_close: true,
      allow_pause: true,
      allow_renew: false,
      pricing: [{ period: 'monthly', price: '99.00' }],
    });
    const product = (await pool.query<{ id: string }>('SELECT id FROM products WHERE sku=$1', ['A2-P1']))
      .rows[0];
    const variant = (
      await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE product_id=$1', [product.id])
    ).rows[0];
    const template = await admin.post('/api/templates').send({
      name: 'Starter',
      planId: Number(plan.body.data.id),
      validityDays: 10,
      lines: [
        {
          productId: Number(product.id),
          variantId: Number(variant.id),
          quantity: '2',
        },
      ],
    });
    expect(template.status).toBe(201);
    expect(template.body.data.lines[0].unit_price).toBe('1560.00');
    expect(template.body.data).toHaveProperty('expires_on');
    expect(template.body.data.is_expired).toBe(false);
    expect((await admin.get('/api/plans?pageSize=101')).status).toBe(400);
    expect(
      (
        await admin.post('/api/plans').send({
          planNumber: 'A2-PLAN',
          name: 'duplicate',
          price: '1',
          period: 'monthly',
          minQuantity: 1,
          autoClose: false,
          allowEarlyClose: false,
          allowPause: false,
          allowRenew: false,
        })
      ).status,
    ).toBe(409);
  });
});
