import type { PoolClient } from 'pg';

export interface OutboxEmail {
  customerId: number | null;
  recipient: string;
  subject: string;
  body: string;
}

export async function writeOutboxEmail(client: PoolClient, email: OutboxEmail): Promise<void> {
  await client.query(
    `INSERT INTO outbox_emails (customer_id, recipient, subject, body)
     VALUES ($1, $2, $3, $4)`,
    [email.customerId, email.recipient, email.subject, email.body],
  );
}
