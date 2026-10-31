import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateParams, validateQuery } from '../../common/validate.js';
import { pageQuerySchema } from '../subscriptions/schemas.js';
import {
  actOnMySubscription,
  getMyInvoice,
  getMySubscription,
  listMyInvoices,
  listMySubscriptions,
} from './service.js';

const router = Router();
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const actionSchema = idSchema.extend({ action: z.enum(['pause', 'resume', 'renew', 'close']) });

router.use(requireAuth, requireRole('customer'));

router.get('/subscriptions', validateQuery(pageQuerySchema), asyncHandler(async (request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof pageQuerySchema>;
  response.json(await listMySubscriptions(request.auth!, query.page, query.pageSize));
}));

router.get('/subscriptions/:id', validateParams(idSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  response.json({ data: await getMySubscription(request.auth!, params.id) });
}));

router.post('/subscriptions/:id/:action', validateParams(actionSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof actionSchema>;
  response.json({ data: await actOnMySubscription(request.auth!, params.id, params.action) });
}));

router.get('/invoices', validateQuery(pageQuerySchema), asyncHandler(async (request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof pageQuerySchema>;
  response.json(await listMyInvoices(request.auth!, query.page, query.pageSize));
}));

router.get('/invoices/:id', validateParams(idSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  response.json({ data: await getMyInvoice(request.auth!, params.id) });
}));

export default router;
