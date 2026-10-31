import Decimal from 'decimal.js';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { isoDateSchema, validateBody, validateParams, validateQuery } from '../../common/validate.js';
import {
  createDiscount,
  getDiscount,
  listDiscounts,
  patchDiscount,
  removeDiscount,
  setDiscountActive,
} from './service.js';

const router = Router();

const idSchema = z.object({ id: z.coerce.number().int().positive() });

const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['active', 'expired', 'exhausted', 'scheduled', 'inactive']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

const decimal = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

const fields = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable(),
  kind: z.enum(['percentage', 'fixed']),
  value: decimal,
  appliesTo: z.enum(['subscription', 'products']),
  productIds: z.array(z.number().int().positive()).max(100),
  minPurchase: decimal,
  minQuantity: decimal,
  startsOn: isoDateSchema.nullable(),
  endsOn: isoDateSchema.nullable(),
  usageLimit: z.number().int().positive().nullable(),
  isActive: z.boolean(),
};

const createSchema = z
  .object({
    name: fields.name,
    description: fields.description.optional(),
    kind: fields.kind,
    value: fields.value,
    appliesTo: fields.appliesTo,
    productIds: fields.productIds.optional(),
    minPurchase: fields.minPurchase.optional(),
    minQuantity: fields.minQuantity.optional(),
    startsOn: fields.startsOn.optional(),
    endsOn: fields.endsOn.optional(),
    usageLimit: fields.usageLimit.optional(),
    isActive: fields.isActive.optional(),
  })
  .superRefine((value, context) => validate(value, context));
const patchSchema = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    kind: fields.kind.optional(),
    value: fields.value.optional(),
    appliesTo: fields.appliesTo.optional(),
    productIds: fields.productIds.optional(),
    minPurchase: fields.minPurchase.optional(),
    minQuantity: fields.minQuantity.optional(),
    startsOn: fields.startsOn.optional(),
    endsOn: fields.endsOn.optional(),
    usageLimit: fields.usageLimit.optional(),
    isActive: fields.isActive.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field');
function validate(
  value: {
    kind: string;
    value: string;
    startsOn?: string | null;
    endsOn?: string | null;
    appliesTo: string;
    productIds?: number[];
  },
  context: z.RefinementCtx,
) {
  const amount = new Decimal(value.value);
  if (!amount.greaterThan(0) || (value.kind === 'percentage' && amount.greaterThan(100)))
    context.addIssue({ code: 'custom', path: ['value'], message: 'Value is outside the allowed range' });
  if (value.endsOn && value.startsOn && value.endsOn < value.startsOn)
    context.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'End date must be on or after start date',
    });
  if (value.appliesTo === 'products' && !value.productIds?.length)
    context.addIssue({ code: 'custom', path: ['productIds'], message: 'Product targets are required' });
  if (value.appliesTo === 'subscription' && value.productIds?.length)
    context.addIssue({ code: 'custom', path: ['productIds'], message: 'Product targets are not allowed' });
}

router.use(requireAuth, requireRole('admin'));
router.get(
  '/',
  validateQuery(pageSchema),
  asyncHandler(async (_req, res) => {
    const query = res.locals.validatedQuery as z.infer<typeof pageSchema>;
    res.json(await listDiscounts(query));
  }),
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createSchema>;
    const data = await createDiscount(
      {
        ...body,
        description: body.description ?? null,
        minPurchase: body.minPurchase ?? '0',
        minQuantity: body.minQuantity ?? '0',
        startsOn: body.startsOn ?? null,
        endsOn: body.endsOn ?? null,
        usageLimit: body.usageLimit ?? null,
        isActive: body.isActive ?? true,
      },
      { id: req.auth!.id },
    );
    res.status(201).json({ data });
  }),
);

router.get(
  '/:id',
  validateParams(idSchema),
  asyncHandler(async (_req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await getDiscount(id) });
  }),
);

router.patch(
  '/:id',
  validateParams(idSchema),
  validateBody(patchSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({
      data: await patchDiscount(id, req.body as z.infer<typeof patchSchema>, { id: req.auth!.id }),
    });
  }),
);

router.post(
  '/:id/deactivate',
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await setDiscountActive(id, false, { id: req.auth!.id }) });
  }),
);

router.post(
  '/:id/activate',
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    res.json({ data: await setDiscountActive(id, true, { id: req.auth!.id }) });
  }),
);

router.delete(
  '/:id',
  validateParams(idSchema),
  asyncHandler(async (req, res) => {
    const { id } = res.locals.validatedParams as z.infer<typeof idSchema>;
    await removeDiscount(id, { id: req.auth!.id });
    res.status(204).end();
  }),
);

export default router;
