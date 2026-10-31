import type { PoolClient } from 'pg';
import { pool } from '../../common/db.js';
import type { AuthPrincipal, UserRole } from '../../common/auth.types.js';
import { writeOutboxEmail } from '../../common/outbox.repository.js';

export interface AuthUser extends AuthPrincipal {
  passwordHash: string;
  isActive: boolean;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  customer_id: string | null;
  role: UserRole;
  password_hash: string;
  is_active: boolean;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    role: row.role,
    passwordHash: row.password_hash,
    isActive: row.is_active,
  };
}

const userColumns = 'id, email, name, customer_id, role, password_hash, is_active';

export async function findLoginUser(email: string): Promise<AuthUser | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT ${userColumns} FROM users WHERE lower(email) = $1 LIMIT 1`,
    [email],
  );
  return result.rows[0] ? mapUser(result.rows[0]) : undefined;
}

export async function findActivePrincipal(userId: number): Promise<AuthPrincipal | undefined> {
  const result = await pool.query<UserRow>(
    `SELECT ${userColumns} FROM users WHERE id = $1 AND is_active = true`,
    [userId],
  );
  if (!result.rows[0]) return undefined;
  const user = mapUser(result.rows[0]);
  return { id: user.id, email: user.email, name: user.name, customerId: user.customerId, role: user.role };
}

export async function createCustomerAccount(
  email: string,
  passwordHash: string,
  name: string | null,
): Promise<AuthPrincipal> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const legalName = `${name || email.split('@')[0]} (${email})`;
    const customer = await client.query<{ id: string }>(
      'INSERT INTO customers (legal_name) VALUES ($1) RETURNING id',
      [legalName],
    );
    const result = await client.query<UserRow>(
      `INSERT INTO users (customer_id, email, password_hash, role, name)
       VALUES ($1, $2, $3, 'customer', $4)
       RETURNING ${userColumns}`,
      [customer.rows[0].id, email, passwordHash, name],
    );
    await client.query('COMMIT');
    const user = mapUser(result.rows[0]);
    return { id: user.id, email: user.email, name: user.name, customerId: user.customerId, role: user.role };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createResetEmail(
  email: string,
  tokenHash: string,
  expiresAt: Date,
  resetLink: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string; customer_id: string | null }>(
      `SELECT id, customer_id FROM users
       WHERE lower(email) = $1 AND is_active = true LIMIT 1`,
      [email],
    );
    if (!result.rows[0]) {
      await client.query('COMMIT');
      return false;
    }

    const user = result.rows[0];
    await client.query(
      `UPDATE reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
    );
    await client.query(
      `INSERT INTO reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, tokenHash, expiresAt],
    );
    await writeOutboxEmail(client, {
      customerId: user.customer_id === null ? null : Number(user.customer_id),
      recipient: email,
      subject: 'Reset your Brightloop password',
      body: `Use this single-use link within 30 minutes: ${resetLink}`,
      expiresAt,
    });
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applyPasswordReset(tokenHash: string, passwordHash: string): Promise<boolean> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const token = await client.query<{ id: string; user_id: string }>(
      `SELECT rt.id, rt.user_id
       FROM reset_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.used_at IS NULL
         AND rt.expires_at > CURRENT_TIMESTAMP AND u.is_active = true
       FOR UPDATE OF rt`,
      [tokenHash],
    );
    if (!token.rows[0]) {
      await client.query('COMMIT');
      return false;
    }
    await client.query(
      'UPDATE reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1',
      [token.rows[0].id],
    );
    await client.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [passwordHash, token.rows[0].user_id],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
