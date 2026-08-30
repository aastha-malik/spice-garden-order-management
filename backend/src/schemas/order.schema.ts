import { z } from 'zod';
import { orderStatusSchema } from './common.schema.js';

export const orderItemInputSchema = z.object({
  itemName: z.string().trim().min(1, 'itemName is required').max(200),
  quantity: z.number().int('quantity must be an integer').positive('quantity must be greater than 0'),
  unitPrice: z.number().nonnegative('unitPrice must be zero or greater'),
});

export const createOrderSchema = z.object({
  customer: z.object({
    // When present the order attaches to this customer; when absent the
    // remaining fields are used to find-or-create one.
    id: z.string().uuid('customer.id must be a valid UUID').nullable().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    phone: z.string().trim().min(6).max(32).optional(),
  }),
  items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item'),
});

export const updateOrderStatusSchema = z.object({
  status: orderStatusSchema,
});

export const listOrdersQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  customerId: z.string().optional(),
  page: z.string().optional(),
  size: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
