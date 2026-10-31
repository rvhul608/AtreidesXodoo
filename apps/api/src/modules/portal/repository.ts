import { pool } from '../../common/db.js';

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  subscription_id: string;
  subscription_number: string;
  period_start: string;
  period_end: string;
  issued_date: string;
  due_date: string;
  status: string;
  subtotal: string;
  tax_amount: string;
  discount_total: string;
  total: string;
  amount_paid: string;
  is_overdue: boolean;
}

// Every query takes the caller's customer id; there is deliberately no unscoped variant here.
// Overdue is derived at read time (due date passed and not paid), never stored.
const invoiceSelect = `
  SELECT i.id, i.invoice_number, i.subscription_id, s.subscription_number,
    i.period_start::text AS period_start, i.period_end::text AS period_end,
    i.issued_date::text AS issued_date, i.due_date::text AS due_date, i.status,
    i.subtotal, i.tax_amount, i.discount_total, i.total,
    COALESCE(paid.amount, 0)::text AS amount_paid,
    (i.due_date < $2::date AND i.status NOT IN ('Paid', 'Cancelled')) AS is_overdue
  FROM invoices i
  JOIN subscriptions s ON s.id = i.subscription_id
  LEFT JOIN LATERAL (
    SELECT sum(p.amount) AS amount FROM payments p
    WHERE p.invoice_id = i.id AND p.status = 'Received'
  ) paid ON true`;

export async function listCustomerInvoices(
  customerId: number,
  today: string,
  limit: number,
  offset: number,
): Promise<{ rows: InvoiceRow[]; total: number }> {
  const [rows, count] = await Promise.all([
    pool.query<InvoiceRow>(
      `${invoiceSelect}
       WHERE i.customer_id = $1 AND i.status <> 'Draft'
       ORDER BY i.id DESC
       LIMIT $3 OFFSET $4`,
      [customerId, today, limit, offset],
    ),
    pool.query<{ total: string }>(
      "SELECT count(*)::text AS total FROM invoices WHERE customer_id = $1 AND status <> 'Draft'",
      [customerId],
    ),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].total) };
}

export async function findCustomerInvoice(
  customerId: number,
  invoiceId: number,
  today: string,
): Promise<InvoiceRow | null> {
  const result = await pool.query<InvoiceRow>(
    `${invoiceSelect}
     WHERE i.customer_id = $1 AND i.id = $3 AND i.status <> 'Draft'`,
    [customerId, today, invoiceId],
  );
  return result.rows[0] ?? null;
}
