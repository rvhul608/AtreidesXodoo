import Decimal from 'decimal.js';
import type { PoolClient } from 'pg';
import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { withTransaction } from '../../common/db.js';
import {
  deleteDiscount,
  findDiscount,
  findDiscountProducts,
  findUsage,
  hasUsage,
  insertDiscount,
  insertScopes,
  listDiscounts as listRows,
  lockDiscount,
  productsExist,
  replaceDiscount,
  writeAudit,
  type DiscountInput,
  type DiscountRow,
} from './repository.js';

export interface DiscountRequest extends Partial<DiscountInput> {
  productIds?: number[];
}

export interface Actor {
  id: number;
}

function view(row: DiscountRow, productIds: number[] = []) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description,
    kind: row.kind,
    value: new Decimal(row.value).toFixed(2),
    applies_to: row.applies_to,
    min_purchase: new Decimal(row.min_purchase).toFixed(2),
    min_quantity: new Decimal(row.min_quantity).toFixed(2),
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    usage_limit: row.usage_limit,
    times_used: row.times_used,
    remaining_uses: row.usage_limit === null ? null : row.usage_limit - row.times_used,
    is_active: row.is_active,
    state: row.state,
    product_ids: productIds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function validateProducts(
  appliesTo: DiscountInput['appliesTo'] | undefined,
  ids: number[] | undefined,
) {
  if (appliesTo === 'products' && (!ids || ids.length === 0)) {
    throw new AppError(400, 'PRODUCT_IDS_REQUIRED', 'Product discounts require at least one product');
  }
  if (appliesTo === 'subscription' && ids && ids.length > 0) {
    throw new AppError(400, 'PRODUCT_IDS_NOT_ALLOWED', 'Subscription discounts cannot target products');
  }
  if (ids && (!(await productsExist([...new Set(ids)])) || new Set(ids).size !== ids.length)) {
    throw new AppError(400, 'PRODUCT_NOT_FOUND', 'One or more product ids are invalid');
  }
}

export async function listDiscounts(input: { page: number; pageSize: number; status?: string; q?: string }) {
  const { limit, offset } = paginationValues(input);
  const result = await listRows(input.status, input.q, limit, offset);
  return {
    data: result.rows.map((row) => view(row, row.product_ids)),
    meta: paginationMeta(input.page, input.pageSize, result.total),
  };
}

export async function getDiscount(id: number) {
  const row = await findDiscount(id);
  if (!row) throw new AppError(404, 'DISCOUNT_NOT_FOUND', 'Discount was not found');
  const [products, usage] = await Promise.all([findDiscountProducts(id), findUsage(id)]);
  return {
    ...view(row, products),
    usage: usage.map((item) => ({
      id: Number(item.id),
      invoice_number: item.invoice_number,
      amount: new Decimal(item.amount).toFixed(2),
      used_at: item.used_at,
    })),
  };
}

export async function createDiscount(input: DiscountInput & { productIds?: number[] }, actor: Actor) {
  await validateProducts(input.appliesTo, input.productIds);
  const id = await withTransaction(async (client) => {
    const created = await insertDiscount(client, input);
    await insertScopes(client, created, input.productIds ?? []);
    await audit(client, created, actor, 'discount_created', { name: input.name });
    return created;
  });
  return getDiscount(id);
}

async function audit(
  client: PoolClient,
  id: number,
  actor: Actor,
  action: string,
  changes: Record<string, unknown>,
) {
  await writeAudit(client, {
    customerId: null,
    userId: actor.id,
    entityType: 'discount_rule',
    entityId: id,
    action,
    changes,
  });
}

export async function patchDiscount(id: number, input: DiscountRequest, actor: Actor) {
  await validateProducts(input.appliesTo, input.productIds);
  await withTransaction(async (client) => {
    const current = await lockDiscount(client, id);
    if (!current) throw new AppError(404, 'DISCOUNT_NOT_FOUND', 'Discount was not found');
    if (
      input.usageLimit !== undefined &&
      input.usageLimit !== null &&
      input.usageLimit < current.times_used
    ) {
      throw new AppError(409, 'USAGE_LIMIT_BELOW_USED', 'Usage limit cannot be below times already used', {
        timesUsed: current.times_used,
      });
    }
    const nextKind = input.kind ?? current.kind;
    const nextValue = new Decimal(input.value ?? current.value);
    if (!nextValue.greaterThan(0) || (nextKind === 'percentage' && nextValue.greaterThan(100))) {
      throw new AppError(400, 'INVALID_DISCOUNT_VALUE', 'Discount value is outside the allowed range');
    }
    const nextStart = input.startsOn === undefined ? current.starts_on : input.startsOn;
    const nextEnd = input.endsOn === undefined ? current.ends_on : input.endsOn;
    if (nextStart && nextEnd && nextEnd < nextStart) {
      throw new AppError(400, 'INVALID_DISCOUNT_DATES', 'End date must be on or after start date');
    }
    if (
      input.productIds !== undefined &&
      (input.appliesTo ?? current.applies_to) === 'products' &&
      input.productIds.length === 0
    ) {
      throw new AppError(400, 'PRODUCT_IDS_REQUIRED', 'Product discounts require at least one product');
    }
    const update = input.appliesTo === 'subscription' ? { ...input, productIds: [] } : input;
    await replaceDiscount(client, id, update);
    await audit(client, id, actor, 'discount_updated', { fields: Object.keys(input) });
  });
  return getDiscount(id);
}

export async function setDiscountActive(id: number, isActive: boolean, actor: Actor) {
  return patchDiscount(id, { isActive }, actor);
}

export async function removeDiscount(id: number, actor: Actor): Promise<void> {
  await withTransaction(async (client) => {
    const current = await lockDiscount(client, id);
    if (!current) throw new AppError(404, 'DISCOUNT_NOT_FOUND', 'Discount was not found');
    if (await hasUsage(id)) throw new AppError(409, 'DISCOUNT_IN_USE', 'Used discounts must be deactivated');
    await deleteDiscount(client, id);
    await audit(client, id, actor, 'discount_deleted', { name: current.name });
  });
}
