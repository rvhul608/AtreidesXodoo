import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import * as repository from './repository.js';

function conflict(error: unknown, code: string): never {
  if ((error as { code?: string }).code === '23505')
    throw new AppError(409, code, 'A record with that value already exists');
  throw error;
}
export async function listProducts(page: number, pageSize: number) {
  const result = await repository.listProducts(
    ...(Object.values(paginationValues({ page, pageSize })) as [number, number]),
  );
  return {
    data: result.products,
    meta: paginationMeta(page, pageSize, result.total),
  };
}
export async function getProduct(id: number) {
  const product = await repository.getProduct(id);
  if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  const [variants, taxes] = await Promise.all([repository.productVariants(id), repository.productTaxes(id)]);
  return { ...product, variants, taxes };
}
export async function createProduct(input: Parameters<typeof repository.createProduct>[0], actorId: number) {
  try {
    return await repository.createProduct(input, actorId);
  } catch (e) {
    conflict(e, 'DUPLICATE_SKU');
  }
}
export async function updateProduct(
  id: number,
  input: Parameters<typeof repository.updateProduct>[1],
  actorId: number,
) {
  if (!Object.keys(input).length)
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one product field is required');
  try {
    const product = await repository.updateProduct(id, input, actorId);
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
    return product;
  } catch (error) {
    conflict(error, 'DUPLICATE_SKU');
  }
}
export async function createVariant(
  productId: number,
  input: Parameters<typeof repository.createVariant>[1],
  actorId: number,
) {
  if (!(await repository.getProduct(productId)))
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  try {
    return await repository.createVariant(productId, input, actorId);
  } catch (e) {
    conflict(e, 'DUPLICATE_VARIANT');
  }
}
export async function deleteVariant(id: number, actorId: number) {
  if (!(await repository.deleteVariant(id, actorId)))
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  return { id };
}
export async function deleteProductVariant(productId: number, variantId: number, actorId: number) {
  const variant = await repository.getVariant(variantId);
  if (!variant || variant.product_id !== productId)
    throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
  return deleteVariant(variantId, actorId);
}
export async function updateProductVariant(
  productId: number,
  variantId: number,
  input: Parameters<typeof repository.updateVariant>[2],
  actorId: number,
) {
  if (!Object.keys(input).length)
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one variant field is required');
  try {
    const variant = await repository.updateVariant(productId, variantId, input, actorId);
    if (!variant) throw new AppError(404, 'VARIANT_NOT_FOUND', 'Variant was not found');
    return variant;
  } catch (error) {
    conflict(error, 'DUPLICATE_VARIANT');
  }
}
export async function createTax(input: Parameters<typeof repository.createTax>[0], actorId: number) {
  try {
    return await repository.createTax(input, actorId);
  } catch (e) {
    conflict(e, 'DUPLICATE_TAX_NAME');
  }
}
export async function listTaxes(page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await repository.listTaxes(limit, offset);
  return {
    data: result.rows,
    meta: paginationMeta(page, pageSize, result.total),
  };
}
export async function updateTax(
  id: number,
  input: Parameters<typeof repository.updateTax>[1],
  actorId: number,
) {
  if (!Object.keys(input).length)
    throw new AppError(400, 'VALIDATION_ERROR', 'At least one tax field is required');
  try {
    const tax = await repository.updateTax(id, input, actorId);
    if (!tax) throw new AppError(404, 'TAX_NOT_FOUND', 'Tax rule was not found');
    return tax;
  } catch (error) {
    conflict(error, 'DUPLICATE_TAX_NAME');
  }
}
export async function deleteTax(id: number, actorId: number) {
  try {
    if (!(await repository.deleteTax(id, actorId)))
      throw new AppError(404, 'TAX_NOT_FOUND', 'Tax rule was not found');
  } catch (error) {
    if ((error as { code?: string }).code === '23503')
      throw new AppError(409, 'TAX_REFERENCED', 'Tax rule is referenced by products');
    throw error;
  }
  return { id };
}
export async function replaceTaxes(id: number, taxIds: number[], actorId: number) {
  if (!(await repository.getProduct(id)))
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  if (!(await repository.replaceTaxes(id, taxIds, actorId)))
    throw new AppError(400, 'TAX_NOT_FOUND', 'One or more tax rules were not found');
  return { id, taxes: await repository.productTaxes(id) };
}
export async function removeProduct(id: number, actorId: number) {
  try {
    if (!(await repository.removeProduct(id, actorId)))
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  } catch (e) {
    if ((e as { code?: string }).code === '23503')
      throw new AppError(409, 'PRODUCT_REFERENCED', 'Product is referenced by a quotation template');
    throw e;
  }
  return { id };
}
export async function resolveUnitPrice(productId: number, variantId: number | null) {
  const row = await repository.resolvePrice(productId, variantId);
  if (!row) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product was not found');
  if (variantId !== null && row.extra_price === null)
    throw new AppError(400, 'VARIANT_NOT_FOUND', 'Variant does not belong to this product');
  const base = new Decimal(row.sales_price),
    extra = new Decimal(row.extra_price ?? '0');
  return {
    base: base.toFixed(2),
    extra: extra.toFixed(2),
    unitPrice: base.plus(extra).toFixed(2),
  };
}
