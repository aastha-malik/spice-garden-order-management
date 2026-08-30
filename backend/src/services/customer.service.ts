import { alreadyExists, notFound } from '../lib/errors.js';
import { isUniqueViolation } from '../db/pool.js';
import * as repo from '../repositories/customer.repo.js';
import type { CreateCustomerInput, UpdateCustomerInput } from '../schemas/customer.schema.js';

export async function listCustomers(params: {
  search?: string | undefined;
  page: number;
  size: number;
  offset: number;
}) {
  const { customers, total } = await repo.listCustomers({
    search: params.search,
    limit: params.size,
    offset: params.offset,
  });
  return { customers, total };
}

export async function getCustomer(id: string) {
  const customer = await repo.findCustomerById(id);
  if (!customer) throw notFound('Customer');
  return customer;
}

export async function createCustomer(input: CreateCustomerInput) {
  try {
    return await repo.insertCustomer({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone,
    });
  } catch (error) {
    // Relies on the DB constraint rather than a read-then-write check, so
    // two concurrent creates cannot both slip through.
    if (isUniqueViolation(error)) {
      throw alreadyExists('A customer with this phone number already exists');
    }
    throw error;
  }
}

export async function updateCustomer(id: string, patch: UpdateCustomerInput) {
  const existing = await repo.findCustomerById(id);
  if (!existing) throw notFound('Customer');

  try {
    const updated = await repo.updateCustomer(id, patch);
    if (!updated) throw notFound('Customer');
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw alreadyExists('A customer with this phone number already exists');
    }
    throw error;
  }
}

export async function deleteCustomer(id: string) {
  // Orders cascade with the customer (see questions.md) - the contract lists
  // RESOURCE_NOT_FOUND as the only failure mode for this endpoint.
  const deleted = await repo.deleteCustomer(id);
  if (!deleted) throw notFound('Customer');
}
