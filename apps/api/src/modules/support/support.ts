import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';

import { db } from '../../common/db.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { AppError } from '../../common/errors.js';
import { parseOrThrow } from '../../common/validation.js';

const requestSchema = z.object({
  topic: z.enum(['subscriptions', 'unpaid_invoices', 'invoice_details']),
  invoiceId: z.number().int().positive().safe().optional(),
  invoiceNumber: z.string().regex(/^INV-\d+$/i).max(40).optional(),
}).strict().superRefine((value, context) => {
  if (value.topic === 'invoice_details' && value.invoiceId === undefined && !value.invoiceNumber) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['invoiceId'], message: 'Invoice ID is required' });
  }
});

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  account: z.object({
    topic: z.enum(['subscriptions', 'unpaid_invoices', 'invoice_details']),
    invoiceId: z.number().int().positive().safe().optional(),
    invoiceNumber: z.string().regex(/^INV-\d+$/i).max(40).optional(),
  }).strict().optional(),
}).strict();

export type SupportRequest = z.infer<typeof requestSchema>;

function inferredAccount(message: string): SupportRequest | undefined {
  const reference = message.match(/\bINV-\d+\b/i);
  if (reference) return { topic: 'invoice_details', invoiceNumber: reference[0].toUpperCase() };
  const invoice = message.match(/\binvoice\s*#?\s*(\d+)\b/i);
  if (invoice && Number.isSafeInteger(Number(invoice[1])) && Number(invoice[1]) > 0) {
    return { topic: 'invoice_details', invoiceId: Number(invoice[1]) };
  }
  if (/\b(invoice|invoices|unpaid|outstanding|owe|overdue)\b/i.test(message)) return { topic: 'unpaid_invoices' };
  if (/\b(subscription|subscriptions|renew|pause|resume)\b|next bill/i.test(message)) return { topic: 'subscriptions' };
  return undefined;
}

function searchTerms(message: string): string {
  const stopWords = new Set('a an the i me my we our you your is are am do does can could how what when where why to for of on in about please tell show need want help'.split(' '));
  return (message.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => !stopWords.has(word)).slice(0, 16).join(' OR ');
}

/** Only server-chosen, parameterized queries are available to the assistant. */
export async function answerSupportRequest(customerId: number, input: SupportRequest, pool: Pool = db) {
  if (input.topic === 'subscriptions') {
    const result = await pool.query(`
      SELECT id::text, subscription_number, status, next_billing_date::text
      FROM subscriptions WHERE customer_id = $1
      ORDER BY next_billing_date ASC NULLS LAST, id ASC LIMIT 20
    `, [customerId]);
    return { message: result.rows.length ? 'Here are your subscriptions.' : 'No subscriptions found.', items: result.rows };
  }

  if (input.topic === 'unpaid_invoices') {
    const result = await pool.query(`
      SELECT i.id::text, i.invoice_number, i.due_date::text, i.total::text,
        GREATEST(i.total - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Received'), 0), 0)::text AS outstanding
      FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id AND p.customer_id = i.customer_id
      WHERE i.customer_id = $1 AND i.status = 'Confirmed'
      GROUP BY i.id
      HAVING i.total > COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'Received'), 0)
      ORDER BY i.due_date, i.id LIMIT 20
    `, [customerId]);
    return { message: result.rows.length ? 'Here are your unpaid invoices.' : 'No unpaid invoices found.', items: result.rows };
  }

  const result = await pool.query(`
    SELECT id::text, invoice_number, status, due_date::text, subtotal::text,
      tax_amount::text, discount_total::text, total::text
    FROM invoices WHERE customer_id = $1 AND (id = $2 OR invoice_number = $3) AND status <> 'Draft'
  `, [customerId, input.invoiceId ?? null, input.invoiceNumber ?? null]);
  return {
    message: result.rows.length ? 'Here is your invoice breakdown.' : 'Invoice not found.',
    items: result.rows,
  };
}

export function createSupportRouter(pool: Pool = db): Router {
  const router = Router();
  router.post('/chat', requireAuth, async (request, response, next) => {
    try {
      const input = parseOrThrow(chatSchema, request.body);
      const customerId = request.auth?.customerId;
      const isCustomer = request.auth!.role === 'customer';
      if (isCustomer && customerId == null) throw new AppError(403, 'FORBIDDEN', 'Customer account is required');
      if (!isCustomer && input.account) throw new AppError(403, 'FORBIDDEN', 'Account lookups require a customer session');
      const knowledge = await pool.query<{ id: string; title: string; body: string }>(`
        SELECT id::text, title, left(body, 2500) AS body
        FROM support_knowledge
        WHERE published AND to_tsvector('english', title || ' ' || body) @@ websearch_to_tsquery('english', $1)
        ORDER BY ts_rank(to_tsvector('english', title || ' ' || body), websearch_to_tsquery('english', $1)) DESC, id
        LIMIT 4
      `, [searchTerms(input.message)]);
      const topic = input.account ? parseOrThrow(requestSchema, input.account) : inferredAccount(input.message);
      const account = isCustomer && topic
        ? await answerSupportRequest(customerId!, topic, pool)
        : undefined;
      if (!knowledge.rows.length && !account) {
        response.json({ data: { answer: 'I could not find relevant information. Please contact support.', sources: [] } });
        return;
      }
      // Return published text verbatim. No model setup, invented account facts, or external disclosure.
      const answer = [account?.message, ...knowledge.rows.slice(0, 2).map((row) => `${row.title}\n${row.body}`)]
        .filter(Boolean).join('\n\n');
      response.json({ data: { answer, records: account?.items ?? [],
        sources: knowledge.rows.slice(0, 2).map(({ id, title }) => ({ id, title })) } });
    } catch (error) { next(error); }
  });
  router.post('/message', requireAuth, requireRole('customer'), async (request, response, next) => {
    try {
      const input = parseOrThrow(requestSchema, request.body);
      const customerId = request.auth?.customerId;
      if (customerId == null) throw new AppError(403, 'FORBIDDEN', 'Customer account is required');
      const answer = await answerSupportRequest(customerId, input, pool);
      response.json({ data: answer });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
