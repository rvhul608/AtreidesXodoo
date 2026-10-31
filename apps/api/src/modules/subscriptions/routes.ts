import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateBody, validateParams, validateQuery } from '../../common/validate.js';
import { todayIso } from './lifecycle.js';
import { dateSchema, lineSchema, pageQuerySchema } from './schemas.js';
import {
  closeExpiredSubscriptions,
  createFromTemplate,
  createSubscription,
  deleteSubscription,
  getSubscription,
  listSubscriptions,
  transitionSubscription,
  updateSubscription,
} from './service.js';

const router = Router();
const statusSchema = z.enum(['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed']);
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const listSchema = pageQuerySchema.extend({
  status: statusSchema.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(50).optional(),
});
const paymentTermsSchema = z.string().trim().min(1).max(200);
const createSchema = z.object({
  customerId: z.number().int().positive(),
  planId: z.number().int().positive(),
  startDate: dateSchema,
  expiryDate: dateSchema.nullable().optional(),
  paymentTerms: paymentTermsSchema.optional(),
  lines: z.array(lineSchema).min(1).max(100),
});
const fromTemplateSchema = z.object({
  templateId: z.number().int().positive(),
  customerId: z.number().int().positive(),
  startDate: dateSchema,
  expiryDate: dateSchema.nullable().optional(),
  paymentTerms: paymentTermsSchema.optional(),
});
const patchSchema = z.object({
  planId: z.number().int().positive().optional(),
  startDate: dateSchema.optional(),
  expiryDate: dateSchema.nullable().optional(),
  paymentTerms: paymentTermsSchema.optional(),
  lines: z.array(lineSchema).min(1).max(100).optional(),
}).refine((patch) => Object.keys(patch).length > 0, 'Provide at least one field to change');
const transitionSchema = z.object({
  to: statusSchema,
  reason: z.string().trim().max(500).optional(),
});
const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() }).default({});
const asOfSchema = z.object({ asOf: dateSchema.optional() });

router.use(requireAuth, requireRole('admin', 'staff'));

router.get('/', validateQuery(listSchema), asyncHandler(async (_request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof listSchema>;
  const filters = { status: query.status, customerId: query.customerId, q: query.q };
  response.json(await listSubscriptions(filters, query.page, query.pageSize));
}));

router.post('/', validateBody(createSchema), asyncHandler(async (request, response) => {
  const body = request.body as z.infer<typeof createSchema>;
  const subscription = await createSubscription(body, { id: request.auth!.id });
  response.status(201).json({ data: subscription });
}));

router.post('/from-template', validateBody(fromTemplateSchema), asyncHandler(async (request, response) => {
  const body = request.body as z.infer<typeof fromTemplateSchema>;
  const subscription = await createFromTemplate(body, { id: request.auth!.id });
  response.status(201).json({ data: subscription });
}));

router.post('/auto-close/run', validateQuery(asOfSchema), asyncHandler(async (request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof asOfSchema>;
  const result = await closeExpiredSubscriptions(query.asOf ?? todayIso(), { id: request.auth!.id });
  response.json({ data: result });
}));

router.get('/:id', validateParams(idSchema), asyncHandler(async (_request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  response.json({ data: await getSubscription(params.id) });
}));

router.patch('/:id', validateParams(idSchema), validateBody(patchSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  const patch = request.body as z.infer<typeof patchSchema>;
  response.json({ data: await updateSubscription(params.id, patch, { id: request.auth!.id }) });
}));

router.delete('/:id', validateParams(idSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  await deleteSubscription(params.id, { id: request.auth!.id });
  response.status(204).end();
}));

router.post(
  '/:id/transition',
  validateParams(idSchema),
  validateBody(transitionSchema),
  asyncHandler(async (request, response) => {
    const params = response.locals.validatedParams as z.infer<typeof idSchema>;
    const body = request.body as z.infer<typeof transitionSchema>;
    const result = await transitionSubscription(params.id, body.to, { id: request.auth!.id }, {
      reason: body.reason,
    });
    response.json({ data: result });
  }),
);

router.post('/:id/renew', validateParams(idSchema), validateBody(reasonSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  const body = request.body as z.infer<typeof reasonSchema>;
  const result = await transitionSubscription(params.id, 'renew', { id: request.auth!.id }, { reason: body.reason });
  response.json({ data: result });
}));

export default router;
