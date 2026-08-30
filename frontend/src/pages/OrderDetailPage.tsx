import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { ALLOWED_TRANSITIONS, type OrderStatus } from '../api/types';
import {
  Button, Card, Field, StatusBadge, TableMessage,
  formatCurrency, formatDateTime, inputClass,
} from '../components/ui';

export function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.getOrder(orderId),
    refetchInterval: 10_000,
  });

  /** Every mutation refreshes this order and invalidates the list behind it. */
  const onSettled = () => {
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const changeStatus = useMutation({
    mutationFn: (status: OrderStatus) => api.updateOrderStatus(orderId, status),
    onSuccess: () => setError(null),
    onError,
    onSettled,
  });

  const addItem = useMutation({
    mutationFn: (item: { itemName: string; quantity: number; unitPrice: number }) =>
      api.addOrderItem(orderId, item),
    onSuccess: () => { setError(null); setDraft({ itemName: '', quantity: '1', unitPrice: '' }); },
    onError,
    onSettled,
  });

  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.deleteOrderItem(orderId, itemId),
    onSuccess: () => setError(null),
    onError,
    onSettled,
  });

  const [draft, setDraft] = useState({ itemName: '', quantity: '1', unitPrice: '' });

  if (query.isPending) return <TableMessage>Loading order…</TableMessage>;
  if (query.isError) {
    return <TableMessage tone="error">{(query.error as Error).message}</TableMessage>;
  }

  const order = query.data;
  const nextStatuses = ALLOWED_TRANSITIONS[order.status];
  const itemsEditable = order.status === 'CONFIRMED' || order.status === 'PREPARING';
  const busy = changeStatus.isPending || addItem.isPending || removeItem.isPending;

  return (
    <div className="space-y-4">
      <Link to="/orders" className="text-sm text-slate-500 hover:text-slate-800">
        ← Back to orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{order.orderNumber}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Placed {formatDateTime(order.createdAt)} · updated {formatDateTime(order.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {nextStatuses.length === 0 ? (
            <span className="text-sm text-slate-400">
              {order.status === 'COMPLETED' ? 'Order completed' : 'Order cancelled'} — no further changes
            </span>
          ) : (
            nextStatuses.map((status) => (
              <Button
                key={status}
                variant={status === 'CANCELLED' ? 'danger' : 'primary'}
                disabled={busy}
                onClick={() => changeStatus.mutate(status)}
              >
                {status === 'CANCELLED' ? 'Cancel order' : `Mark ${status.toLowerCase()}`}
              </Button>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
          </div>
          <dl className="space-y-3 px-4 py-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Name</dt>
              <dd className="font-medium text-slate-900">{order.customer.name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
              <dd className="text-slate-800">{order.customer.phone}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
              <dd className="text-slate-800">{order.customer.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Customer since</dt>
              <dd className="text-slate-800">{formatDateTime(order.customer.createdAt)}</dd>
            </div>
            <div className="border-t border-slate-100 pt-3">
              <Link
                to={`/orders?customerId=${order.customerId}`}
                className="text-sm text-brand-700 hover:underline"
              >
                View this customer's orders
              </Link>
            </div>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Items</h2>
            <span className="text-xs text-slate-500">{order.itemCount} in total</span>
          </div>

          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Unit</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">{item.itemName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {formatCurrency(item.totalPrice)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {itemsEditable && order.items.length > 1 && (
                      <button
                        onClick={() => removeItem.mutate(item.id)}
                        disabled={busy}
                        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-slate-600">
                  Order total
                </td>
                <td className="px-4 py-3 text-right text-base font-semibold tabular-nums text-slate-900">
                  {formatCurrency(order.totalAmount)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>

          {itemsEditable ? (
            <form
              className="flex flex-wrap items-end gap-3 border-t border-slate-200 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                addItem.mutate({
                  itemName: draft.itemName.trim(),
                  quantity: Number(draft.quantity),
                  unitPrice: Number(draft.unitPrice),
                });
              }}
            >
              <div className="min-w-[12rem] flex-1">
                <Field label="Add item">
                  <input
                    className={inputClass}
                    placeholder="e.g. Garlic Naan"
                    required
                    value={draft.itemName}
                    onChange={(e) => setDraft({ ...draft, itemName: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-20">
                <Field label="Qty">
                  <input
                    className={inputClass}
                    type="number" min="1" step="1" required
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field label="Unit price">
                  <input
                    className={inputClass}
                    type="number" min="0" step="0.01" required placeholder="0.00"
                    value={draft.unitPrice}
                    onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })}
                  />
                </Field>
              </div>
              <Button type="submit" variant="secondary" disabled={busy}>Add</Button>
            </form>
          ) : (
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              Items can only be changed while an order is confirmed or preparing.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
