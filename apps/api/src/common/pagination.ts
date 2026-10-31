import { z } from 'zod';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export interface Pagination {
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function parsePagination(input: unknown): Pagination {
  const { page, pageSize } = paginationSchema.parse(input);
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function paginationMeta(pagination: Pagination, total: number): PaginationMeta;
export function paginationMeta(page: number, pageSize: number, total: number): PaginationMeta;
export function paginationMeta(
  first: Pagination | number,
  second: number,
  third?: number,
): PaginationMeta {
  if (typeof first === 'number') return { page: first, pageSize: second, total: third ?? 0 };
  return { page: first.page, pageSize: first.pageSize, total: second };
}

/** For routes that already validated page/pageSize with their own Zod schema. */
export function paginationValues(input: { page: number; pageSize: number }) {
  return { limit: input.pageSize, offset: (input.page - 1) * input.pageSize };
}
