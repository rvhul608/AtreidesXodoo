import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { isoDateSchema, validateBody, validateParams, validateQuery } from '../../common/validate.js';
import * as service from './service.js';
const router = Router();
const params = z.object({ id: z.coerce.number().int().positive() });
const paging = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  availableOn: isoDateSchema.optional(),
});
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((v) => Number(v) >= 0);
const create = z.object({
  planNumber: z.string().trim().min(1),
  name: z.string().trim().min(1),
  description: z.string().optional(),
  price: money,
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  minQuantity: z.number().int().positive(),
  availableFrom: isoDateSchema.optional(),
  availableUntil: isoDateSchema.optional(),
  autoClose: z.boolean(),
  allowEarlyClose: z.boolean(),
  allowPause: z.boolean(),
  allowRenew: z.boolean(),
});
router.get(
  '/',
  validateQuery(paging),
  asyncHandler(async (_req, res) => {
    const q = res.locals.validatedQuery as z.infer<typeof paging>;
    res.json(await service.listPlans(q.page, q.pageSize, q.availableOn));
  }),
);
router.get(
  '/:id',
  validateParams(params),
  asyncHandler(async (_req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof params>;
    res.json({ data: await service.getPlanById(p.id) });
  }),
);
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validateBody(create),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.createPlan(req.body as z.infer<typeof create>, req.auth!.id),
    });
  }),
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(params),
  validateBody(
    z
      .object({
        autoClose: z.boolean().optional(),
        allowEarlyClose: z.boolean().optional(),
        allowPause: z.boolean().optional(),
        allowRenew: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length === 1),
  ),
  asyncHandler(async (req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof params>;
    const body = req.body as Record<string, boolean>;
    const key = Object.keys(body)[0];
    const map = {
      autoClose: 'auto_close',
      allowEarlyClose: 'allow_early_close',
      allowPause: 'allow_pause',
      allowRenew: 'allow_renew',
    } as const;
    res.json({
      data: await service.patchPlan(p.id, map[key as keyof typeof map], body[key], req.auth!.id),
    });
  }),
);
export default router;
