import { z } from 'zod';

export const ORDER_STATUSES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const uuidSchema = z.string().uuid('must be a valid UUID');

export const paginationQuerySchema = z.object({
  page: z.string().optional(),
  size: z.string().optional(),
  search: z.string().optional(),
});
