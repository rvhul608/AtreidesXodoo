import type { PoolClient } from 'pg';
import { pool } from '../../common/db.js';
import { writeAuditEntry, type AuditEntry } from '../../common/audit.repository.js';

export interface InvoiceRow {
  id: string;
  customer_id: string;
  invoice_number: string;
  total: string;
  status: string;
  due_date: string;
  paid_at: Date | null;
}

export interface PaymentRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  payment_method: string;
  status: string;
  paid_on: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: Date;
}

export interface PaymentInput {
  method: string;
  amount: string;
  paidOn: string;
  note: string | null;
}

const paymentCols = `p.id, p.invoice_id, i.invoice_number, p.customer_id, c.legal_name AS customer_name,
  p.amount::text AS amount, p.payment_method, p.status, p.paid_on::text AS paid_on,
  p.notes, p.recorded_by, p.created_at`;

export async function lockInvoice(client: PoolClient, id: number): Promise<InvoiceRow | null> {
  const result = await client.query<InvoiceRow>(
    `SELECT id, customer_id, invoice_number, total::text AS total, status, due_date::text AS due_date, paid_at
     FROM invoices WHERE id=$1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function amountPaid(client: PoolClient, id: number): Promise<string> {
  const result = await client.query<{ amount: string }>(
    `SELECT COALESCE(sum(amount),0)::text AS amount FROM payments WHERE invoice_id=$1 AND status='Received'`,
    [id],
  );
  return result.rows[0].amount;
}

export async function insertPayment(
  client: PoolClient,
  invoice: InvoiceRow,
  input: PaymentInput,
  actorId: number,
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payments (invoice_id,customer_id,amount,payment_method,status,paid_on,notes,recorded_by)
     VALUES ($1,$2,$3,$4,'Received',$5,$6,$7) RETURNING id`,
    [invoice.id, invoice.customer_id, input.amount, input.method, input.paidOn, input.note, actorId],
  );
  return result.rows[0].id;
}

export async function setInvoicePaid(client: PoolClient, id: number, actorId: number): Promise<void> {
  await client.query(
    `UPDATE invoices SET status='Paid',paid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
    [id],
  );
  await client.query(
    `INSERT INTO invoice_status_history (invoice_id,from_status,to_status,action,actor_user_id)
    VALUES ($1,'Confirmed','Paid','paid',$2)`,
    [id, actorId],
  );
  await notify(client, 'invoice_status_changed', { id, from: 'Confirmed', to: 'Paid', action: 'paid' });
}

export async function notify(client: PoolClient, channel: string, data: unknown): Promise<void> {
  await client.query('SELECT pg_notify($1,$2)', [channel, JSON.stringify(data)]);
}

export async function findPayment(client: PoolClient, id: string): Promise<PaymentRow> {
  const result = await client.query<PaymentRow>(
    `SELECT ${paymentCols} FROM payments p
    JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=p.customer_id WHERE p.id=$1`,
    [id],
  );
  return result.rows[0];
}

export async function listInvoicePayments(id: number): Promise<PaymentRow[]> {
  const result = await pool.query<PaymentRow>(
    `SELECT ${paymentCols} FROM payments p
    JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=p.customer_id
    WHERE p.invoice_id=$1 ORDER BY p.paid_on DESC,p.id DESC`,
    [id],
  );
  return result.rows;
}

export interface PaymentFilters {
  method?: string;
  customerId?: number;
  invoiceId?: number;
  from?: string;
  to?: string;
}

export async function listPayments(filters: PaymentFilters, limit: number, offset: number) {
  const values: unknown[] = [];
  const conditions: string[] = [];
  for (const [field, sql] of [
    ['method', 'p.payment_method ='],
    ['customerId', 'p.customer_id ='],
    ['invoiceId', 'p.invoice_id ='],
    ['from', 'p.paid_on >='],
    ['to', 'p.paid_on <='],
  ] as const) {
    const value = filters[field];
    if (value !== undefined) {
      values.push(value);
      conditions.push(`${sql} $${values.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    pool.query<PaymentRow>(
      `SELECT ${paymentCols} FROM payments p JOIN invoices i ON i.id=p.invoice_id
      JOIN customers c ON c.id=p.customer_id ${where} ORDER BY p.paid_on DESC,p.id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM payments p ${where}`, values),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].total) };
}

export async function paymentSummary(from: string | undefined, to: string | undefined) {
  const values: unknown[] = [];
  const conditions: string[] = ["status='Received'"];
  if (from) {
    values.push(from);
    conditions.push(`paid_on >= $${values.length}`);
  }
  if (to) {
    values.push(to);
    conditions.push(`paid_on <= $${values.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const [total, methods] = await Promise.all([
    pool.query<{ count: string; total: string }>(
      `SELECT count(*)::text AS count, COALESCE(sum(amount),0)::text AS total FROM payments ${where}`,
      values,
    ),
    pool.query<{ method: string; total: string }>(
      `SELECT payment_method AS method, sum(amount)::text AS total FROM payments ${where} GROUP BY payment_method ORDER BY payment_method`,
      values,
    ),
  ]);
  return { count: Number(total.rows[0].count), total: total.rows[0].total, by_method: methods.rows };
}

export async function writeAudit(client: PoolClient, entry: AuditEntry): Promise<void> {
  await writeAuditEntry(client, entry);
}
