import type { PoolClient } from 'pg';
import { writeAuditEntry, type AuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';

export type SubscriptionStatus = 'Draft' | 'Quotation' | 'Confirmed' | 'Active' | 'Paused' | 'Closed';
export type PlanPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

// Dates are selected as ::text so they stay plain YYYY-MM-DD strings instead of
// being shifted by the Node process time zone.
export interface PlanTermsRow {
  id: string;
  name: string;
  price: string;
  period: PlanPeriod;
  min_quantity: number;
  available_from: string | null;
  available_until: string | null;
  auto_close: boolean;
  allow_early_close: boolean;
  allow_pause: boolean;
  allow_renew: boolean;
}

export interface CatalogProductRow {
  id: string;
  name: string;
  sales_price: string;
  tax_ids: string[];
  tax_rate: string;
}

export interface CatalogVariantRow {
  id: string;
  product_id: string;
  name: string;
  value: string;
  extra_price: string;
}

export interface TemplateRow {
  id: string;
  plan_id: string | null;
  expires_on: string;
}

export interface TemplateLineRow {
  product_id: string;
  product_variant_id: string | null;
  quantity: string;
}

export interface SubscriptionRow {
  id: string;
  subscription_number: string;
  customer_id: string;
  customer_name: string;
  plan_id: string;
  plan_name: string;
  template_id: string | null;
  status: SubscriptionStatus;
  period: string;
  quantity: string;
  unit_price: string;
  start_date: string;
  expiry_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  payment_terms: string;
  created_at: Date;
  updated_at: Date;
}

export interface LockedSubscriptionRow {
  id: string;
  customer_id: string;
  status: SubscriptionStatus;
  start_date: string;
  expiry_date: string | null;
  next_billing_date: string | null;
  paused_at: string | null;
  period: PlanPeriod;
  allow_pause: boolean;
  allow_renew: boolean;
  allow_early_close: boolean;
}

export interface SubscriptionLineRow {
  id: string;
  subscription_id: string;
  product_id: string | null;
  product_variant_id: string | null;
  description: string | null;
  quantity: string;
  unit_price: string;
  amount: string;
  tax_amount: string;
  tax_ids: string[];
}

export interface HistoryRow {
  id: string;
  subscription_id: string;
  from_status: string | null;
  to_status: string;
  action: string | null;
  reason: string | null;
  actor_user_id: string | null;
  changed_at: Date;
}

export interface NewLine {
  productId: number;
  variantId: number | null;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  taxAmount: string;
  taxIds: number[];
}

export interface NewSubscription {
  customerId: number;
  planId: number;
  templateId: number | null;
  period: PlanPeriod;
  quantity: string;
  unitPrice: string;
  startDate: string;
  expiryDate: string | null;
  paymentTerms: string;
}

export interface SubscriptionFilters {
  status?: SubscriptionStatus;
  customerId?: number;
  q?: string;
}

export interface StatusChange {
  status: SubscriptionStatus;
  expiryDate: string | null;
  nextBillingDate: string | null;
  pausedAt: string | null;
  closed: boolean;
}

export interface HistoryEntry {
  subscriptionId: number;
  from: SubscriptionStatus | null;
  to: SubscriptionStatus;
  action: string;
  actorId: number | null;
  reason: string | null;
}

const subscriptionColumns = `
  s.id, s.subscription_number, s.customer_id, c.legal_name AS customer_name,
  s.plan_id, p.name AS plan_name, s.template_id, s.status, s.period, s.quantity, s.unit_price,
  s.start_date::text AS start_date, s.expiry_date::text AS expiry_date,
  s.next_billing_date::text AS next_billing_date, s.paused_at::text AS paused_at,
  s.payment_terms, s.created_at, s.updated_at`;

const lineColumns = `
  id, subscription_id, product_id, product_variant_id, description, quantity, unit_price,
  amount, tax_amount, tax_ids`;

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function customerExists(customerId: number): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM customers WHERE id = $1', [customerId]);
  return result.rowCount === 1;
}

export async function findPlanTerms(planId: number): Promise<PlanTermsRow | null> {
  const result = await pool.query<PlanTermsRow>(
    `SELECT id, name, price, period, min_quantity,
       available_from::text AS available_from, available_until::text AS available_until,
       auto_close, allow_early_close, allow_pause, allow_renew
     FROM plans WHERE id = $1`,
    [planId],
  );
  return result.rows[0] ?? null;
}

export async function findCatalogProducts(productIds: number[]): Promise<CatalogProductRow[]> {
  const result = await pool.query<CatalogProductRow>(
    `SELECT p.id, p.name, p.sales_price,
       COALESCE(array_agg(t.id ORDER BY t.id) FILTER (WHERE t.id IS NOT NULL), '{}') AS tax_ids,
       COALESCE(sum(t.rate), 0)::text AS tax_rate
     FROM products p
     LEFT JOIN product_taxes pt ON pt.product_id = p.id
     LEFT JOIN tax_rules t ON t.id = pt.tax_id
     WHERE p.id = ANY($1::bigint[])
     GROUP BY p.id`,
    [productIds],
  );
  return result.rows;
}

export async function findCatalogVariants(variantIds: number[]): Promise<CatalogVariantRow[]> {
  if (variantIds.length === 0) return [];
  const result = await pool.query<CatalogVariantRow>(
    `SELECT id, product_id, name, value, extra_price
     FROM product_variants WHERE id = ANY($1::bigint[])`,
    [variantIds],
  );
  return result.rows;
}

export async function findTemplate(templateId: number): Promise<TemplateRow | null> {
  const result = await pool.query<TemplateRow>(
    `SELECT id, plan_id, (created_at::date + validity_days)::text AS expires_on
     FROM quotation_templates WHERE id = $1`,
    [templateId],
  );
  return result.rows[0] ?? null;
}

export async function findTemplateLines(templateId: number): Promise<TemplateLineRow[]> {
  const result = await pool.query<TemplateLineRow>(
    `SELECT product_id, product_variant_id, quantity_value::text AS quantity
     FROM quotation_template_lines
     WHERE template_id = $1 AND product_id IS NOT NULL
     ORDER BY line_number, id`,
    [templateId],
  );
  return result.rows;
}

export async function insertSubscription(client: PoolClient, input: NewSubscription): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO subscriptions (customer_id, plan_id, template_id, period, quantity, unit_price,
       start_date, expiry_date, payment_terms, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Draft')
     RETURNING id`,
    [
      input.customerId,
      input.planId,
      input.templateId,
      input.period,
      input.quantity,
      input.unitPrice,
      input.startDate,
      input.expiryDate,
      input.paymentTerms,
    ],
  );
  return Number(result.rows[0].id);
}

export async function updateDraftTerms(
  client: PoolClient,
  id: number,
  input: Omit<NewSubscription, 'customerId' | 'templateId'>,
): Promise<void> {
  await client.query(
    `UPDATE subscriptions
     SET plan_id = $2, period = $3, quantity = $4, unit_price = $5, start_date = $6,
       expiry_date = $7, payment_terms = $8, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      id,
      input.planId,
      input.period,
      input.quantity,
      input.unitPrice,
      input.startDate,
      input.expiryDate,
      input.paymentTerms,
    ],
  );
}

export async function replaceLines(client: PoolClient, subscriptionId: number, lines: NewLine[]): Promise<void> {
  await client.query('DELETE FROM subscription_items WHERE subscription_id = $1', [subscriptionId]);
  // One multi-row insert per subscription instead of one round trip per line.
  await client.query(
    `INSERT INTO subscription_items (subscription_id, product_id, product_variant_id, description,
       quantity, unit_price, amount, tax_amount, tax_ids)
     SELECT $1, line.product_id, line.variant_id, line.description, line.quantity, line.unit_price,
       line.amount, line.tax_amount,
       COALESCE(string_to_array(NULLIF(line.tax_ids, ''), ',')::bigint[], '{}')
     FROM unnest($2::bigint[], $3::bigint[], $4::text[], $5::numeric[], $6::numeric[],
       $7::numeric[], $8::numeric[], $9::text[])
       AS line(product_id, variant_id, description, quantity, unit_price, amount, tax_amount, tax_ids)`,
    [
      subscriptionId,
      lines.map((line) => line.productId),
      lines.map((line) => line.variantId),
      lines.map((line) => line.description),
      lines.map((line) => line.quantity),
      lines.map((line) => line.unitPrice),
      lines.map((line) => line.amount),
      lines.map((line) => line.taxAmount),
      lines.map((line) => line.taxIds.join(',')),
    ],
  );
}

export async function insertHistory(client: PoolClient, entry: HistoryEntry): Promise<void> {
  await client.query(
    `INSERT INTO subscription_history
       (subscription_id, status, from_status, to_status, action, actor_user_id, reason)
     VALUES ($1, $2, $3, $2, $4, $5, $6)`,
    [entry.subscriptionId, entry.to, entry.from, entry.action, entry.actorId, entry.reason],
  );
}

export async function writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await writeAuditEntry(client, entry);
}

export async function listSubscriptions(
  filters: SubscriptionFilters,
  limit: number,
  offset: number,
): Promise<{ rows: SubscriptionRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`s.status = $${values.length}`);
  }
  if (filters.customerId !== undefined) {
    values.push(filters.customerId);
    conditions.push(`s.customer_id = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    conditions.push(`s.subscription_number ILIKE $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    pool.query<SubscriptionRow>(
      `SELECT ${subscriptionColumns}
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
       ${where}
       ORDER BY s.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM subscriptions s ${where}`, values),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].total) };
}

// customerId scopes the lookup for portal callers; null means staff/admin access.
export async function findSubscription(id: number, customerId: number | null): Promise<SubscriptionRow | null> {
  const result = await pool.query<SubscriptionRow>(
    `SELECT ${subscriptionColumns}
     FROM subscriptions s
     JOIN customers c ON c.id = s.customer_id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.id = $1 AND ($2::bigint IS NULL OR s.customer_id = $2)`,
    [id, customerId],
  );
  return result.rows[0] ?? null;
}

export async function findLines(subscriptionIds: number[]): Promise<SubscriptionLineRow[]> {
  const result = await pool.query<SubscriptionLineRow>(
    `SELECT ${lineColumns} FROM subscription_items
     WHERE subscription_id = ANY($1::bigint[])
     ORDER BY subscription_id, id`,
    [subscriptionIds],
  );
  return result.rows;
}

export async function findHistory(subscriptionId: number): Promise<HistoryRow[]> {
  const result = await pool.query<HistoryRow>(
    `SELECT id, subscription_id, from_status, to_status, action, reason, actor_user_id, changed_at
     FROM subscription_history
     WHERE subscription_id = $1
     ORDER BY changed_at DESC, id DESC`,
    [subscriptionId],
  );
  return result.rows;
}

// Row lock serialises concurrent transitions on the same subscription.
export async function lockSubscription(
  client: PoolClient,
  id: number,
  customerId: number | null,
): Promise<LockedSubscriptionRow | null> {
  const result = await client.query<LockedSubscriptionRow>(
    `SELECT s.id, s.customer_id, s.status, s.start_date::text AS start_date,
       s.expiry_date::text AS expiry_date, s.next_billing_date::text AS next_billing_date,
       s.paused_at::text AS paused_at, p.period, p.allow_pause, p.allow_renew, p.allow_early_close
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.id = $1 AND ($2::bigint IS NULL OR s.customer_id = $2)
     FOR UPDATE OF s`,
    [id, customerId],
  );
  return result.rows[0] ?? null;
}

export async function applyStatusChange(client: PoolClient, id: number, change: StatusChange): Promise<void> {
  await client.query(
    `UPDATE subscriptions
     SET status = $2, expiry_date = $3, next_billing_date = $4, paused_at = $5,
       closed_at = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE NULL END,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, change.status, change.expiryDate, change.nextBillingDate, change.pausedAt, change.closed],
  );
}

export async function notifyStatusChange(
  client: PoolClient,
  payload: { id: number; from: SubscriptionStatus; to: SubscriptionStatus; action: string },
): Promise<void> {
  // Delivered on COMMIT only, so listeners never see a rolled-back transition.
  await client.query('SELECT pg_notify($1, $2)', ['subscription_status_changed', JSON.stringify(payload)]);
}

export async function deleteDraft(client: PoolClient, id: number): Promise<void> {
  await client.query('DELETE FROM subscriptions WHERE id = $1', [id]);
}

export async function findAutoCloseCandidates(asOf: string): Promise<number[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT s.id
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.status IN ('Active', 'Paused') AND p.auto_close AND s.expiry_date < $1::date
     ORDER BY s.id`,
    [asOf],
  );
  return result.rows.map((row) => Number(row.id));
}
