export const ORDER_STATUSES = [
  'CONFIRMED',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Mirrors the server's ALLOWED_TRANSITIONS so the UI only ever offers moves
 * the API will accept. The server remains the authority.
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
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
  createdAt: string;
  updatedAt: string;
  customer: Customer;
  items: OrderItem[];
}

export interface Pagination {
  page: number;
  size: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  data: T[];
  pagination: Pagination;
}
