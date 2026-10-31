import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { meetsPasswordRules } from '../../common/password-policy.js';
import { validateBody, validateParams, validateQuery } from '../../common/validate.js';
import { createStaff, deactivate, getUsers } from './service.js';

const router = Router();
const staffSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().refine(meetsPasswordRules),
  name: z.string().trim().min(1).max(120).optional(),
});
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

router.use(requireAuth, requireRole('admin'));

router.post('/', validateBody(staffSchema), asyncHandler(async (request, response) => {
  const user = await createStaff({
    ...(request.body as z.infer<typeof staffSchema>),
    actorId: request.auth!.id,
  });
  response.status(201).json({ data: user });
}));

router.get('/', validateQuery(listSchema), asyncHandler(async (_request, response) => {
  const query = response.locals.validatedQuery as z.infer<typeof listSchema>;
  const result = await getUsers(query.page, query.pageSize);
  response.json({ data: result.data, meta: result.meta });
}));

router.post('/:id/deactivate', validateParams(idSchema), asyncHandler(async (request, response) => {
  const params = response.locals.validatedParams as z.infer<typeof idSchema>;
  const user = await deactivate(request.auth!.id, params.id);
  response.json({ data: user });
}));

export default router;
