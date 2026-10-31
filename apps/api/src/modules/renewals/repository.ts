import { writeAuditEntry } from '../../common/audit.repository.js';
import { pool } from '../../common/db.js';
import { writeOutboxEmail } from '../../common/outbox.repository.js';

export type ChaseStage = 'pre_due' | 'due' | 'overdue_7';
export interface ChaseCounts { pre_due: number; due: number; overdue_7: number }

export async function runChase(asOf: string, actorId: number): Promise<ChaseCounts> {
  const stages: Array<{ stage: ChaseStage; predicate: string; offset: number }> = [
    { stage: 'pre_due', predicate: 'i.due_date = $1::date + 3', offset: 0 },
    { stage: 'due', predicate: 'i.due_date = $1::date', offset: 0 },
    { stage: 'overdue_7', predicate: 'i.due_date = $1::date - 7', offset: 0 },
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
           SELECT email FROM users WHERE customer_id = i.customer_id AND role = 'customer' AND is_active = true
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
        await client.query('UPDATE renewal_chase_log SET outbox_email_id = $1 WHERE id = $2', [outboxId, claimed.rows[0].id]);
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
