import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import type { Customer } from '../api/types';
import { useDebounced } from '../components/useDebounced';
import {
  Button, Card, Field, Pager, TableMessage, formatDateTime, inputClass,
} from '../components/ui';

const BLANK = { name: '', phone: '', email: '' };

export function CustomersPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useDebounced(searchInput);

  const query = useQuery({
    queryKey: ['customers', { search, page }],
    queryFn: () => api.listCustomers({ search: search || undefined, page, size: 10 }),
    placeholderData: keepPreviousData,
  });

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(BLANK);
    setError(null);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : 'Something went wrong');

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
      };
      return editing ? api.updateCustomer(editing.id, payload) : api.createCustomer(payload);
    },
    onSuccess: () => { refresh(); closeForm(); },
    onError,
  });

  const remove = useMutation({
    mutationFn: api.deleteCustomer,
    onSuccess: () => { refresh(); setError(null); },
    onError,
  });

  const startEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({ name: customer.name, phone: customer.phone, email: customer.email ?? '' });
    setShowForm(true);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500">Everyone who has placed an order.</p>
        </div>
        <Button onClick={() => { closeForm(); setShowForm(true); }}>+ Add customer</Button>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
          {error}
        </div>
      )}

      {showForm && (
        <Card>
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {editing ? `Edit ${editing.name}` : 'New customer'}
            </h2>
          </div>
          <form
            className="space-y-3 p-4"
            onSubmit={(event) => { event.preventDefault(); save.mutate(); }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input
                  className={inputClass} required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Phone" hint="Must be unique.">
                <input
                  className={inputClass} required placeholder="+9198…"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  className={inputClass} type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create customer'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="border-b border-slate-200 p-4">
          <input
            className={`${inputClass} sm:max-w-xs`}
            placeholder="Search name, phone or email…"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
          />
        </div>

        {query.isPending ? (
          <TableMessage>Loading customers…</TableMessage>
        ) : query.isError ? (
          <TableMessage tone="error">{(query.error as Error).message}</TableMessage>
        ) : query.data.data.length === 0 ? (
          <TableMessage>No customers match this search.</TableMessage>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.data.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{customer.name}</td>
                    <td className="px-4 py-3 text-slate-700">{customer.phone}</td>
                    <td className="px-4 py-3 text-slate-500">{customer.email ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                      {formatDateTime(customer.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link
                          to={`/orders?customerId=${customer.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          Orders
                        </Link>
                        <button
                          onClick={() => startEdit(customer)}
                          className="text-slate-600 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            // Deleting a customer cascades to their orders, so
                            // confirm before it happens. See questions.md #5.
                            if (
                              window.confirm(
                                `Delete ${customer.name}? This also deletes all of their orders.`,
                              )
                            ) {
                              remove.mutate(customer.id);
                            }
                          }}
                          className="text-rose-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {query.data && <Pager {...query.data.pagination} onPageChange={setPage} />}
      </Card>
    </div>
  );
}
