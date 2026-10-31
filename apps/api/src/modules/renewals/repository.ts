import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';
import { writeOutboxEmail } from '../../common/outbox.repository.js';

export type ChaseStage = 'pre_due' | 'due' | 'overdue_7';
export interface ChaseCounts { pre_due: number; due: number; overdue_7: number }

export interface RenewalQueueRow {
  id: string;
  subscription_number: string;
  customer_id: string;
  customer_name: string;
  plan_id: string;
  plan_name: string;
  period: string;
  expiry_date: string;
  days_left: number;
  allow_renew: boolean;
}

// Served by the partial index on subscriptions(expiry_date) WHERE status = 'Active'.
export async function listRenewalQueue(
  asOf: string,
  days: number,
  limit: number,
  offset: number,
): Promise<{ rows: RenewalQueueRow[]; total: number }> {
  const window = `s.status = 'Active' AND s.expiry_date BETWEEN $1::date AND $1::date + $2::int`;
  const [rows, count] = await Promise.all([
    pool.query<RenewalQueueRow>(
      `SELECT s.id, s.subscription_number, s.customer_id, c.legal_name AS customer_name,
         s.plan_id, p.name AS plan_name, p.period, s.expiry_date::text AS expiry_date,
         (s.expiry_date - $1::date) AS days_left, p.allow_renew
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
       WHERE ${window}
       ORDER BY s.expiry_date, s.id
       LIMIT $3 OFFSET $4`,
      [asOf, days, limit, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM subscriptions s WHERE ${window}`,
      [asOf, days],
    ),
  ]);
  return { rows: rows.rows, total: Number(count.rows[0].total) };
}

export async function runChase(asOf: string, actorId: number): Promise<ChaseCounts> {
  const stages: Array<{ stage: ChaseStage; predicate: string }> = [
    { stage: 'pre_due', predicate: 'i.due_date = $1::date + 3' },
    { stage: 'due', predicate: 'i.due_date = $1::date' },
    { stage: 'overdue_7', predicate: 'i.due_date = $1::date - 7' },
  ];
  const counts: ChaseCounts = { pre_due: 0, due: 0, overdue_7: 0 };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { stage, predicate } of stages) {
      const invoices = await client.query<{ id: string; customer_id: string; recipient: string }>(
        `SELECT i.id, i.customer_id, u.email AS recipient
         FROM invoices i
         JOIN LATERAL (
           SELECT email FROM users
           WHERE customer_id = i.customer_id AND role = 'customer' AND is_active = true
           ORDER BY id LIMIT 1
         ) u ON true
         WHERE i.status = 'Confirmed' AND ${predicate}
         ORDER BY i.id`, [asOf],
      );
      for (const invoice of invoices.rows) {
        const claimed = await client.query<{ id: string }>(
          `INSERT INTO renewal_chase_log (invoice_id, stage)
           VALUES ($1, $2) ON CONFLICT (invoice_id, stage) DO NOTHING RETURNING id`,
          [invoice.id, stage],
        );
        if (!claimed.rowCount) continue;
        const outboxId = await writeOutboxEmail(client, {
          customerId: Number(invoice.customer_id),
          recipient: invoice.recipient,
          subject: `Invoice payment ${stage.replace('_', ' ')}`,
          body: `A payment reminder for invoice ${invoice.id} is due (${stage}).`,
        });
        await client.query(
          'UPDATE renewal_chase_log SET outbox_email_id = $1 WHERE id = $2',
          [outboxId, claimed.rows[0].id],
        );
        counts[stage] += 1;
      }
    }
    await writeAuditEntry(client, {
      customerId: null, userId: actorId, entityType: 'renewal_chase', entityId: null,
      action: 'renewal_chase_run', changes: { asOf, ...counts },
    });
    await client.query('COMMIT');
    return counts;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
