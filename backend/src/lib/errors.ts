import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * The error codes named in the API contract, plus a catch-all for
 * anything unexpected.
 */
export type ApiErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_FILTER'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_ALREADY_EXISTS'
  | 'INVALID_STATUS_TRANSITION'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  VALIDATION_FAILED: 400,
  INVALID_FILTER: 400,
  RESOURCE_NOT_FOUND: 404,
  RESOURCE_ALREADY_EXISTS: 409,
  INVALID_STATUS_TRANSITION: 409,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }

  toResponseBody() {
    return { error: { code: this.code, message: this.message } };
  }
}

export const notFound = (what: string) =>
  new ApiError('RESOURCE_NOT_FOUND', `${what} does not exist`);

export const validationFailed = (message: string) =>
  new ApiError('VALIDATION_FAILED', message);

export const invalidFilter = (message: string) =>
  new ApiError('INVALID_FILTER', message);

export const alreadyExists = (message: string) =>
  new ApiError('RESOURCE_ALREADY_EXISTS', message);
