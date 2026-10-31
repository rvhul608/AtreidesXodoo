import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { validateBody, validateParams, validateQuery } from '../../common/validate.js';
import { dateSchema, pageQuerySchema } from '../subscriptions/schemas.js';
import { getInvoice, listInvoicePage, printInvoice, transitionInvoice } from './service.js';

const router = Router();

const statusSchema = z.enum(['Draft', 'Confirmed', 'Paid', 'Cancelled']);

const actionParams = z.object({ id: z.coerce.number().int().positive() });

const listSchema = pageQuerySchema.extend({
  status: statusSchema.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  subscriptionId: z.coerce.number().int().positive().optional(),
  overdue: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  q: z.string().trim().min(1).max(50).optional(),
  dueFrom: dateSchema.optional(),
  dueTo: dateSchema.optional(),
});

const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() }).default({});

router.use(requireAuth, requireRole('admin', 'staff'));

router.get(
  '/',
  validateQuery(listSchema),
  asyncHandler(async (_request, response) => {
    const query = response.locals.validatedQuery as z.infer<typeof listSchema>;
    response.json(
      await listInvoicePage(
        {
          status: query.status,
          customerId: query.customerId,
          subscriptionId: query.subscriptionId,
          overdue: query.overdue,
          q: query.q,
          dueFrom: query.dueFrom,
          dueTo: query.dueTo,
        },
        query.page,
        query.pageSize,
      ),
    );
  }),
);

router.get(
  '/:id/print',
  validateParams(actionParams),
  asyncHandler(async (_request, response) => {
    const params = response.locals.validatedParams as z.infer<typeof actionParams>;
    response.type('html').send(await printInvoice(params.id));
  }),
);

router.get(
  '/:id',
  validateParams(actionParams),
  asyncHandler(async (_request, response) => {
    const params = response.locals.validatedParams as z.infer<typeof actionParams>;
    response.json({ data: await getInvoice(params.id) });
  }),
);

for (const action of ['confirm', 'cancel', 'send'] as const) {
  router.post(
    `/:id/${action}`,
    validateParams(actionParams),
    validateBody(reasonSchema),
    asyncHandler(async (request, response) => {
      const params = response.locals.validatedParams as z.infer<typeof actionParams>;
      const body = request.body as z.infer<typeof reasonSchema>;
      response.json({
        data: await transitionInvoice(params.id, action, { id: request.auth!.id }, body.reason),
      });
    }),
  );
}

export default router;
