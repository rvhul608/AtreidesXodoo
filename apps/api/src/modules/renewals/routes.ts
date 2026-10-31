import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateQuery } from '../../common/validate.js';
import { runChase } from './service.js';

const router = Router();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Must be a real calendar date');
const querySchema = z.object({ asOf: dateSchema.optional() });

router.use(requireAuth, requireRole('admin', 'staff'));
router.post('/chase/run', validateQuery(querySchema), asyncHandler(async (_request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof querySchema>;
  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const counts = await runChase(asOf, response.req.auth!.id);
  response.json({ data: { asOf, counts } });
}));

export default router;
