import { pool } from '../../common/db.js';

export interface OutboxRecord {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  created_at: Date;
}

export async function listOutbox(limit: number, offset: number, recipient?: string) {
  const where = recipient ? 'WHERE recipient = $1' : '';
  const params = recipient ? [recipient, limit, offset] : [limit, offset];
  const [rows, count] = await Promise.all([
    pool.query<OutboxRecord>(
      `SELECT id, recipient, subject, body, created_at FROM outbox_emails ${where}
       ORDER BY created_at DESC, id DESC LIMIT $${recipient ? 2 : 1} OFFSET $${recipient ? 3 : 2}`,
      params,
    ),
    pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM outbox_emails ${where}`,
      recipient ? [recipient] : []),
  ]);
  return { rows: rows.rows.map((row) => ({ ...row, id: Number(row.id) })), total: Number(count.rows[0].total) };
}
