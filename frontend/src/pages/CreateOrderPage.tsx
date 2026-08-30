import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import type { Customer } from '../api/types';
import { useDebounced } from '../components/useDebounced';
import { Button, Card, Field, formatCurrency, inputClass } from '../components/ui';

interface ItemDraft {
  itemName: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_ITEM: ItemDraft = { itemName: '', quantity: '1', unitPrice: '' };

export function CreateOrderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Either attach to an existing customer, or capture details for a new one.
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);
  const [error, setError] = useState<string | null>(null);

  const search = useDebounced(customerSearch);
  const customers = useQuery({
    queryKey: ['customers', { search, size: 5 }],
    queryFn: () => api.listCustomers({ search: search || undefined, size: 5 }),
    enabled: mode === 'existing',
  });

  const createOrder = useMutation({
    mutationFn: api.createOrder,
    onSuccess: (order) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      navigate(`/orders/${order.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong'),
  });

  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const total = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === 'existing' && !selected) {
      setError('Select a customer, or switch to "New customer".');
      return;
    }

    createOrder.mutate({
      customer:
        mode === 'existing'
          ? { id: selected!.id }
          : {
              name: newCustomer.name.trim(),
              phone: newCustomer.phone.trim(),
              email: newCustomer.email.trim() || null,
            },
      items: items.map((item) => ({
        itemName: item.itemName.trim(),
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Create order</h1>
        <p className="text-sm text-slate-500">
          New orders start in <span className="font-medium">CONFIRMED</span>.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
          <div className="flex gap-1">
            {(['existing', 'new'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => { setMode(option); setError(null); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  mode === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option === 'existing' ? 'Existing' : 'New customer'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 p-4">
          {mode === 'existing' ? (
            <>
              <Field label="Find customer" hint="Search by name, phone or email.">
                <input
                  className={inputClass}
                  placeholder="Start typing…"
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setSelected(null); }}
                />
              </Field>

              <div className="divide-y divide-slate-100 rounded-md ring-1 ring-slate-200">
                {customers.isPending ? (
                  <p className="px-3 py-3 text-sm text-slate-500">Loading…</p>
                ) : customers.data?.data.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-slate-500">
                    No matches. Switch to “New customer” to add one.
                  </p>
                ) : (
                  customers.data?.data.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelected(customer)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                        selected?.id === customer.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>
                        <span className="font-medium text-slate-900">{customer.name}</span>
                        <span className="ml-2 text-slate-500">{customer.phone}</span>
                      </span>
                      {selected?.id === customer.id && (
                        <span className="text-xs font-medium text-brand-700">Selected</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass} required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                />
              </Field>
              <Field label="Phone" hint="Reused if already known.">
                <input
                  className={inputClass} required placeholder="+9198…"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  className={inputClass} type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Items</h2>
        </div>

        <div className="space-y-3 p-4">
          {items.map((item, index) => (
            <div key={index} className="flex flex-wrap items-end gap-3">
              <div className="min-w-[12rem] flex-1">
                <Field label={index === 0 ? 'Item' : ''}>
                  <input
                    className={inputClass} required placeholder="e.g. Paneer Butter Masala"
                    value={item.itemName}
                    onChange={(e) => updateItem(index, { itemName: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-20">
                <Field label={index === 0 ? 'Qty' : ''}>
                  <input
                    className={inputClass} type="number" min="1" step="1" required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-28">
                <Field label={index === 0 ? 'Unit price' : ''}>
                  <input
                    className={inputClass} type="number" min="0" step="0.01" required placeholder="0.00"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
                  />
                </Field>
              </div>
              <div className="w-24 pb-1.5 text-right text-sm tabular-nums text-slate-600">
                {formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}
              </div>
              <button
                type="button"
                // An order must keep at least one item, so the last row cannot go.
                disabled={items.length === 1}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
                className="pb-2 text-xs text-rose-600 hover:underline disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}

          <Button type="button" variant="secondary" onClick={() => setItems([...items, { ...EMPTY_ITEM }])}>
            + Add another item
          </Button>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-600">Order total</span>
          <span className="text-base font-semibold tabular-nums text-slate-900">
            {formatCurrency(total)}
          </span>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => navigate('/orders')}>
          Cancel
        </Button>
        <Button type="submit" disabled={createOrder.isPending}>
          {createOrder.isPending ? 'Creating…' : 'Create order'}
        </Button>
      </div>
    </form>
  );
}
