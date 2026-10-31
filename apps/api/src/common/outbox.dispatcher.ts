import { config } from './config.js';
import { pool } from './db.js';
import { fromResendError, getResendClient } from './resend.js';

// Batch, retry, and backoff behavior for the Resend dispatcher.
const MAX_BATCH = 10;
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 5 * 60_000;

export interface DispatchResult {
  sent: number;
  failed: number;
  /** True when RESEND_API_KEY is not configured and nothing was attempted. */
  skipped: boolean;
}

interface OutboxBatchRow {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  send_attempts: number;
}

/**
 * Sends every pending outbox email through the Resend API inside a single
 * transaction (FOR UPDATE SKIP LOCKED keeps concurrent callers apart).
 * Crash-safe: uncommitted status marks roll back and the batch is retried.
 */
export async function dispatchPendingOutbox(): Promise<DispatchResult> {
  const client = getResendClient();
  if (!client) {
    return { sent: 0, failed: 0, skipped: true };
  }

  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const batch = await connection.query<OutboxBatchRow>(
      `SELECT id, recipient, subject, body, send_attempts FROM outbox_emails
       WHERE status = 'pending' AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`,
      [MAX_BATCH],
    );

    let sent = 0;
    let failed = 0;
    for (const row of batch.rows) {
      try {
        const result = await client.sendEmail({
          from: config.MAIL_FROM,
          to: row.recipient,
          subject: row.subject,
          text: row.body,
        });
        await connection.query(
          `UPDATE outbox_emails
           SET status = 'sent', resend_id = $2, sent_at = CURRENT_TIMESTAMP,
               last_error = NULL, next_attempt_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [row.id, result.id],
        );
        sent += 1;
      } catch (error) {
        const attempts = row.send_attempts + 1;
        // Retries stay pending with a backoff window; exhausted attempts park the row.
        const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await connection.query(
          `UPDATE outbox_emails
           SET status = $2, send_attempts = $3, last_error = $4,
               next_attempt_at = CURRENT_TIMESTAMP + ($5::bigint * interval '1 millisecond')
           WHERE id = $1`,
          [row.id, status, attempts, fromResendError(error), RETRY_BACKOFF_MS],
        );
        failed += 1;
      }
    }
    await connection.query('COMMIT');
    return { sent, failed, skipped: false };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

let running = false;

/** Background loop that drains the outbox on a fixed interval. */
export function startOutboxDispatcher(): NodeJS.Timeout {
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    dispatchPendingOutbox()
      .then((result) => {
        if (!result.skipped && (result.sent > 0 || result.failed > 0)) {
          console.log(`Outbox dispatch: ${result.sent} sent, ${result.failed} failed`);
        }
      })
      .catch((error: unknown) => {
        console.error('Outbox dispatch failed', error);
      })
      .finally(() => {
        running = false;
      });
  }, config.OUTBOX_DISPATCH_INTERVAL_MS);
  timer.unref();
  return timer;
}

export function stopOutboxDispatcher(timer: NodeJS.Timeout | null): void {
  if (timer) clearInterval(timer);
}
