import type { Pool } from 'pg';

export async function insertInvoice(
  pool: Pool,
  input: { customerId: number; subscriptionId: number; total?: string; status?: string; dueDate?: string },
): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO invoices (customer_id,subscription_id,invoice_number,period_start,period_end,
      subtotal,tax_amount,total,issued_date,due_date,status)
     VALUES ($1,$2,'FIX-' || nextval('invoice_number_seq'),'2026-01-01','2026-01-31',
      $3,0,$3,'2026-01-01',$4,$5) RETURNING id`,
    [
      input.customerId,
      input.subscriptionId,
      input.total ?? '100.00',
      input.dueDate ?? '2026-01-31',
      input.status ?? 'Confirmed',
    ],
  );
  const id = Number(result.rows[0].id);
  await pool.query(
    `INSERT INTO invoice_line_items (invoice_id,description,quantity,unit_price,line_total)
     VALUES ($1,'Test service',1,$2,$2)`,
    [id, input.total ?? '100.00'],
  );
  return id;
}
