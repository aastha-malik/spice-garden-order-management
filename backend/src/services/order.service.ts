import { withTransaction } from '../db/pool.js';
import { ApiError, notFound, validationFailed } from '../lib/errors.js';
import * as customerRepo from '../repositories/customer.repo.js';
import * as orderRepo from '../repositories/order.repo.js';
import type { OrderStatus } from '../schemas/common.schema.js';
import type { CreateOrderInput, OrderItemInput } from '../schemas/order.schema.js';

/**
 * Allowed status transitions.
 *
 * The contract names INVALID_STATUS_TRANSITION but never defines the rules,
 * so this models the real kitchen workflow: orders move forward one step at a
 * time, may be cancelled while still in progress, and COMPLETED / CANCELLED
 * are terminal. Documented in questions.md.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Items may only be edited before the kitchen has plated the order. */
const ITEM_MUTABLE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PREPARING'];

export async function listOrders(params: {
  search?: string | undefined;
  status?: OrderStatus | undefined;
  customerId?: string | undefined;
  size: number;
  offset: number;
}) {
  // A filter naming a customer who does not exist is a 404 per the contract,
  // rather than an empty page.
  if (params.customerId) {
    const customer = await customerRepo.findCustomerById(params.customerId);
    if (!customer) throw notFound('Customer');
  }

  return orderRepo.listOrders({
    search: params.search,
    status: params.status,
    customerId: params.customerId,
    limit: params.size,
    offset: params.offset,
  });
}

export async function getOrder(id: string) {
  const order = await orderRepo.findOrderById(id);
  if (!order) throw notFound('Order');
  return order;
}

export async function createOrder(input: CreateOrderInput) {
  const orderId = await withTransaction(async (client) => {
    const customerId = await resolveCustomer(input, client);
    const newOrderId = await orderRepo.insertOrder(customerId, client);
    await orderRepo.insertOrderItems(newOrderId, input.items, client);
    return newOrderId;
  });

  // Re-read outside the transaction so the trigger-maintained totals are
  // reflected in the response.
  return getOrder(orderId);
}

/**
 * Attaches the order to an existing customer when an id is given, otherwise
 * finds one by phone or creates it. Reusing by phone matches the contract,
 * which does not list RESOURCE_ALREADY_EXISTS for this endpoint.
 */
async function resolveCustomer(
  input: CreateOrderInput,
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
): Promise<string> {
  const { customer } = input;

  if (customer.id) {
    const existing = await customerRepo.findCustomerById(customer.id, client);
    if (!existing) throw notFound('Customer');
    return existing.id;
  }

  if (!customer.name || !customer.phone) {
    throw validationFailed(
      'customer.name and customer.phone are required when customer.id is not provided',
    );
  }

  const byPhone = await customerRepo.findCustomerByPhone(customer.phone, client);
  if (byPhone) return byPhone.id;

  const created = await customerRepo.insertCustomer(
    { name: customer.name, email: customer.email ?? null, phone: customer.phone },
    client,
  );
  return created.id;
}

export async function updateStatus(id: string, next: OrderStatus) {
  const order = await orderRepo.findOrderById(id);
  if (!order) throw notFound('Order');

  if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
    throw new ApiError(
      'INVALID_STATUS_TRANSITION',
      `Cannot change order status from ${order.status} to ${next}`,
    );
  }

  await orderRepo.updateOrderStatus(id, next);
  return getOrder(id);
}

export async function addItem(orderId: string, item: OrderItemInput) {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound('Order');
  assertItemsMutable(order.status);

  await withTransaction((client) => orderRepo.insertOrderItems(orderId, [item], client));
  return getOrder(orderId);
}

export async function removeItem(orderId: string, itemId: string) {
  const order = await orderRepo.findOrderById(orderId);
  if (!order) throw notFound('Order');
  assertItemsMutable(order.status);

  const item = await orderRepo.findOrderItem(orderId, itemId);
  if (!item) throw notFound('Order item');

  // Mirrors the create-time rule that an order must contain at least one item.
  const remaining = await orderRepo.countOrderItems(orderId);
  if (remaining <= 1) {
    throw validationFailed(
      'Order must contain at least one item. Cancel the order instead of removing its last item.',
    );
  }

  await orderRepo.deleteOrderItem(orderId, itemId);
  return getOrder(orderId);
}

function assertItemsMutable(status: OrderStatus) {
  if (!ITEM_MUTABLE_STATUSES.includes(status)) {
    throw validationFailed(`Items cannot be changed once an order is ${status}`);
  }
}
