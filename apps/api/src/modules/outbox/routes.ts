import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateQuery } from '../../common/validate.js';
import { getOutbox } from './service.js';

const router = Router();
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  recipient: z.string().trim().min(1).max(254).optional(),
});

router.use(requireAuth, requireRole('admin'));
router.get('/', validateQuery(querySchema), asyncHandler(async (_request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof querySchema>;
  const result = await getOutbox(query);
  response.json(result);
}));

export default router;
