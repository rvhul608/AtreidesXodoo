import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import * as repository from './repository.js';
export async function getPlanById(id: number) {
  const row = await repository.getPlanById(id);
  if (!row) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan was not found');
  return repository.mapPlan(row);
}
export async function listPlans(page: number, pageSize: number, availableOn?: string) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await repository.listPlans(limit, offset, availableOn);
  return {
    data: result.rows.map(repository.mapPlan),
    meta: paginationMeta(page, pageSize, result.total),
  };
}
export async function createPlan(input: Parameters<typeof repository.writePlan>[0], actorId: number) {
  if (input.availableFrom && input.availableUntil && input.availableUntil < input.availableFrom)
    throw new AppError(400, 'VALIDATION_ERROR', 'availableUntil must not precede availableFrom');
  try {
    return repository.mapPlan(await repository.writePlan(input, actorId));
  } catch (e) {
    if ((e as { code?: string }).code === '23505')
      throw new AppError(409, 'DUPLICATE_PLAN_NUMBER', 'Plan number already exists');
    throw e;
  }
}
export async function patchPlan(
  id: number,
  flag: 'auto_close' | 'allow_early_close' | 'allow_pause' | 'allow_renew',
  value: boolean,
  actorId: number,
) {
  const row = await repository.patchPlan(id, { [flag]: value }, actorId);
  if (!row) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plan was not found');
  return repository.mapPlan(row);
}
