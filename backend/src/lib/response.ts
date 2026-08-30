/** Envelope helpers so every route emits the same ApiResponse<T> shape. */

export interface Pagination {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export const ok = <T>(data: T) => ({ data });

export const paginated = <T>(
  data: T,
  { page, size, total }: { page: number; size: number; total: number },
) => ({
  data,
  meta: {
    pagination: {
      page,
      size,
      total,
      totalPages: size > 0 ? Math.ceil(total / size) : 0,
    } satisfies Pagination,
  },
});
