import type { PoolClient } from 'pg';
import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  type: string;
  sales_price: string;
  cost_price: string;
  notes: string | null;
  created_at: Date;
}
export interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  value: string;
  extra_price: string;
}
export interface TaxRow {
  id: string;
  name: string;
  jurisdiction: string;
  rate: string;
}
export const mapProduct = (r: ProductRow) => ({
  id: Number(r.id),
  sku: r.sku,
  name: r.name,
  type: r.type,
  sales_price: r.sales_price,
  cost_price: r.cost_price,
  notes: r.notes,
  created_at: r.created_at,
});
export const mapVariant = (r: VariantRow) => ({
  id: Number(r.id),
  product_id: Number(r.product_id),
  name: r.name,
  value: r.value,
  extra_price: r.extra_price,
});
export const mapTax = (r: TaxRow) => ({
  id: Number(r.id),
  name: r.name,
  jurisdiction: r.jurisdiction,
  rate: r.rate,
});
const productCols = 'id, sku, name, type, sales_price, cost_price, notes, created_at';
const variantCols = 'id, product_id, name, value, extra_price';
const taxCols = 'id, name, jurisdiction, rate';
const joinedTaxCols = 't.id, t.name, t.jurisdiction, t.rate';
export async function createProduct(
  input: {
    sku: string;
    name: string;
    type: string;
    salesPrice: string;
    costPrice: string;
    notes?: string;
  },
  actorId: number,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<ProductRow>(
      `INSERT INTO products(customer_id, sku, name, type, sales_price, cost_price, notes)
       VALUES (NULL, $1, $2, $3, $4, $5, $6)
       RETURNING ${productCols}`,
      [input.sku, input.name, input.type, input.salesPrice, input.costPrice, input.notes ?? null],
    );
    const r = q.rows[0];
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'product',
      entityId: Number(r.id),
      action: 'product_created',
      changes: { sku: r.sku, name: r.name },
    });
    await c.query('COMMIT');
    return mapProduct(r);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function listProducts(limit: number, offset: number) {
  const [p, t] = await Promise.all([
    pool.query<ProductRow>(`SELECT ${productCols} FROM products ORDER BY id DESC LIMIT $1 OFFSET $2`, [
      limit,
      offset,
    ]),
    pool.query<{ total: string }>('SELECT count(*)::text AS total FROM products'),
  ]);
  const ids = p.rows.map((r) => r.id);
  const [v, x] = ids.length
    ? await Promise.all([
        pool.query<VariantRow>(
          `SELECT ${variantCols} FROM product_variants WHERE product_id=ANY($1::bigint[]) ORDER BY id`,
          [ids],
        ),
        pool.query<TaxRow & { product_id: string }>(
          `SELECT pt.product_id, ${joinedTaxCols}
           FROM product_taxes pt JOIN tax_rules t ON t.id = pt.tax_id
           WHERE pt.product_id = ANY($1::bigint[]) ORDER BY t.id`,
          [ids],
        ),
      ])
    : [{ rows: [] as VariantRow[] }, { rows: [] as Array<TaxRow & { product_id: string }> }];
  return {
    products: p.rows.map((r) => ({
      ...mapProduct(r),
      variants: v.rows.filter((z) => z.product_id === r.id).map(mapVariant),
      taxes: x.rows.filter((z) => z.product_id === r.id).map(mapTax),
    })),
    total: Number(t.rows[0].total),
  };
}
export async function getProduct(id: number) {
  const r = await pool.query<ProductRow>(`SELECT ${productCols} FROM products WHERE id=$1`, [id]);
  return r.rows[0] ? mapProduct(r.rows[0]) : undefined;
}
export async function updateProduct(
  id: number,
  input: Partial<{
    sku: string;
    name: string;
    type: string;
    salesPrice: string;
    costPrice: string;
    notes: string | null;
  }>,
  actorId: number,
) {
  const mapping = {
    sku: 'sku',
    name: 'name',
    type: 'type',
    salesPrice: 'sales_price',
    costPrice: 'cost_price',
    notes: 'notes',
  } as const;
  const entries = Object.entries(input) as Array<[keyof typeof mapping, string | null]>;
  const sets = entries.map(([key], index) => `${mapping[key]} = $${index + 1}`);
  const values = entries.map(([, value]) => value);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<ProductRow>(
      `UPDATE products SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${values.length + 1} RETURNING ${productCols}`,
      [...values, id],
    );
    if (result.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'product',
        entityId: id,
        action: 'product_updated',
        changes: Object.fromEntries(entries),
      });
    await c.query('COMMIT');
    return result.rows[0] ? mapProduct(result.rows[0]) : undefined;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export async function productVariants(productId: number) {
  const q = await pool.query<VariantRow>(
    `SELECT ${variantCols} FROM product_variants WHERE product_id=$1 ORDER BY id`,
    [productId],
  );
  return q.rows.map(mapVariant);
}
export async function updateVariant(
  productId: number,
  variantId: number,
  input: Partial<{ name: string; value: string; extraPrice: string }>,
  actorId: number,
) {
  const current = await getVariant(variantId);
  if (!current || current.product_id !== productId) return undefined;
  const name = input.name ?? current.name;
  const value = input.value ?? current.value;
  const extraPrice = input.extraPrice ?? current.extra_price;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<VariantRow>(
      `UPDATE product_variants
       SET name = $1, value = $2, variant_key = $3, extra_price = $4
       WHERE id = $5 AND product_id = $6 RETURNING ${variantCols}`,
      [name, value, `${name}:${value}`, extraPrice, variantId, productId],
    );
    if (result.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'product_variant',
        entityId: variantId,
        action: 'variant_updated',
        changes: { name, value, extra_price: extraPrice },
      });
    await c.query('COMMIT');
    return result.rows[0] ? mapVariant(result.rows[0]) : undefined;
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export async function createVariant(
  productId: number,
  input: { name: string; value: string; extraPrice: string },
  actorId: number,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<VariantRow>(
      `INSERT INTO product_variants(product_id, variant_key, name, value, extra_price)
       VALUES ($1, $2, $2, $3, $4)
       RETURNING ${variantCols}`,
      [productId, `${input.name}:${input.value}`, input.value, input.extraPrice],
    );
    const r = q.rows[0];
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'product_variant',
      entityId: Number(r.id),
      action: 'variant_created',
      changes: { product_id: productId, name: r.name, value: r.value },
    });
    await c.query('COMMIT');
    return mapVariant(r);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function deleteVariant(id: number, actorId: number) {
  const c: PoolClient = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<VariantRow>(`DELETE FROM product_variants WHERE id=$1 RETURNING ${variantCols}`, [
      id,
    ]);
    if (q.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'product_variant',
        entityId: id,
        action: 'variant_deleted',
        changes: { product_id: Number(q.rows[0].product_id) },
      });
    await c.query('COMMIT');
    return Boolean(q.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function getVariant(id: number) {
  const q = await pool.query<VariantRow>(`SELECT ${variantCols} FROM product_variants WHERE id=$1`, [id]);
  return q.rows[0] ? mapVariant(q.rows[0]) : undefined;
}
export async function getTax(id: number) {
  const q = await pool.query<TaxRow>(`SELECT ${taxCols} FROM tax_rules WHERE id=$1`, [id]);
  return q.rows[0] ? mapTax(q.rows[0]) : undefined;
}
export async function listTaxes(limit: number, offset: number) {
  const [rows, count] = await Promise.all([
    pool.query<TaxRow>(`SELECT ${taxCols} FROM tax_rules ORDER BY id DESC LIMIT $1 OFFSET $2`, [
      limit,
      offset,
    ]),
    pool.query<{ total: string }>('SELECT count(*)::text AS total FROM tax_rules'),
  ]);
  return { rows: rows.rows.map(mapTax), total: Number(count.rows[0].total) };
}
export async function updateTax(
  id: number,
  input: Partial<{ name: string; jurisdiction: string; rate: string }>,
  actorId: number,
) {
  const old = await getTax(id);
  if (!old) return undefined;
  const updated = {
    name: input.name ?? old.name,
    jurisdiction: input.jurisdiction ?? old.jurisdiction,
    rate: input.rate ?? old.rate,
  };
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<TaxRow>(
      `UPDATE tax_rules SET name = $1, jurisdiction = $2, rate = $3
       WHERE id = $4 RETURNING ${taxCols}`,
      [updated.name, updated.jurisdiction, updated.rate, id],
    );
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'tax_rule',
      entityId: id,
      action: 'tax_updated',
      changes: input,
    });
    await c.query('COMMIT');
    return mapTax(result.rows[0]);
  } catch (error) {
    await c.query('ROLLBACK');
    throw error;
  } finally {
    c.release();
  }
}
export async function deleteTax(id: number, actorId: number) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await c.query<TaxRow>(`DELETE FROM tax_rules WHERE id = $1 RETURNING ${taxCols}`, [id]);
    if (result.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'tax_rule',
        entityId: id,
        action: 'tax_deleted',
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
export async function createTax(
  input: { name: string; jurisdiction: string; rate: string },
  actorId: number,
) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<TaxRow>(
      `INSERT INTO tax_rules(customer_id,name,jurisdiction,rate) VALUES(NULL,$1,$2,$3) RETURNING ${taxCols}`,
      [input.name, input.jurisdiction, input.rate],
    );
    const r = q.rows[0];
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'tax_rule',
      entityId: Number(r.id),
      action: 'tax_created',
      changes: { name: r.name, jurisdiction: r.jurisdiction },
    });
    await c.query('COMMIT');
    return mapTax(r);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function replaceTaxes(productId: number, ids: number[], actorId: number) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const found = await c.query<{ id: string }>('SELECT id FROM tax_rules WHERE id=ANY($1::bigint[])', [ids]);
    if (found.rowCount !== new Set(ids).size) {
      await c.query('ROLLBACK');
      return false;
    }
    await c.query('DELETE FROM product_taxes WHERE product_id=$1', [productId]);
    for (const id of new Set(ids))
      await c.query('INSERT INTO product_taxes(product_id,tax_id) VALUES($1,$2)', [productId, id]);
    await writeAuditEntry(c, {
      customerId: null,
      userId: actorId,
      entityType: 'product',
      entityId: productId,
      action: 'taxes_replaced',
      changes: { tax_ids: [...new Set(ids)] },
    });
    await c.query('COMMIT');
    return true;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function productTaxes(productId: number) {
  const q = await pool.query<TaxRow>(
    `SELECT ${joinedTaxCols}
     FROM product_taxes pt JOIN tax_rules t ON t.id = pt.tax_id
     WHERE pt.product_id = $1 ORDER BY t.id`,
    [productId],
  );
  return q.rows.map(mapTax);
}
export async function removeProduct(id: number, actorId: number) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = await c.query<ProductRow>(`DELETE FROM products WHERE id=$1 RETURNING ${productCols}`, [id]);
    if (q.rows[0])
      await writeAuditEntry(c, {
        customerId: null,
        userId: actorId,
        entityType: 'product',
        entityId: id,
        action: 'product_deleted',
        changes: { sku: q.rows[0].sku },
      });
    await c.query('COMMIT');
    return Boolean(q.rows[0]);
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
export async function resolvePrice(productId: number, variantId: number | null) {
  const q = await pool.query<{
    sales_price: string;
    extra_price: string | null;
  }>(
    `SELECT p.sales_price, v.extra_price
     FROM products p LEFT JOIN product_variants v
       ON v.product_id = p.id AND v.id = $2
     WHERE p.id = $1`,
    [productId, variantId],
  );
  return q.rows[0];
}
