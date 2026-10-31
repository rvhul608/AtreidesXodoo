import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { resolveUnitPrice } from '../catalog/service.js';
import { getPlanById } from '../plans/service.js';
import * as repository from './repository.js';
type TemplateInput = {
  name: string;
  description?: string;
  planId: number;
  validityDays: number;
  lines: Array<{ productId: number; variantId?: number; quantity: string }>;
};
async function pricedTemplate(input: TemplateInput) {
  await getPlanById(input.planId);
  const lines = [];
  for (const line of input.lines) {
    const price = await resolveUnitPrice(line.productId, line.variantId ?? null);
    lines.push({ ...line, unitPrice: price.unitPrice });
  }
  return { ...input, lines };
}
export async function createTemplate(input: TemplateInput, actorId: number) {
  try {
    const created = await repository.createTemplate(await pricedTemplate(input), actorId);
    return await repository.getTemplate(Number(created.id));
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new AppError(409, 'DUPLICATE_TEMPLATE', 'Template already exists');
    throw e;
  }
}
export async function updateTemplate(id: number, input: TemplateInput, actorId: number) {
  const row = await repository.replaceTemplate(id, await pricedTemplate(input), actorId);
  if (!row) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template was not found');
  return row;
}
export async function deleteTemplate(id: number, actorId: number) {
  if (!(await repository.deleteTemplate(id, actorId)))
    throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template was not found');
  return { id };
}
export async function listTemplates(page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await repository.listTemplates(limit, offset);
  return {
    data: result.rows,
    meta: paginationMeta(page, pageSize, result.total),
  };
}
export async function getTemplate(id: number) {
  const row = await repository.getTemplate(id);
  if (!row) throw new AppError(404, 'TEMPLATE_NOT_FOUND', 'Template was not found');
  return row;
}
