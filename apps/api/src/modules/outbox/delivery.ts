import type { Pool } from 'pg';
import { pool as defaultPool } from '../../common/db.js';

export interface MailConfig { apiKey: string; from: string }
interface PendingEmail {
  id: string; delivery_key: string; claim_token: string; attempts: number;
  delivery_payload: { from: string; to: string[]; subject: string; text: string };
}

export function mailConfig(environment = process.env): MailConfig | null {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.MAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

// Claim in a short transaction; never hold a database connection while waiting on Resend.
async function claimEmail(pool: Pool, from: string): Promise<PendingEmail | null> {
  await pool.query(`UPDATE outbox_emails SET delivery_status = 'failed',
    last_error = 'Retry window expired; review provider logs before resending'
    WHERE delivery_status IN ('pending', 'sending') AND first_attempt_at < NOW() - INTERVAL '23 hours'`);
  await pool.query(`UPDATE outbox_emails SET delivery_status = 'skipped', last_error = 'Message expired'
    WHERE delivery_status IN ('pending', 'sending') AND expires_at <= NOW()
      AND (locked_until IS NULL OR locked_until <= NOW())`);
  const result = await pool.query<PendingEmail>(`
    WITH candidate AS (
      SELECT id FROM outbox_emails
      WHERE (delivery_status = 'pending' AND next_attempt_at <= NOW())
         OR (delivery_status = 'sending' AND locked_until <= NOW())
      ORDER BY next_attempt_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    )
    UPDATE outbox_emails e SET delivery_status = 'sending', attempts = attempts + 1,
      first_attempt_at = COALESCE(first_attempt_at, NOW()),
      locked_until = NOW() + INTERVAL '2 minutes', claim_token = gen_random_uuid(),
      delivery_payload = COALESCE(delivery_payload, jsonb_build_object(
        'from', $1::text, 'to', jsonb_build_array(recipient), 'subject', subject, 'text', body))
    FROM candidate c WHERE e.id = c.id
    RETURNING e.id::text, e.delivery_key, e.claim_token, e.attempts, e.delivery_payload`, [from]);
  return result.rows[0] ?? null;
}

/** Returns after one delivery attempt. A stable key and payload make crash retries idempotent. */
export async function deliverNextEmail(config: MailConfig, pool: Pool = defaultPool, send = fetch): Promise<boolean> {
  const email = await claimEmail(pool, config.from);
  if (!email) return false;
  const recipient = email.delivery_payload.to[0];
  if (/@[^@]+\.(local|test|invalid|example)$/i.test(recipient)) {
    await pool.query(`UPDATE outbox_emails SET delivery_status = 'skipped',
      last_error = 'Demo or reserved recipient domain', locked_until = NULL
      WHERE id = $1 AND claim_token = $2`, [email.id, email.claim_token]);
    return true;
  }
  let retryable = true;
  let retryAfter = 0;
  let errorMessage = 'Resend request failed';
  try {
    const response = await send('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `brightloop-outbox/${email.delivery_key}` },
      body: JSON.stringify(email.delivery_payload), signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const payload = await response.json() as { id?: string };
      if (!payload.id) throw new Error('Resend returned no message ID');
      await pool.query(`UPDATE outbox_emails SET delivery_status = 'sent', provider_id = $3,
        sent_at = NOW(), last_error = NULL, locked_until = NULL
        WHERE id = $1 AND claim_token = $2`, [email.id, email.claim_token, payload.id]);
      return true;
    }
    // Store status only: provider responses can contain addresses or reset-link contents.
    errorMessage = `Resend returned HTTP ${response.status}`;
    retryable = response.status === 429 || response.status >= 500 || response.status === 409;
    const header = response.headers.get('retry-after');
    retryAfter = header ? Math.max(Number(header) || (Date.parse(header) - Date.now()) / 1000, 0) : 0;
  } catch {
    // Includes timeouts and an uncertain successful send: retry the exact same idempotency key.
    errorMessage = 'Resend request timed out or delivery result could not be recorded';
  }
  const retry = retryable && email.attempts < 8;
  const delay = Math.min(3600, Math.max(retryAfter, 2 ** email.attempts * 5));
  await pool.query(`UPDATE outbox_emails SET delivery_status = $3, last_error = $4,
    locked_until = NULL, next_attempt_at = NOW() + $5 * INTERVAL '1 second'
    WHERE id = $1 AND claim_token = $2`,
  [email.id, email.claim_token, retry ? 'pending' : 'failed', errorMessage, delay]);
  return true;
}

export function startMailWorker(pool: Pool = defaultPool): () => Promise<void> {
  const config = mailConfig();
  if (!config) {
    console.log('Email delivery disabled: configure RESEND_API_KEY and MAIL_FROM to enable Resend');
    return async () => {};
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> = Promise.resolve();
  const tick = () => {
    active = (async () => {
      let busy = false;
      try { busy = await deliverNextEmail(config, pool); }
      catch { console.error('Email worker database error; retrying'); }
      if (!stopped) { timer = setTimeout(tick, busy ? 600 : 1000); timer.unref(); }
    })();
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await active; };
}
