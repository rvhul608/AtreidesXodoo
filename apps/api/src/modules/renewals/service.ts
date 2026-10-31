import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { runChase as persistChase } from './repository.js';

export async function runChase(asOf: string, actorId: number) {
  return persistChase(asOf, actorId);
}

export { paginationMeta, paginationValues };
