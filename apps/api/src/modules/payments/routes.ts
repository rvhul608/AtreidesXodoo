import Decimal from 'decimal.js';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { isoDateSchema, validateBody, validateParams, validateQuery } from '../../common/validate.js';
import { getInvoicePayments, getPaymentSummary, getPayments, recordPayment } from './service.js';

const router = Router();

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const pageSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    method: z.enum(['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other']).optional(),
    customerId: z.coerce.number().int().positive().optional(),
    invoiceId: z.coerce.number().int().positive().optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, 'from must be on or before to');
const summarySchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .refine((query) => !query.from || !query.to || query.from <= query.to, 'from must be on or before to');
const bodySchema = z
  .object({
    method: z.enum(['cash', 'bank_transfer', 'card', 'upi', 'cheque', 'other']),
    amount: z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/)
      .refine((value) => new Decimal(value).greaterThan(0)),
    paidOn: isoDateSchema,
    note: z.string().max(500).optional(),
  })
  .refine((body) => body.paidOn <= new Date().toISOString().slice(0, 10), {
    path: ['paidOn'],
    message: 'paidOn cannot be in the future',
  });
const secured = [requireAuth, requireRole('admin', 'staff')];

router.get(
  '/payments/summary',
  ...secured,
  validateQuery(summarySchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals.validatedQuery as z.infer<typeof summarySchema>;
    res.json({ data: await getPaymentSummary(query.from, query.to) });
  }),
);

router.get(
  '/payments',
  ...secured,
  validateQuery(pageSchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals.validatedQuery as z.infer<typeof pageSchema>;
    const { page, pageSize, ...filters } = query;
    res.json(await getPayments(filters, page, pageSize));
  }),
);

router.get(
  '/invoices/:id/payments',
  ...secured,
  validateParams(idSchema),
  asyncHandler(async (_req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await getInvoicePayments(id) });
  }),
);

router.post(
  '/invoices/:id/payments',
  ...secured,
  validateParams(idSchema),
  validateBody(bodySchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    const body = req.body as z.infer<typeof bodySchema>;
    const data = await recordPayment(
      id,
      { method: body.method, amount: body.amount, paidOn: body.paidOn, note: body.note ?? null },
      { id: req.auth!.id },
    );
    res.status(201).json({ data });
  }),
);

export default router;
