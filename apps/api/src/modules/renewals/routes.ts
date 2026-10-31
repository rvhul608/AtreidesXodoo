import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateParams, validateQuery } from '../../common/validate.js';
import { todayIso } from '../subscriptions/lifecycle.js';
import { dateSchema, pageQuerySchema } from '../subscriptions/schemas.js';
import { getRenewalQueue, renewSubscription, runChase } from './service.js';

const router = Router();
const chaseSchema = z.object({ asOf: dateSchema.optional() });
const queueSchema = pageQuerySchema.extend({
  days: z.coerce.number().int().min(0).max(365).default(30),
  asOf: dateSchema.optional(),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.use(requireAuth, requireRole('admin', 'staff'));

router.post('/chase/run', validateQuery(chaseSchema), asyncHandler(async (request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof chaseSchema>;
  const asOf = query.asOf ?? todayIso();
  const counts = await runChase(asOf, request.auth!.id);
  response.json({ data: { asOf, counts } });
}));

router.get('/queue', validateQuery(queueSchema), asyncHandler(async (_request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof queueSchema>;
  response.json(await getRenewalQueue({ ...query, asOf: query.asOf ?? todayIso() }));
}));

router.post('/:id/renew', validateParams(idSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  response.json({ data: await renewSubscription(params.id, request.auth!.id) });
}));

export default router;
