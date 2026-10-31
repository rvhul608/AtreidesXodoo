import type { PoolClient } from 'pg';

export interface OutboxEmail {
  customerId: number | null;
  recipient: string;
  subject: string;
  body: string;
  expiresAt?: Date;
}

export async function writeOutboxEmail(client: PoolClient, email: OutboxEmail): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO outbox_emails (customer_id, recipient, subject, body, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email.customerId, email.recipient, email.subject, email.body, email.expiresAt ?? null],
  );
  return Number(result.rows[0].id);
}
