import type { PoolClient } from 'pg';
import { pool } from '../../common/db.js';
import { writeAuditEntry, type AuditEntry } from '../../common/audit.repository.js';

export interface DiscountRow {
  id: string;
  name: string;
  description: string | null;
  kind: 'percentage' | 'fixed';
  value: string;
  applies_to: 'subscription' | 'products';
  min_purchase: string;
  min_quantity: string;
  starts_on: string | null;
  ends_on: string | null;
  usage_limit: number | null;
  times_used: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  state: string;
}

export interface DiscountUsageRow {
  id: string;
  invoice_number: string;
  amount: string;
  used_at: Date;
}

export interface DiscountInput {
  name: string;
  description: string | null;
  kind: 'percentage' | 'fixed';
  value: string;
  appliesTo: 'subscription' | 'products';
  minPurchase: string;
  minQuantity: string;
  startsOn: string | null;
  endsOn: string | null;
  usageLimit: number | null;
  isActive: boolean;
}

const stateExpression = `CASE WHEN NOT r.is_active THEN 'inactive'
  WHEN r.starts_on > CURRENT_DATE THEN 'scheduled'
  WHEN r.ends_on < CURRENT_DATE THEN 'expired'
  WHEN r.usage_limit IS NOT NULL AND r.times_used >= r.usage_limit THEN 'exhausted'
  ELSE 'active' END`;

const columns = `r.id, r.name, r.description, r.kind, r.value::text AS value, r.applies_to,
  r.min_purchase::text AS min_purchase, r.min_quantity::text AS min_quantity,
  r.starts_on::text AS starts_on, r.ends_on::text AS ends_on, r.usage_limit, r.times_used,
  r.is_active, r.created_at, r.updated_at, ${stateExpression} AS state`;

export async function listDiscounts(
  state: string | undefined,
  q: string | undefined,
  limit: number,
  offset: number,
) {
  const values: unknown[] = [];
  const where: string[] = [];
  if (state) {
    values.push(state);
    where.push(`${stateExpression} = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    where.push(`r.name ILIKE $${values.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    pool.query<DiscountRow>(
      `SELECT ${columns} FROM discount_rules r ${clause}
      ORDER BY r.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM discount_rules r ${clause}`, values),
  ]);
  const ids = rows.rows.map((row) => row.id);
  const targets = ids.length
    ? await pool.query<{ rule_id: string; product_id: string }>(
        `SELECT discount_rule_id AS rule_id, scope_id AS product_id FROM discount_scopes
     WHERE scope_type = 'product' AND discount_rule_id = ANY($1::bigint[]) ORDER BY scope_id`,
        [ids],
      )
    : null;
  const productIds = new Map<string, number[]>();
  for (const target of targets?.rows ?? []) {
    const list = productIds.get(target.rule_id) ?? [];
    list.push(Number(target.product_id));
    productIds.set(target.rule_id, list);
  }
  return {
    rows: rows.rows.map((row) => ({ ...row, product_ids: productIds.get(row.id) ?? [] })),
    total: Number(count.rows[0].total),
  };
}

export async function findDiscount(id: number): Promise<DiscountRow | null> {
  const result = await pool.query<DiscountRow>(`SELECT ${columns} FROM discount_rules r WHERE r.id = $1`, [
    id,
  ]);
  return result.rows[0] ?? null;
}

export async function findDiscountProducts(id: number): Promise<number[]> {
  const result = await pool.query<{ scope_id: string }>(
    `SELECT scope_id FROM discount_scopes WHERE discount_rule_id = $1 AND scope_type = 'product' ORDER BY scope_id`,
    [id],
  );
  return result.rows.map((row) => Number(row.scope_id));
}

export async function findUsage(id: number): Promise<DiscountUsageRow[]> {
  const result = await pool.query<DiscountUsageRow>(
    `SELECT u.id, i.invoice_number, u.amount::text AS amount, u.created_at AS used_at
     FROM discount_usage u JOIN invoices i ON i.id = u.invoice_id
     WHERE u.discount_rule_id = $1 ORDER BY u.created_at DESC, u.id DESC LIMIT 100`,
    [id],
  );
  return result.rows;
}

export async function insertDiscount(client: PoolClient, input: DiscountInput): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO discount_rules (name, description, kind, value, discount_percent, applies_to,
      min_purchase, min_quantity, starts_on, ends_on, usage_limit, is_active)
     VALUES ($1,$2,$3,$4,CASE WHEN $3='percentage' THEN $4 ELSE 0::numeric END,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [
      input.name,
      input.description,
      input.kind,
      input.value,
      input.appliesTo,
      input.minPurchase,
      input.minQuantity,
      input.startsOn,
      input.endsOn,
      input.usageLimit,
      input.isActive,
    ],
  );
  return Number(result.rows[0].id);
}

export type DiscountPatch = Partial<DiscountInput> & { productIds?: number[] };

export async function replaceDiscount(client: PoolClient, id: number, input: DiscountPatch): Promise<void> {
  const mapping: Array<[keyof DiscountInput, string]> = [
    ['name', 'name'],
    ['description', 'description'],
    ['kind', 'kind'],
    ['value', 'value'],
    ['appliesTo', 'applies_to'],
    ['minPurchase', 'min_purchase'],
    ['minQuantity', 'min_quantity'],
    ['startsOn', 'starts_on'],
    ['endsOn', 'ends_on'],
    ['usageLimit', 'usage_limit'],
    ['isActive', 'is_active'],
  ];
  const pairs = mapping.filter(([key]) => input[key] !== undefined);
  const values = pairs.map(([key]) => input[key]);
  const sets = pairs.map(([, column], index) => `${column} = $${index + 2}`);
  if (input.kind !== undefined || input.value !== undefined) {
    values.push(input.value ?? null, input.kind ?? null);
    sets.push(`discount_percent = CASE WHEN COALESCE($${values.length}, kind)='percentage'
      THEN COALESCE($${values.length - 1}, value) ELSE 0 END`);
  }
  if (sets.length)
    await client.query(
      `UPDATE discount_rules SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id, ...values],
    );
  if (input.productIds) {
    await client.query(`DELETE FROM discount_scopes WHERE discount_rule_id=$1 AND scope_type='product'`, [
      id,
    ]);
    if (input.productIds.length)
      await client.query(
        `INSERT INTO discount_scopes (discount_rule_id,scope_type,scope_id)
       SELECT $1,'product', unnest($2::bigint[])`,
        [id, input.productIds],
      );
  }
}

export async function insertScopes(client: PoolClient, id: number, productIds: number[]): Promise<void> {
  if (productIds.length)
    await client.query(
      `INSERT INTO discount_scopes (discount_rule_id,scope_type,scope_id)
     SELECT $1,'product', unnest($2::bigint[])`,
      [id, productIds],
    );
}

export async function productsExist(ids: number[]): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM products WHERE id=ANY($1::bigint[])`,
    [ids],
  );
  return Number(result.rows[0].count) === ids.length;
}

export async function lockDiscount(client: PoolClient, id: number): Promise<DiscountRow | null> {
  const result = await client.query<DiscountRow>(
    `SELECT ${columns} FROM discount_rules r WHERE r.id=$1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function deleteDiscount(client: PoolClient, id: number): Promise<void> {
  await client.query('DELETE FROM discount_rules WHERE id=$1', [id]);
}

export async function hasUsage(id: number): Promise<boolean> {
  const result = await pool.query<{ found: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM discount_usage WHERE discount_rule_id=$1) AS found',
    [id],
  );
  return result.rows[0].found;
}

export async function writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await writeAuditEntry(client, entry);
}
