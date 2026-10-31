import type { PoolClient } from 'pg';
import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';
import type { UserRole } from '../../common/auth.types.js';

export interface UserRecord {
  id: number;
  email: string;
  name: string | null;
  customerId: number | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  customer_id: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
}

function mapUser(row: UserRow): UserRecord {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    customerId: row.customer_id === null ? null : Number(row.customer_id),
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

const columns = 'id, email, name, customer_id, role, is_active, created_at';

export async function createStaffUser(input: {
  email: string;
  name: string | null;
  passwordHash: string;
  actorId: number;
}): Promise<UserRecord> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, role, name)
       VALUES ($1, $2, 'staff', $3)
       RETURNING ${columns}`,
      [input.email, input.passwordHash, input.name],
    );
    const user = mapUser(result.rows[0]);
    await writeAuditEntry(client, {
      customerId: null,
      userId: input.actorId,
      entityType: 'user',
      entityId: user.id,
      action: 'staff_created',
      changes: { role: 'staff', email: user.email },
    });
    await client.query('COMMIT');
    return user;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listUsers(limit: number, offset: number): Promise<{ users: UserRecord[]; total: number }> {
  const [rows, count] = await Promise.all([
    pool.query<UserRow>(
      `SELECT ${columns} FROM users ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ total: string }>('SELECT count(*)::text AS total FROM users'),
  ]);
  return { users: rows.rows.map(mapUser), total: Number(count.rows[0].total) };
}

export async function deactivateUser(userId: number, actorId: number): Promise<UserRecord | undefined> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const selected = await client.query<UserRow>(
      `SELECT ${columns} FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    if (!selected.rows[0]) {
      await client.query('COMMIT');
      return undefined;
    }
    if (selected.rows[0].is_active) {
      const updated = await client.query<UserRow>(
        `UPDATE users SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING ${columns}`,
        [userId],
      );
      await writeAuditEntry(client, {
        customerId: selected.rows[0].customer_id === null ? null : Number(selected.rows[0].customer_id),
        userId: actorId,
        entityType: 'user',
        entityId: userId,
        action: 'user_deactivated',
        changes: { email: selected.rows[0].email },
      });
      await client.query('COMMIT');
      return mapUser(updated.rows[0]);
    }
    await client.query('COMMIT');
    return mapUser(selected.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
