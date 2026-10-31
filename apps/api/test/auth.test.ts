import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/common/db.js';
import { hashPassword } from '../src/common/password.js';

const adminEmail = 'admin@test.local';
const adminPassword = 'AdminPass123!';
let adminId: number;

async function createAdmin() {
  const passwordHash = await hashPassword(adminPassword);
  const result = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, 'admin', 'Test Admin') RETURNING id`,
    [adminEmail, passwordHash],
  );
  adminId = Number(result.rows[0].id);
}

async function signedIn(email: string, password: string) {
  const client = request.agent(app);
  const response = await client.post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return client;
}

beforeAll(async () => {
  await createAdmin();
});

afterAll(async () => {
  await pool.end();
});

describe('auth and users', () => {
  it('enforces password boundaries and creates a customer account', async () => {
    const rejected = [
      ['short@test.local', 'Aa1!aaaa'],
      ['no-upper@test.local', 'lowercase1!'],
      ['no-lower@test.local', 'UPPERCASE1!'],
      ['no-special@test.local', 'Uppercase1'],
    ];
    for (const [email, password] of rejected) {
      const response = await request(app).post('/api/auth/signup').send({ email, password });
      expect(response.status).toBe(400);
    }

    const accepted = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'valid@test.local', password: 'Abcdef1!x', name: 'Valid User' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ email: 'valid@test.local', role: 'customer', name: 'Valid User' });
    const cookieHeader = accepted.headers['set-cookie'];
    expect(Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader).toMatch(/HttpOnly/i);
    const customerUser = await pool.query<{ customer_id: string; role: string }>(
      'SELECT customer_id, role FROM users WHERE email = $1',
      ['valid@test.local'],
    );
    expect(customerUser.rows[0]).toMatchObject({ role: 'customer' });
    expect(customerUser.rows[0].customer_id).toBeTruthy();

    const longPassword = `A${'b'.repeat(80)}1!`;
    const longAccount = await request(app).post('/api/auth/signup').send({ email: 'long-password@test.local', password: longPassword });
    expect(longAccount.status).toBe(201);
    const truncatedVariant = await request(app).post('/api/auth/login').send({
      email: 'long-password@test.local',
      password: `A${'b'.repeat(80)}2!`,
    });
    expect(truncatedVariant.status).toBe(401);
  });

  it('rejects duplicate email addresses case-insensitively', async () => {
    const first = await request(app).post('/api/auth/signup').send({ email: 'duplicate@test.local', password: 'ValidPass1!' });
    const second = await request(app).post('/api/auth/signup').send({ email: 'DUPLICATE@test.local', password: 'ValidPass1!' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('EMAIL_EXISTS');
  });

  it('logs in with an httpOnly cookie and rejects invalid credentials', async () => {
    const session = request.agent(app);
    const success = await session.post('/api/auth/login').send({ email: adminEmail, password: adminPassword });
    expect(success.status).toBe(200);
    expect(success.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(success.body.data).toMatchObject({ email: adminEmail, role: 'admin', customer_id: null });
    expect((await session.get('/api/auth/me')).body.data.email).toBe(adminEmail);
    const logout = await session.post('/api/auth/logout');
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect((await session.get('/api/auth/me')).status).toBe(401);

    const failed = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'WrongPass1!' });
    expect(failed.status).toBe(401);
    expect(failed.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('uses the same forgot-password response for known and unknown emails and stores only a hashed token', async () => {
    const known = await request(app).post('/api/auth/forgot-password').send({ email: adminEmail });
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@test.local' });
    expect(known.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    const outbox = await pool.query<{ body: string }>(
      'SELECT body FROM outbox_emails WHERE recipient = $1 ORDER BY id DESC LIMIT 1',
      [adminEmail],
    );
    const tokenMatch = outbox.rows[0].body.match(/[?&]token=([^\s]+)/);
    expect(tokenMatch).not.toBeNull();
    const token = decodeURIComponent(tokenMatch![1]);
    const hash = createHash('sha256').update(token).digest('hex');
    const stored = await pool.query<{ token_hash: string }>('SELECT token_hash FROM reset_tokens WHERE user_id = $1', [adminId]);
    expect(stored.rows[0].token_hash).toBe(hash);
    expect(stored.rows[0].token_hash).not.toBe(token);

    const reset = await request(app).post('/api/auth/reset-password').send({ token, password: 'ResetPass2!' });
    expect(reset.status).toBe(200);
    const reused = await request(app).post('/api/auth/reset-password').send({ token, password: 'ResetPass3!' });
    expect(reused.status).toBe(400);
    const login = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'ResetPass2!' });
    expect(login.status).toBe(200);
  });

  it('rejects expired reset tokens', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: adminEmail });
    const outbox = await pool.query<{ body: string }>(
      'SELECT body FROM outbox_emails WHERE recipient = $1 ORDER BY id DESC LIMIT 1',
      [adminEmail],
    );
    const token = decodeURIComponent(outbox.rows[0].body.match(/[?&]token=([^\s]+)/)![1]);
    const hash = createHash('sha256').update(token).digest('hex');
    await pool.query("UPDATE reset_tokens SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE token_hash = $1", [hash]);
    const response = await request(app).post('/api/auth/reset-password').send({ token, password: 'ExpiredPass1!' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('RESET_TOKEN_INVALID');
  });

  it('allows only admins to create staff, paginates users, and audits deactivation', async () => {
    const customerSignup = await request(app).post('/api/auth/signup').send({ email: 'customer@test.local', password: 'Customer1!' });
    expect(customerSignup.status).toBe(201);
    const customer = await signedIn('customer@test.local', 'Customer1!');
    const staffPayload = { email: 'newstaff@test.local', password: 'NewStaff1!', name: 'New Staff' };
    const customerForbidden = await customer.post('/api/users').send(staffPayload);
    expect(customerForbidden.status).toBe(403);

    const admin = await signedIn(adminEmail, 'ResetPass2!');
    const created = await admin.post('/api/users').send(staffPayload);
    expect(created.status).toBe(201);
    expect(created.body.data.role).toBe('staff');
    const staff = await signedIn('newstaff@test.local', 'NewStaff1!');
    expect((await staff.post('/api/users').send({ ...staffPayload, email: 'otherstaff@test.local' })).status).toBe(403);

    const list = await admin.get('/api/users?page=1&pageSize=2');
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta).toMatchObject({ page: 1, pageSize: 2, total: expect.any(Number) });
    expect((await admin.get('/api/users?pageSize=101')).status).toBe(400);

    const staffId = created.body.data.id as number;
    const deactivated = await admin.post(`/api/users/${staffId}/deactivate`);
    expect(deactivated.status).toBe(200);
    const audit = await pool.query<{ action: string }>(
      'SELECT action FROM audit_log WHERE entity_id = $1 ORDER BY id DESC LIMIT 1',
      [staffId],
    );
    expect(audit.rows[0].action).toBe('user_deactivated');
    expect((await staff.get('/api/auth/me')).status).toBe(401);
  });

  it('rate-limits login and password-reset requests', async () => {
    const loginResponses = await Promise.all(Array.from({ length: 12 }, () =>
      request(app).post('/api/auth/login').send({ email: 'nobody@test.local', password: 'InvalidPass1!' }),
    ));
    expect(loginResponses.some((response) => response.status === 429)).toBe(true);

    const resetResponses = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      request(app).post('/api/auth/forgot-password').send({ email: `missing${index}@test.local` }),
    ));
    expect(resetResponses.some((response) => response.status === 429)).toBe(true);
  });
});
