export interface PaginationInput {
  page: number;
  pageSize: number;
}

export function paginationValues(input: PaginationInput) {
  return {
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };
}

export function paginationMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total };
}
