import type { PoolClient } from 'pg';
import { pool, query } from '../db/pool.js';
import type { OrderStatus } from '../schemas/common.schema.js';
import type { OrderItemInput } from '../schemas/order.schema.js';
import type { Customer } from './customer.repo.js';

export interface OrderItem {
  /** Not in the published contract, but DELETE /orders/:id/items/:item_id
   *  needs an addressable id. Additive, so existing consumers are unaffected. */
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  customerId: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  customer: Customer;
  items: OrderItem[];
}

interface OrderRow {
  id: string;
  order_number: string;
  customer_id: string;
  status: OrderStatus;
  total_amount: number;
  item_count: number;
  created_at: Date;
  updated_at: Date;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    created_at: string;
    updated_at: string;
  };
  items: OrderItem[];
}

const toOrderDetail = (row: OrderRow): OrderDetail => ({
  id: row.id,
  orderNumber: row.order_number,
  customerId: row.customer_id,
  status: row.status,
  totalAmount: Number(row.total_amount),
  itemCount: Number(row.item_count),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  customer: {
    id: row.customer.id,
    name: row.customer.name,
    email: row.customer.email,
    phone: row.customer.phone,
    // Nested JSON bypasses the driver's date parsing, so these arrive as
    // ISO strings already; re-wrapping keeps the outer type honest.
    createdAt: new Date(row.customer.created_at),
    updatedAt: new Date(row.customer.updated_at),
  },
  items: row.items.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
  })),
});

/**
 * One projection serves both the list and the detail endpoint: the contract
 * returns a full OrderDetail in each. Customer and items are aggregated into
 * JSON inside the query, so a page of N orders is still a single round trip
 * rather than 2N+1.
 */
const ORDER_PROJECTION = `
  SELECT o.id, o.order_number, o.customer_id, o.status,
         o.total_amount, o.item_count, o.created_at, o.updated_at,
         to_jsonb(c) AS customer,
         COALESCE((
           SELECT json_agg(jsonb_build_object(
                    'id',         i.id,
                    'itemName',   i.item_name,
                    'quantity',   i.quantity,
                    'unitPrice',  i.unit_price,
                    'totalPrice', i.total_price)
                  ORDER BY i.created_at, i.id)
             FROM order_items i
            WHERE i.order_id = o.id), '[]'::json) AS items
    FROM orders o
    JOIN customers c ON c.id = o.customer_id`;

export interface ListOrdersFilters {
  search?: string | undefined;
  status?: OrderStatus | undefined;
  customerId?: string | undefined;
  limit: number;
  offset: number;
}

export async function listOrders(
  filters: ListOrdersFilters,
): Promise<{ orders: OrderDetail[]; total: number }> {
  const search = filters.search?.trim() || null;
  const status = filters.status ?? null;
  const customerId = filters.customerId ?? null;

  // Static predicate: each filter is skipped when its parameter is NULL.
  const where = `
    WHERE ($1::text IS NULL
             OR o.order_number ILIKE '%' || $1 || '%'
             OR c.name  ILIKE '%' || $1 || '%'
             OR c.phone ILIKE '%' || $1 || '%'
             OR c.email ILIKE '%' || $1 || '%')
      AND ($2::order_status IS NULL OR o.status = $2)
      AND ($3::uuid IS NULL OR o.customer_id = $3)`;

  const rows = await query<OrderRow>(
    `${ORDER_PROJECTION} ${where}
      ORDER BY o.created_at DESC, o.id
      LIMIT $4 OFFSET $5`,
    [search, status, customerId, filters.limit, filters.offset],
  );

  const [count] = await query<{ total: number }>(
    `SELECT count(*)::bigint AS total
       FROM orders o JOIN customers c ON c.id = o.customer_id ${where}`,
    [search, status, customerId],
  );

  return { orders: rows.map(toOrderDetail), total: count?.total ?? 0 };
}

export async function findOrderById(
  id: string,
  client?: PoolClient,
): Promise<OrderDetail | null> {
  const runner = client ?? pool;
  const { rows } = await runner.query<OrderRow>(
    `${ORDER_PROJECTION} WHERE o.id = $1`,
    [id],
  );
  return rows[0] ? toOrderDetail(rows[0]) : null;
}

export async function insertOrder(
  customerId: string,
  client: PoolClient,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    'INSERT INTO orders (customer_id) VALUES ($1) RETURNING id',
    [customerId],
  );
  return rows[0]!.id;
}

export async function insertOrderItems(
  orderId: string,
  items: OrderItemInput[],
  client: PoolClient,
): Promise<void> {
  if (items.length === 0) return;

  // Flatten to a single multi-row INSERT so the totals trigger and the
  // round trip both happen once per call rather than once per item.
  // $1 is the order id; each item contributes three further placeholders.
  const values: unknown[] = [orderId];
  const tuples = items.map((item) => {
    values.push(item.itemName, item.quantity, item.unitPrice);
    const base = values.length - 3;
    return `($1, $${base + 1}, $${base + 2}, $${base + 3})`;
  });

  await client.query(
    `INSERT INTO order_items (order_id, item_name, quantity, unit_price)
     VALUES ${tuples.join(', ')}`,
    values,
  );
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<void> {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
}

export async function findOrderItem(
  orderId: string,
  itemId: string,
): Promise<{ id: string } | null> {
  const rows = await query<{ id: string }>(
    'SELECT id FROM order_items WHERE id = $1 AND order_id = $2',
    [itemId, orderId],
  );
  return rows[0] ?? null;
}

export async function countOrderItems(orderId: string): Promise<number> {
  const rows = await query<{ total: number }>(
    'SELECT count(*)::bigint AS total FROM order_items WHERE order_id = $1',
    [orderId],
  );
  return rows[0]?.total ?? 0;
}

export async function deleteOrderItem(orderId: string, itemId: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM order_items WHERE id = $1 AND order_id = $2',
    [itemId, orderId],
  );
  return (result.rowCount ?? 0) > 0;
}
