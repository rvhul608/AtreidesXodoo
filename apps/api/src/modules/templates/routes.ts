import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateBody, validateParams, validateQuery } from '../../common/validate.js';
import * as service from './service.js';
const router = Router();
const id = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const schema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  planId: z.number().int().positive(),
  validityDays: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        variantId: z.number().int().positive().optional(),
        quantity: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/)
          .refine((v) => Number(v) > 0),
      }),
    )
    .min(1),
});
router.get(
  '/',
  validateQuery(page),
  asyncHandler(async (_req, res) => {
    const q = res.locals.validatedQuery as z.infer<typeof page>;
    res.json(await service.listTemplates(q.page, q.pageSize));
  }),
);
router.get(
  '/:id',
  validateParams(id),
  asyncHandler(async (_req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof id>;
    res.json({ data: await service.getTemplate(p.id) });
  }),
);
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(schema),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.createTemplate(req.body as z.infer<typeof schema>, req.auth!.id),
    });
  }),
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(id),
  validateBody(schema),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as z.infer<typeof id>;
    res.json({
      data: await service.updateTemplate(params.id, req.body as z.infer<typeof schema>, req.auth!.id),
    });
  }),
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(id),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as z.infer<typeof id>;
    res.json({ data: await service.deleteTemplate(params.id, req.auth!.id) });
  }),
);
export default router;
