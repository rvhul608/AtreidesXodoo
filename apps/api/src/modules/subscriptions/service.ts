import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { decideTransition, todayIso, type TransitionTarget } from './lifecycle.js';
import {
  applyStatusChange,
  customerExists,
  deleteDraft,
  findAutoCloseCandidates,
  findCatalogProducts,
  findCatalogVariants,
  findHistory,
  findLines,
  findPlanTerms,
  findSubscription,
  findTemplate,
  findTemplateLines,
  insertHistory,
  insertSubscription,
  listSubscriptions as listSubscriptionRows,
  lockSubscription,
  notifyStatusChange,
  replaceLines,
  updateDraftTerms,
  withTransaction,
  writeAudit,
  type HistoryRow,
  type NewLine,
  type PlanTermsRow,
  type SubscriptionFilters,
  type SubscriptionLineRow,
  type SubscriptionRow,
  type SubscriptionStatus,
} from './repository.js';

export type { TransitionTarget } from './lifecycle.js';

export interface LineInput {
  productId: number;
  variantId?: number | null;
  quantity: string;
}

export interface SubscriptionInput {
  customerId: number;
  planId: number;
  startDate: string;
  expiryDate?: string | null;
  paymentTerms?: string;
  lines: LineInput[];
}

export interface SubscriptionPatch {
  planId?: number;
  startDate?: string;
  expiryDate?: string | null;
  paymentTerms?: string;
  lines?: LineInput[];
}

// actorId null means the system (no user) performed the change.
export interface Actor {
  id: number | null;
}

export interface TransitionOptions {
  reason?: string;
  // Portal callers pass their own customer id so other customers' rows look missing (404).
  customerId?: number | null;
  asOf?: string;
}

const DEFAULT_PAYMENT_TERMS = 'Due on receipt';
const editableStatuses: SubscriptionStatus[] = ['Draft', 'Quotation'];

function publicLine(row: SubscriptionLineRow) {
  return {
    id: Number(row.id),
    product_id: row.product_id === null ? null : Number(row.product_id),
    variant_id: row.product_variant_id === null ? null : Number(row.product_variant_id),
    description: row.description,
    quantity: new Decimal(row.quantity).toFixed(2),
    unit_price: new Decimal(row.unit_price).toFixed(2),
    amount: new Decimal(row.amount).toFixed(2),
    tax_amount: new Decimal(row.tax_amount).toFixed(2),
    tax_ids: row.tax_ids.map(Number),
  };
}

function totalsOf(lines: SubscriptionLineRow[]) {
  const untaxed = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
  const tax = lines.reduce((sum, line) => sum.plus(line.tax_amount), new Decimal(0));
  return {
    untaxed: untaxed.toFixed(2),
    tax: tax.toFixed(2),
    total: untaxed.plus(tax).toFixed(2),
  };
}

function publicSubscription(row: SubscriptionRow, lines: SubscriptionLineRow[]) {
  return {
    id: Number(row.id),
    subscription_number: row.subscription_number,
    customer_id: Number(row.customer_id),
    customer_name: row.customer_name,
    plan_id: Number(row.plan_id),
    plan_name: row.plan_name,
    template_id: row.template_id === null ? null : Number(row.template_id),
    status: row.status,
    period: row.period,
    start_date: row.start_date,
    expiry_date: row.expiry_date,
    next_billing_date: row.next_billing_date,
    paused_at: row.paused_at,
    payment_terms: row.payment_terms,
    totals: totalsOf(lines),
    lines: lines.map(publicLine),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function publicHistory(row: HistoryRow) {
  return {
    id: Number(row.id),
    from_status: row.from_status,
    to_status: row.to_status,
    action: row.action,
    reason: row.reason,
    actor_user_id: row.actor_user_id === null ? null : Number(row.actor_user_id),
    changed_at: row.changed_at,
  };
}

async function requirePlan(planId: number): Promise<PlanTermsRow> {
  const plan = await findPlanTerms(planId);
  if (!plan) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan was not found');
  return plan;
}

function assertPlanAvailable(plan: PlanTermsRow, startDate: string): void {
  const tooEarly = plan.available_from !== null && startDate < plan.available_from;
  const tooLate = plan.available_until !== null && startDate > plan.available_until;
  if (tooEarly || tooLate) {
    throw new AppError(400, 'PLAN_UNAVAILABLE', 'The plan is not available on the start date', {
      availableFrom: plan.available_from,
      availableUntil: plan.available_until,
    });
  }
}

function assertDates(startDate: string, expiryDate: string | null): void {
  if (expiryDate !== null && expiryDate < startDate) {
    throw new AppError(400, 'INVALID_EXPIRY', 'Expiry date must be on or after the start date');
  }
}

// Unit price = product sales price + variant extra price; tax uses the product's linked tax rules
// at the time of pricing and is snapshotted onto the line.
export async function priceLines(lines: LineInput[]): Promise<NewLine[]> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const variantIds = [...new Set(lines.flatMap((line) => (line.variantId ? [line.variantId] : [])))];
  const [products, variants] = await Promise.all([
    findCatalogProducts(productIds),
    findCatalogVariants(variantIds),
  ]);
  const productsById = new Map(products.map((product) => [Number(product.id), product]));
  const variantsById = new Map(variants.map((variant) => [Number(variant.id), variant]));

  return lines.map((line) => {
    const product = productsById.get(line.productId);
    if (!product) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product ${line.productId} was not found`);
    }
    const variant = line.variantId ? variantsById.get(line.variantId) : undefined;
    if (line.variantId && (!variant || Number(variant.product_id) !== line.productId)) {
      const message = `Variant ${line.variantId} does not belong to product ${line.productId}`;
      throw new AppError(400, 'VARIANT_MISMATCH', message);
    }
    const unitPrice = new Decimal(product.sales_price).plus(variant?.extra_price ?? 0);
    const amount = unitPrice.times(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const taxAmount = amount.times(product.tax_rate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    return {
      productId: line.productId,
      variantId: variant ? Number(variant.id) : null,
      description: variant ? `${product.name} (${variant.name}: ${variant.value})` : product.name,
      quantity: new Decimal(line.quantity).toFixed(2),
      unitPrice: unitPrice.toFixed(2),
      amount: amount.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      taxIds: product.tax_ids.map(Number),
    };
  });
}

function totalQuantity(lines: NewLine[]): Decimal {
  return lines.reduce((sum, line) => sum.plus(line.quantity), new Decimal(0));
}

function assertMinimumQuantity(plan: PlanTermsRow, lines: NewLine[]): void {
  if (totalQuantity(lines).lessThan(plan.min_quantity)) {
    throw new AppError(400, 'MIN_QUANTITY', `The plan requires a total quantity of at least ${plan.min_quantity}`);
  }
}

async function loadSubscription(id: number, customerId: number | null) {
  const row = await findSubscription(id, customerId);
  if (!row) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
  const lines = await findLines([id]);
  return publicSubscription(row, lines);
}

export async function createSubscription(input: SubscriptionInput, actor: Actor, templateId: number | null = null) {
  if (!(await customerExists(input.customerId))) {
    throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found');
  }
  const plan = await requirePlan(input.planId);
  const expiryDate = input.expiryDate ?? null;
  assertDates(input.startDate, expiryDate);
  assertPlanAvailable(plan, input.startDate);
  const lines = await priceLines(input.lines);
  assertMinimumQuantity(plan, lines);

  const id = await withTransaction(async (client) => {
    const subscriptionId = await insertSubscription(client, {
      customerId: input.customerId,
      planId: input.planId,
      templateId,
      period: plan.period,
      quantity: totalQuantity(lines).toFixed(2),
      unitPrice: new Decimal(plan.price).toFixed(2),
      startDate: input.startDate,
      expiryDate,
      paymentTerms: input.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
    });
    await replaceLines(client, subscriptionId, lines);
    await insertHistory(client, {
      subscriptionId,
      from: null,
      to: 'Draft',
      action: templateId === null ? 'created' : 'created_from_template',
      actorId: actor.id,
      reason: null,
    });
    if (actor.id !== null) {
      await writeAudit(client, {
        customerId: input.customerId,
        userId: actor.id,
        entityType: 'subscription',
        entityId: subscriptionId,
        action: 'subscription_created',
        changes: { planId: input.planId, templateId, lineCount: lines.length },
      });
    }
    return subscriptionId;
  });
  return loadSubscription(id, null);
}

export async function createFromTemplate(
  input: { templateId: number; customerId: number; startDate: string; expiryDate?: string | null;
    paymentTerms?: string },
  actor: Actor,
) {
  const template = await findTemplate(input.templateId);
  if (!template) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Quotation template was not found');
  if (template.expires_on < todayIso()) {
    throw new AppError(409, 'TEMPLATE_EXPIRED', 'This quotation template has expired', {
      expiresOn: template.expires_on,
    });
  }
  const lines = await findTemplateLines(input.templateId);
  if (template.plan_id === null || lines.length === 0) {
    throw new AppError(409, 'TEMPLATE_INCOMPLETE', 'The template needs a plan and at least one product line');
  }
  return createSubscription({
    customerId: input.customerId,
    planId: Number(template.plan_id),
    startDate: input.startDate,
    expiryDate: input.expiryDate,
    paymentTerms: input.paymentTerms,
    lines: lines.map((line) => ({
      productId: Number(line.product_id),
      variantId: line.product_variant_id === null ? null : Number(line.product_variant_id),
      quantity: line.quantity,
    })),
  }, actor, input.templateId);
}

export async function updateSubscription(id: number, patch: SubscriptionPatch, actor: Actor) {
  const current = await findSubscription(id, null);
  if (!current) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
  const currentLines = await findLines([id]);
  const planId = patch.planId ?? Number(current.plan_id);
  const plan = await requirePlan(planId);
  const startDate = patch.startDate ?? current.start_date;
  const expiryDate = patch.expiryDate === undefined ? current.expiry_date : patch.expiryDate;
  assertDates(startDate, expiryDate);
  assertPlanAvailable(plan, startDate);
  // Re-price from the current catalog either way, so a draft never carries stale prices.
  const lineInputs: LineInput[] = patch.lines ?? currentLines
    .filter((line) => line.product_id !== null)
    .map((line) => ({
      productId: Number(line.product_id),
      variantId: line.product_variant_id === null ? null : Number(line.product_variant_id),
      quantity: line.quantity,
    }));
  const lines = await priceLines(lineInputs);
  assertMinimumQuantity(plan, lines);

  await withTransaction(async (client) => {
    const locked = await lockSubscription(client, id, null);
    if (!locked) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
    if (!editableStatuses.includes(locked.status)) {
      throw new AppError(409, 'SUBSCRIPTION_LOCKED', `A ${locked.status} subscription can no longer be edited`);
    }
    await updateDraftTerms(client, id, {
      planId,
      period: plan.period,
      quantity: totalQuantity(lines).toFixed(2),
      unitPrice: new Decimal(plan.price).toFixed(2),
      startDate,
      expiryDate,
      paymentTerms: patch.paymentTerms ?? current.payment_terms,
    });
    await replaceLines(client, id, lines);
    if (actor.id !== null) {
      await writeAudit(client, {
        customerId: Number(current.customer_id),
        userId: actor.id,
        entityType: 'subscription',
        entityId: id,
        action: 'subscription_updated',
        changes: { fields: Object.keys(patch) },
      });
    }
  });
  return loadSubscription(id, null);
}

export async function deleteSubscription(id: number, actor: Actor): Promise<void> {
  await withTransaction(async (client) => {
    const locked = await lockSubscription(client, id, null);
    if (!locked) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
    if (locked.status !== 'Draft') {
      throw new AppError(409, 'SUBSCRIPTION_LOCKED', 'Only Draft subscriptions can be deleted');
    }
    await deleteDraft(client, id);
    if (actor.id !== null) {
      await writeAudit(client, {
        customerId: Number(locked.customer_id),
        userId: actor.id,
        entityType: 'subscription',
        entityId: id,
        action: 'subscription_deleted',
      });
    }
  });
}

export async function listSubscriptions(filters: SubscriptionFilters, page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await listSubscriptionRows(filters, limit, offset);
  const lines = result.rows.length > 0 ? await findLines(result.rows.map((row) => Number(row.id))) : [];
  const linesBySubscription = new Map<string, SubscriptionLineRow[]>();
  for (const line of lines) {
    const group = linesBySubscription.get(line.subscription_id) ?? [];
    group.push(line);
    linesBySubscription.set(line.subscription_id, group);
  }
  return {
    data: result.rows.map((row) => publicSubscription(row, linesBySubscription.get(row.id) ?? [])),
    meta: paginationMeta(page, pageSize, result.total),
  };
}

export async function getSubscription(id: number, customerId: number | null = null) {
  const subscription = await loadSubscription(id, customerId);
  const history = await findHistory(id);
  return { ...subscription, history: history.map(publicHistory) };
}

/**
 * The only way a subscription changes status. Locks the row, applies the pure lifecycle rules,
 * then writes the new state, a history row and an audit entry in one transaction.
 */
export async function transitionSubscription(
  id: number,
  to: TransitionTarget,
  actor: Actor,
  options: TransitionOptions = {},
) {
  const today = options.asOf ?? todayIso();
  const decision = await withTransaction(async (client) => {
    const current = await lockSubscription(client, id, options.customerId ?? null);
    if (!current) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
    const result = decideTransition(current, to, today);
    await applyStatusChange(client, id, result.change);
    await insertHistory(client, {
      subscriptionId: id,
      from: result.from,
      to: result.to,
      action: result.action,
      actorId: actor.id,
      reason: options.reason ?? null,
    });
    if (actor.id !== null) {
      await writeAudit(client, {
        customerId: Number(current.customer_id),
        userId: actor.id,
        entityType: 'subscription',
        entityId: id,
        action: `subscription_${result.action}`,
        changes: { from: result.from, to: result.to, reason: options.reason ?? null },
      });
    }
    await notifyStatusChange(client, { id, from: result.from, to: result.to, action: result.action });
    return result;
  });
  return {
    id,
    from: decision.from,
    to: decision.to,
    action: decision.action,
    expiry_date: decision.change.expiryDate,
    next_billing_date: decision.change.nextBillingDate,
  };
}

// Auto-close goes through transitionSubscription so each closure gets its own history row.
export async function closeExpiredSubscriptions(asOf: string, actor: Actor) {
  const candidates = await findAutoCloseCandidates(asOf);
  const closed: number[] = [];
  for (const id of candidates) {
    try {
      await transitionSubscription(id, 'Closed', actor, { reason: 'auto_close', asOf });
      closed.push(id);
    } catch (error) {
      // A concurrent manual close is fine; anything else is a real failure.
      if (!(error instanceof AppError && error.code === 'INVALID_TRANSITION')) throw error;
    }
  }
  return { asOf, closed: closed.length, subscription_ids: closed };
}
