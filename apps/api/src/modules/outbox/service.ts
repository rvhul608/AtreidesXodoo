import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { listOutbox } from './repository.js';

export async function getOutbox(input: { page: number; pageSize: number; recipient?: string }) {
  const { limit, offset } = paginationValues(input);
  const result = await listOutbox(limit, offset, input.recipient);
  return { data: result.rows, meta: paginationMeta(input.page, input.pageSize, result.total) };
}
