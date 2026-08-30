import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api } from '../api/client';
import { ORDER_STATUSES, type OrderStatus } from '../api/types';
import { useDebounced } from '../components/useDebounced';
import {
  Button, Card, Pager, StatusBadge, TableMessage,
  formatCurrency, formatDateTime, inputClass,
} from '../components/ui';

const FILTER_TABS = ['ALL', ...ORDER_STATUSES] as const;

export function OrdersPage() {
  // Filters live in the URL so a filtered view can be shared or reloaded.
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'ALL') as (typeof FILTER_TABS)[number];
  const page = Number(params.get('page') ?? 1);

  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const search = useDebounced(searchInput);

  const update = (next: Record<string, string | undefined>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === '' || value === 'ALL') merged.delete(key);
      else merged.set(key, value);
    }
    // Any filter change resets to the first page.
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  const query = useQuery({
    queryKey: ['orders', { search, status, page }],
    queryFn: () =>
      api.listOrders({
        search: search || undefined,
        status: status === 'ALL' ? undefined : (status as OrderStatus),
        page,
        size: 10,
      }),
    // The brief asks for real-time monitoring; the contract has no websocket,
    // so the list re-polls while a manager watches it.
    refetchInterval: 10_000,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
          <p className="text-sm text-slate-500">
            Live view of every order. Refreshes automatically.
          </p>
        </div>
        <Link to="/orders/new">
          <Button>+ Create Order</Button>
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <input
            className={`${inputClass} sm:max-w-xs`}
            placeholder="Search order number, customer, phone…"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              update({ search: event.target.value });
            }}
          />
          <div className="flex flex-wrap gap-1">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => update({ status: tab })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  status === tab
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {query.isPending ? (
          <TableMessage>Loading orders…</TableMessage>
        ) : query.isError ? (
          <TableMessage tone="error">{(query.error as Error).message}</TableMessage>
        ) : query.data.data.length === 0 ? (
          <TableMessage>No orders match these filters.</TableMessage>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.data.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.customer.name}</div>
                      <div className="text-xs text-slate-500">{order.customer.phone}</div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{order.itemCount}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDateTime(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {query.data && (
          <Pager
            {...query.data.pagination}
            onPageChange={(next) => update({ page: String(next) })}
          />
        )}
      </Card>
    </div>
  );
}
