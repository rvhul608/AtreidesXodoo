import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateBody, validateParams, validateQuery } from '../../common/validate.js';
import * as service from './service.js';

const router = Router();
router.use(requireAuth);
const idSchema = z.object({ id: z.coerce.number().int().positive() });
const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((value) => Number(value) >= 0);
const productSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  salesPrice: money,
  costPrice: money,
  notes: z.string().optional(),
});
const productPatchSchema = productSchema.partial();
const variantSchema = z.object({
  name: z.string().trim().min(1),
  value: z.string().trim().min(1),
  extraPrice: money,
});
const variantPatchSchema = variantSchema.partial();
const taxSchema = z.object({
  name: z.string().trim().min(1),
  jurisdiction: z.string().trim().min(1),
  rate: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((v) => Number(v) <= 1),
});
const taxPatchSchema = taxSchema.partial();
router.get(
  '/products',
  validateQuery(pagingSchema),
  asyncHandler(async (_req, res) => {
    const q = res.locals.validatedQuery as z.infer<typeof pagingSchema>;
    const result = await service.listProducts(q.page, q.pageSize);
    res.json(result);
  }),
);
router.get(
  '/products/:id',
  validateParams(idSchema),
  asyncHandler(async (_req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await service.getProduct(p.id) });
  }),
);
router.post(
  '/products',
  requireAuth,
  requireRole('admin'),
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.createProduct(req.body as z.infer<typeof productSchema>, req.auth!.id),
    });
  }),
);
router.patch(
  '/products/:id',
  requireRole('admin'),
  validateParams(idSchema),
  validateBody(productPatchSchema),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({
      data: await service.updateProduct(
        params.id,
        req.body as z.infer<typeof productPatchSchema>,
        req.auth!.id,
      ),
    });
  }),
);
router.delete(
  '/products/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await service.removeProduct(p.id, req.auth!.id) });
  }),
);
router.post(
  '/products/:id/variants',
  requireAuth,
  requireRole('admin'),
  validateParams(idSchema),
  validateBody(variantSchema),
  asyncHandler(async (req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.status(201).json({
      data: await service.createVariant(p.id, req.body as z.infer<typeof variantSchema>, req.auth!.id),
    });
  }),
);
router.patch(
  '/products/:id/variants/:variantId',
  requireRole('admin'),
  validateParams(
    z.object({
      id: z.coerce.number().int().positive(),
      variantId: z.coerce.number().int().positive(),
    }),
  ),
  validateBody(variantPatchSchema),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as {
      id: number;
      variantId: number;
    };
    res.json({
      data: await service.updateProductVariant(
        params.id,
        params.variantId,
        req.body as z.infer<typeof variantPatchSchema>,
        req.auth!.id,
      ),
    });
  }),
);
router.delete(
  '/variants/:id',
  requireAuth,
  requireRole('admin'),
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await service.deleteVariant(p.id, req.auth!.id) });
  }),
);
router.delete(
  '/products/:id/variants/:variantId',
  requireAuth,
  requireRole('admin'),
  validateParams(
    z.object({
      id: z.coerce.number().int().positive(),
      variantId: z.coerce.number().int().positive(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as {
      id: number;
      variantId: number;
    };
    res.json({
      data: await service.deleteProductVariant(params.id, params.variantId, req.auth!.id),
    });
  }),
);
router.put(
  '/products/:id/taxes',
  requireAuth,
  requireRole('admin'),
  validateParams(idSchema),
  validateBody(z.object({ taxIds: z.array(z.number().int().positive()) })),
  asyncHandler(async (req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({
      data: await service.replaceTaxes(p.id, (req.body as { taxIds: number[] }).taxIds, req.auth!.id),
    });
  }),
);
router.get(
  '/products/:id/price',
  validateParams(idSchema),
  validateQuery(z.object({ variantId: z.coerce.number().int().positive().optional() })),
  asyncHandler(async (_req, res) => {
    const p = res.locals.validatedParams as z.infer<typeof idSchema>;
    const q = res.locals.validatedQuery as { variantId?: number };
    res.json({
      data: await service.resolveUnitPrice(p.id, q.variantId ?? null),
    });
  }),
);
router.post(
  '/taxes',
  requireAuth,
  requireRole('admin'),
  validateBody(taxSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      data: await service.createTax(req.body as z.infer<typeof taxSchema>, req.auth!.id),
    });
  }),
);
router.get(
  '/taxes',
  validateQuery(pagingSchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals.validatedQuery as z.infer<typeof pagingSchema>;
    res.json(await service.listTaxes(query.page, query.pageSize));
  }),
);
router.patch(
  '/taxes/:id',
  requireRole('admin'),
  validateParams(idSchema),
  validateBody(taxPatchSchema),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({
      data: await service.updateTax(params.id, req.body as z.infer<typeof taxPatchSchema>, req.auth!.id),
    });
  }),
);
router.delete(
  '/taxes/:id',
  requireRole('admin'),
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const params = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await service.deleteTax(params.id, req.auth!.id) });
  }),
);
export default router;
