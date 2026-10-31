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

export function paginationMeta(pagination: Pagination, total: number): PaginationMeta {
  return { page: pagination.page, pageSize: pagination.pageSize, total };
}
