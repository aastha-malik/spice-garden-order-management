import { zValidator } from '@hono/zod-validator';
import type { z } from 'zod';
import { invalidFilter, notFound, validationFailed } from './errors.js';
import { uuidSchema } from '../schemas/common.schema.js';

/** Renders the first Zod issue as `path: message`, e.g. `items.0.quantity: ...`. */
function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Request bodies fail as VALIDATION_FAILED. */
export const bodyValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw validationFailed(firstIssue(result.error));
  });

/** Query parameters fail as INVALID_FILTER, per the contract's error tables. */
export const queryValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator('query', schema, (result) => {
    if (!result.success) throw invalidFilter(firstIssue(result.error));
  });

/**
 * Validates a path id. A non-UUID can never identify a stored row, so this
 * reports RESOURCE_NOT_FOUND - the failure every id-addressed endpoint in the
 * contract declares - instead of leaking a Postgres cast error as a 500.
 */
export function parsePathId(raw: string | undefined, resource: string): string {
  const parsed = uuidSchema.safeParse(raw);
  if (!parsed.success) throw notFound(resource);
  return parsed.data;
}
