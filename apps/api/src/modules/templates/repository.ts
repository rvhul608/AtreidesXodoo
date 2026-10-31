import type { PoolClient } from 'pg';
import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';
export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  plan_id: string;
  validity_days: number;
  created_at: Date;
}
export interface LineRow {
  id: string;
  template_id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: string;
  unit_price: string;
}
const columns = 'id,name,description,plan_id,validity_days,created_at';
export async function createTemplate(
  input: {
    name: string;
    description?: string;
    planId: number;
    validityDays: number;
    lines: Array<{
      productId: number;
      variantId?: number;
      quantity: string;
      unitPrice: string;
    }>;
  },
  actorId: number,
) {
  const c: PoolClient = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<TemplateRow>(
      `INSERT INTO quotation_templates(customer_id, name, description, plan_id, validity_days)
       VALUES (NULL, $1, $2, $3, $4) RETURNING ${columns}`,
      [input.name, input.description ?? null, input.planId, input.validityDays],
    );
    const t = q.rows[0];
    for (let i = 0; i < input.lines.length; i++) {
      const line = input.lines[i];
      await c.query(
        `INSERT INTO quotation_template_lines(
           template_id, line_number, product_variant_id, product_id, quantity, quantity_value, unit_price
         ) VALUES ($1, $2, $3, $4, $5, $5, $6)`,
        [t.id, i + 1, line.variantId ?? null, line.productId, line.quantity, line.unitPrice],
      );
    }
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'quotation_template',
      entityId: Number(t.id),
      action: 'template_created',
      changes: {
        name: t.name,
        plan_id: Number(t.plan_id),
        line_count: input.lines.length,
      },
    });
    await c.query('COMMIT');
    return t;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function replaceTemplate(
  id: number,
  input: Parameters<typeof createTemplate>[0],
  actorId: number,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<TemplateRow>(
      `UPDATE quotation_templates
       SET name = $1, description = $2, plan_id = $3, validity_days = $4
       WHERE id = $5 RETURNING ${columns}`,
      [input.name, input.description ?? null, input.planId, input.validityDays, id],
    );
    if (!result.rows[0]) {
      await c.query('ROLLBACK');
      return undefined;
    }
    await c.query('DELETE FROM quotation_template_lines WHERE template_id = $1', [id]);
    for (let index = 0; index < input.lines.length; index++) {
      const line = input.lines[index];
      await c.query(
        `INSERT INTO quotation_template_lines(
           template_id, line_number, product_variant_id, product_id,
           quantity, quantity_value, unit_price
         ) VALUES ($1, $2, $3, $4, $5, $5, $6)`,
        [id, index + 1, line.variantId ?? null, line.productId, line.quantity, line.unitPrice],
      );
    }
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'quotation_template',
      entityId: id,
      action: 'template_updated',
      changes: {
        name: input.name,
        plan_id: input.planId,
        line_count: input.lines.length,
      },
    });
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
  return getTemplate(id);
}
export async function deleteTemplate(id: number, actorId: number) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<TemplateRow>(
      `DELETE FROM quotation_templates WHERE id = $1 RETURNING ${columns}`,
      [id],
    );
    if (result.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'quotation_template',
        entityId: id,
        action: 'template_deleted',
        changes: { name: result.rows[0].name },
      });
    await c.query('COMMIT');
    return Boolean(result.rows[0]);
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export async function listTemplates(limit: number, offset: number) {
  const [t, n] = await Promise.all([
    pool.query<TemplateRow>(
      `SELECT ${columns} FROM quotation_templates ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ total: string }>('SELECT count(*)::text AS total FROM quotation_templates'),
  ]);
  const ids = t.rows.map((x) => x.id);
  const lines = ids.length
    ? await pool.query<LineRow>(
        `SELECT id, template_id, product_id, product_variant_id,
           quantity_value::text AS quantity, unit_price
         FROM quotation_template_lines
         WHERE template_id = ANY($1::bigint[]) ORDER BY line_number, id`,
        [ids],
      )
    : { rows: [] as LineRow[] };
  return {
    rows: t.rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      plan_id: Number(r.plan_id),
      validity_days: r.validity_days,
      created_at: r.created_at,
      expires_on: new Date(r.created_at.getTime() + r.validity_days * 86400000).toISOString().slice(0, 10),
      is_expired: new Date(r.created_at.getTime() + r.validity_days * 86400000) < new Date(),
      lines: lines.rows
        .filter((l) => l.template_id === r.id)
        .map((l) => ({
          id: Number(l.id),
          product_id: Number(l.product_id),
          variant_id: l.product_variant_id ? Number(l.product_variant_id) : null,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
    })),
    total: Number(n.rows[0].total),
  };
}
export async function getTemplate(id: number) {
  const q = await pool.query<TemplateRow>(`SELECT ${columns} FROM quotation_templates WHERE id=$1`, [id]);
  if (!q.rows[0]) return undefined;
  const r = q.rows[0];
  const l = await pool.query<LineRow>(
    `SELECT id, template_id, product_id, product_variant_id,
       quantity_value::text AS quantity, unit_price
     FROM quotation_template_lines WHERE template_id = $1 ORDER BY line_number, id`,
    [id],
  );
  const expiry = new Date(r.created_at.getTime() + r.validity_days * 86400000);
  return {
    id: Number(r.id),
    name: r.name,
    description: r.description,
    plan_id: Number(r.plan_id),
    validity_days: r.validity_days,
    created_at: r.created_at,
    expires_on: expiry.toISOString().slice(0, 10),
    is_expired: expiry < new Date(),
    lines: l.rows.map((x) => ({
      id: Number(x.id),
      product_id: Number(x.product_id),
      variant_id: x.product_variant_id ? Number(x.product_variant_id) : null,
      quantity: x.quantity,
      unit_price: x.unit_price,
    })),
  };
}
