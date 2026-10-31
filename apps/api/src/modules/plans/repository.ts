import type { PoolClient } from 'pg';
import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';

export interface PlanRow {
  id: string;
  plan_number: string;
  name: string;
  description: string | null;
  price: string;
  period: string;
  min_quantity: number;
  available_from: Date | null;
  available_until: Date | null;
  auto_close: boolean;
  allow_early_close: boolean;
  allow_pause: boolean;
  allow_renew: boolean;
}
export const planColumns = [
  'id',
  'plan_number',
  'name',
  'description',
  'price',
  'period',
  'min_quantity',
  'available_from',
  'available_until',
  'auto_close',
  'allow_early_close',
  'allow_pause',
  'allow_renew',
].join(', ');
export function mapPlan(r: PlanRow) {
  return {
    id: Number(r.id),
    plan_number: r.plan_number,
    name: r.name,
    description: r.description,
    price: r.price,
    period: r.period,
    min_quantity: r.min_quantity,
    available_from: r.available_from,
    available_until: r.available_until,
    auto_close: r.auto_close,
    allow_early_close: r.allow_early_close,
    allow_pause: r.allow_pause,
    allow_renew: r.allow_renew,
    pricing: [{ period: r.period, price: r.price }],
  };
}
export async function getPlanById(id: number) {
  const q = await pool.query<PlanRow>(`SELECT ${planColumns} FROM plans WHERE id=$1`, [id]);
  return q.rows[0];
}
export async function listPlans(limit: number, offset: number, availableOn?: string) {
  const [q, count] = await Promise.all([
    pool.query<PlanRow>(
      `SELECT ${planColumns} FROM plans
       WHERE $3::date IS NULL OR
         ((available_from IS NULL OR available_from <= $3) AND
          (available_until IS NULL OR available_until >= $3))
       ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [limit, offset, availableOn ?? null],
    ),
    pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM plans
       WHERE $1::date IS NULL OR
         ((available_from IS NULL OR available_from <= $1) AND
          (available_until IS NULL OR available_until >= $1))`,
      [availableOn ?? null],
    ),
  ]);
  return { rows: q.rows, total: Number(count.rows[0].total) };
}
export async function writePlan(
  input: {
    planNumber: string;
    name: string;
    description?: string;
    price: string;
    period: string;
    minQuantity: number;
    availableFrom?: string;
    availableUntil?: string;
    autoClose: boolean;
    allowEarlyClose: boolean;
    allowPause: boolean;
    allowRenew: boolean;
  },
  actorId: number,
) {
  const c: PoolClient = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<PlanRow>(
      `INSERT INTO plans(
         customer_id, plan_number, name, description, price, period, min_quantity,
         available_from, available_until, auto_close, allow_early_close, allow_pause, allow_renew
       ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${planColumns}`,
      [
        input.planNumber,
        input.name,
        input.description ?? null,
        input.price,
        input.period,
        input.minQuantity,
        input.availableFrom ?? null,
        input.availableUntil ?? null,
        input.autoClose,
        input.allowEarlyClose,
        input.allowPause,
        input.allowRenew,
      ],
    );
    const r = q.rows[0];
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'plan',
      entityId: Number(r.id),
      action: 'plan_created',
      changes: {
        plan_number: r.plan_number,
        name: r.name,
        period: r.period,
        price: r.price,
      },
    });
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function patchPlan(
  id: number,
  patch: Partial<Pick<PlanRow, 'auto_close' | 'allow_early_close' | 'allow_pause' | 'allow_renew'>>,
  actorId: number,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const old = await getPlanById(id);
    if (!old) {
      await c.query('COMMIT');
      return undefined;
    }
    const fields = Object.keys(patch);
    const column = fields[0];
    const value = Object.values(patch)[0];
    const q = await c.query<PlanRow>(
      `UPDATE plans SET ${column}=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING ${planColumns}`,
      [value, id],
    );
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'plan',
      entityId: id,
      action: 'plan_updated',
      changes: patch,
    });
    await c.query('COMMIT');
    return q.rows[0];
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
