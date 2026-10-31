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
}).strict().superRefine((value, context) => {
  if (value.topic === 'invoice_details' && value.invoiceId === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['invoiceId'], message: 'Invoice ID is required' });
  }
});

export type SupportRequest = z.infer<typeof requestSchema>;

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
    FROM invoices WHERE customer_id = $1 AND id = $2
  `, [customerId, input.invoiceId]);
  return {
    message: result.rows.length ? 'Here is your invoice breakdown.' : 'Invoice not found.',
    items: result.rows,
  };
}

export function createSupportRouter(pool: Pool = db): Router {
  const router = Router();
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
