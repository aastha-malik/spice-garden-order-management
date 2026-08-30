import type { Customer, OrderDetail, OrderStatus, Page, Pagination } from './types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Carries the API's error code so callers can branch on it, not on a string. */
export class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface Envelope<T> {
  data: T;
  meta?: { pagination: Pagination };
}

async function request<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the API. Is the backend running?');
  }

  // 204 No Content (customer delete) has no body to parse.
  if (response.status === 204) return { data: undefined as T };

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (body as { error?: { code: string; message: string } } | null)?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}`,
    );
  }

  return body as Envelope<T>;
}

/** Drops empty/undefined params so they never reach the API as blank filters. */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function paged<T>(path: string): Promise<Page<T>> {
  const { data, meta } = await request<T[]>(path);
  return {
    data,
    pagination: meta?.pagination ?? { page: 1, size: data.length, total: data.length, totalPages: 1 },
  };
}

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | undefined;
  customerId?: string;
  page?: number;
  size?: number;
}

export const api = {
  listOrders: (filters: OrderFilters) => paged<OrderDetail>(`/orders${toQuery({ ...filters })}`),

  getOrder: (id: string) => request<OrderDetail>(`/orders/${id}`).then((r) => r.data),

  createOrder: (body: {
    customer: { id?: string | null; name?: string; email?: string | null; phone?: string };
    items: { itemName: string; quantity: number; unitPrice: number }[];
  }) => request<OrderDetail>('/orders', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<OrderDetail>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }).then((r) => r.data),

  addOrderItem: (id: string, item: { itemName: string; quantity: number; unitPrice: number }) =>
    request<OrderDetail>(`/orders/${id}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }).then((r) => r.data),

  deleteOrderItem: (orderId: string, itemId: string) =>
    request<OrderDetail>(`/orders/${orderId}/items/${itemId}`, { method: 'DELETE' }).then((r) => r.data),

  listCustomers: (params: { search?: string; page?: number; size?: number }) =>
    paged<Customer>(`/customers${toQuery({ ...params })}`),

  createCustomer: (body: { name: string; email: string | null; phone: string }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

  updateCustomer: (id: string, body: { name?: string; email?: string | null; phone?: string }) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }).then((r) => r.data),

  deleteCustomer: (id: string) => request<void>(`/customers/${id}`, { method: 'DELETE' }),
};
