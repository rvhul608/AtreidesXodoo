import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateParams, validateQuery } from '../../common/validate.js';
import { todayIso } from '../subscriptions/lifecycle.js';
import { dateSchema } from '../subscriptions/schemas.js';
import { previewBilling, runBilling } from './service.js';

const router = Router();

const querySchema = z.object({ asOf: dateSchema.optional() });

const idSchema = z.object({ subscriptionId: z.coerce.number().int().positive() });

router.use(requireAuth, requireRole('admin', 'staff'));

router.post(
  '/run',
  validateQuery(querySchema),
  asyncHandler(async (request, response) => {
    const query = response.locals.validatedQuery as z.infer<typeof querySchema>;
    const result = await runBilling(query.asOf ?? todayIso(), { id: request.auth!.id });
    response.json({ data: result });
  }),
);

router.get(
  '/preview/:subscriptionId',
  validateParams(idSchema),
  validateQuery(querySchema),
  asyncHandler(async (_request, response) => {
    const params = response.locals.validatedParams as z.infer<typeof idSchema>;
    const query = response.locals.validatedQuery as z.infer<typeof querySchema>;
    response.json({ data: await previewBilling(params.subscriptionId, query.asOf ?? todayIso()) });
  }),
);

export default router;
