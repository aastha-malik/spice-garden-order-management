import { invalidFilter } from './errors.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_SIZE = 10;
export const MAX_SIZE = 100;

/**
 * Parses `page` / `size` query parameters.
 *
 * Anything that is present but not a positive integer is an INVALID_FILTER
 * rather than a silent fallback, so a malformed client request is visible.
 */
export function parsePagination(query: { page?: string; size?: string }): {
  page: number;
  size: number;
  offset: number;
} {
  const page = parsePositiveInt(query.page, 'page') ?? DEFAULT_PAGE;
  const size = parsePositiveInt(query.size, 'size') ?? DEFAULT_SIZE;

  if (size > MAX_SIZE) {
    throw invalidFilter(`size must not exceed ${MAX_SIZE}`);
  }

  return { page, size, offset: (page - 1) * size };
}

function parsePositiveInt(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined || raw === '') return undefined;

  // Number() would accept '1.5', '0x10' and ' 1 '; require plain digits.
  if (!/^\d+$/.test(raw)) {
    throw invalidFilter(`${field} must be a positive integer`);
  }

  const value = Number(raw);
  if (value < 1) {
    throw invalidFilter(`${field} must be a positive integer`);
  }
  return value;
}
