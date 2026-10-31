import type { PoolClient } from 'pg';
import { pool } from '../../common/db.js';
import { withTransaction } from '../subscriptions/repository.js';

export { withTransaction };

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  subscription_id: string;
  subscription_number: string;
  subtotal: string;
  discount_total: string;
  tax_amount: string;
  total: string;
  issued_date: string;
  due_date: string;
  status: 'Draft' | 'Confirmed' | 'Paid' | 'Cancelled';
  amount_paid: string;
  outstanding: string;
  is_overdue: boolean;
  confirmed_at: Date | null;
  sent_at: Date | null;
}

export interface InvoiceFilters {
  status?: InvoiceRow['status'];
  customerId?: number;
  subscriptionId?: number;
  overdue?: boolean;
  q?: string;
  dueFrom?: string;
  dueTo?: string;
}

const invoiceSelect = `
  i.id, i.invoice_number, i.customer_id, c.legal_name AS customer_name,
  i.subscription_id, s.subscription_number, i.subtotal, i.discount_total, i.tax_amount,
  i.total, i.issued_date::text AS issued_date, i.due_date::text AS due_date, i.status,
  COALESCE(p.amount_paid, 0)::text AS amount_paid,
  GREATEST(i.total - COALESCE(p.amount_paid, 0), 0)::text AS outstanding,
  (i.status = 'Confirmed' AND i.due_date < CURRENT_DATE) AS is_overdue,
  i.confirmed_at, i.sent_at`;

const paidJoin = `LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS amount_paid FROM payments
  WHERE status = 'Received' GROUP BY invoice_id
) p ON p.invoice_id = i.id`;

export async function listInvoices(filters: InvoiceFilters, limit: number, offset: number) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    conditions.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.status) add('i.status = ?', filters.status);
  if (filters.customerId) add('i.customer_id = ?', filters.customerId);
  if (filters.subscriptionId) add('i.subscription_id = ?', filters.subscriptionId);
  if (filters.q) add('i.invoice_number ILIKE ?', `%${filters.q}%`);
  if (filters.dueFrom) add('i.due_date >= ?::date', filters.dueFrom);
  if (filters.dueTo) add('i.due_date <= ?::date', filters.dueTo);
  if (filters.overdue) conditions.push("i.status = 'Confirmed' AND i.due_date < CURRENT_DATE");
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM invoices i ${where}`,
    values,
  );
  const result = await pool.query<InvoiceRow>(
    `SELECT ${invoiceSelect} FROM invoices i JOIN customers c ON c.id = i.customer_id
     JOIN subscriptions s ON s.id = i.subscription_id ${paidJoin} ${where}
     ORDER BY i.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return { rows: result.rows, total: Number(count.rows[0].count) };
}

export async function findInvoice(id: number, client = pool) {
  const result = await client.query<InvoiceRow>(
    `SELECT ${invoiceSelect} FROM invoices i JOIN customers c ON c.id = i.customer_id
     JOIN subscriptions s ON s.id = i.subscription_id ${paidJoin} WHERE i.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findInvoiceLines(id: number, client = pool) {
  const result = await client.query<{
    id: string;
    description: string;
    quantity: string;
    unit_price: string;
    line_total: string;
    tax_rate: string;
    tax_amount: string;
    discount_amount: string;
  }>(
    `SELECT id, description, quantity, unit_price, line_total, tax_rate, tax_amount, discount_amount
     FROM invoice_line_items WHERE invoice_id = $1 ORDER BY line_number, id`,
    [id],
  );
  return result.rows;
}

export async function findInvoiceHistory(id: number, client = pool) {
  const result = await client.query(
    `SELECT id, from_status, to_status, action, actor_user_id, reason, changed_at
     FROM invoice_status_history WHERE invoice_id = $1 ORDER BY changed_at, id`,
    [id],
  );
  return result.rows;
}

export async function findInvoicePayments(id: number, client = pool) {
  const result = await client.query(
    `SELECT id, amount, status, paid_on::text AS paid_on, payment_method, notes
     FROM payments WHERE invoice_id = $1 ORDER BY paid_on, id`,
    [id],
  );
  return result.rows;
}

export async function lockInvoice(client: PoolClient, id: number) {
  const result = await client.query(
    `SELECT i.*, c.legal_name AS customer_name FROM invoices i
     JOIN customers c ON c.id = i.customer_id WHERE i.id = $1 FOR UPDATE OF i`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function writeInvoiceHistory(
  client: PoolClient,
  id: number,
  from: string,
  to: string,
  action: string,
  actor: number,
  reason: string | undefined,
) {
  await client.query(
    `INSERT INTO invoice_status_history (invoice_id, from_status, to_status, action, actor_user_id, reason)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, from, to, action, actor, reason ?? null],
  );
  await client.query('SELECT pg_notify($1, $2)', [
    'invoice_status_changed',
    JSON.stringify({ invoiceId: id, from, to, action, actorUserId: actor }),
  ]);
}

export async function receivedPaymentExists(client: PoolClient, id: number) {
  const result = await client.query(
    "SELECT 1 FROM payments WHERE invoice_id = $1 AND status = 'Received' LIMIT 1",
    [id],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function releaseDiscountUsage(client: PoolClient, id: number) {
  // Billing locks finite budgets before unlimited counters; cancellation follows
  // the same order to avoid cycles when releasing several rules at once.
  await client.query(`SELECT r.id FROM discount_rules r
    WHERE r.id IN (SELECT discount_rule_id FROM discount_usage WHERE invoice_id = $1)
    ORDER BY (r.usage_limit IS NULL), r.id FOR NO KEY UPDATE`, [id]);
  const removed = await client.query<{ discount_rule_id: string }>(
    'DELETE FROM discount_usage WHERE invoice_id = $1 RETURNING discount_rule_id',
    [id],
  );
  for (const row of removed.rows) {
    await client.query('UPDATE discount_rules SET times_used = GREATEST(times_used - 1, 0) WHERE id = $1', [
      row.discount_rule_id,
    ]);
  }
}

export async function updateInvoiceStatus(
  client: PoolClient,
  id: number,
  status: string,
  timestampColumn: 'confirmed_at' | 'cancelled_at',
) {
  await client.query(
    `UPDATE invoices SET status = $2, ${timestampColumn} = NOW(), updated_at = NOW() WHERE id = $1`,
    [id, status],
  );
}

export async function markInvoiceSent(client: PoolClient, id: number) {
  await client.query('UPDATE invoices SET sent_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
}

// The customer's first active portal login receives invoice emails.
export async function findBillingContact(client: PoolClient, customerId: number): Promise<string | null> {
  const result = await client.query<{ email: string }>(
    `SELECT email FROM users
     WHERE customer_id = $1 AND role = 'customer' AND is_active = TRUE
     ORDER BY id LIMIT 1`,
    [customerId],
  );
  return result.rows[0]?.email ?? null;
}
