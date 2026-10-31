import { pool } from '../../common/db.js';

export interface OutboxRecord {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: 'pending' | 'sent' | 'failed';
  resend_id: string | null;
  send_attempts: number;
  next_attempt_at: Date;
  last_error: string | null;
  created_at: Date;
  sent_at: Date | null;
  delivery_status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  provider_id: string | null;
}

export async function listOutbox(limit: number, offset: number, recipient?: string) {
  const where = recipient ? 'WHERE recipient = $1' : '';
  const params = recipient ? [recipient, limit, offset] : [limit, offset];
  const [rows, count] = await Promise.all([
    pool.query<OutboxRecord>(
      `SELECT id, recipient, subject, body, created_at, delivery_status, attempts,
         provider_id, sent_at, last_error, next_attempt_at,
         CASE WHEN delivery_status = 'sent' THEN 'sent'
           WHEN delivery_status IN ('failed', 'skipped') THEN 'failed'
           ELSE 'pending' END AS status,
         provider_id AS resend_id, attempts AS send_attempts
       FROM outbox_emails ${where}
       ORDER BY created_at DESC, id DESC LIMIT $${recipient ? 2 : 1} OFFSET $${recipient ? 3 : 2}`,
      params,
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM outbox_emails ${where}`,
      recipient ? [recipient] : []),
  ]);
  return { rows: rows.rows.map((row) => ({ ...row, id: Number(row.id) })), total: Number(count.rows[0].total) };
}
