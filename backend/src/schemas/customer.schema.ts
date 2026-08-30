import { z } from 'zod';

const name = z.string().trim().min(1, 'name is required').max(200);
// Kept deliberately permissive: the restaurant records international and
// local formats alike. Uniqueness, not formatting, is what the system needs.
const phone = z.string().trim().min(6, 'phone is required').max(32);
// `email` is nullable in the contract, so an explicit null clears it.
const email = z.string().trim().email('email must be a valid email address').max(320).nullable();

export const createCustomerSchema = z.object({
  name,
  email: email.optional().default(null),
  phone,
});

export const updateCustomerSchema = z
  .object({
    name: name.optional(),
    email: email.optional(),
    phone: phone.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'at least one field must be provided',
  });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
