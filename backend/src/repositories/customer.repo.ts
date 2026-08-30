import type { PoolClient } from 'pg';
import { pool, query } from '../db/pool.js';

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  created_at: Date;
  updated_at: Date;
}

/** Single place where DB snake_case becomes API camelCase. */
const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const COLUMNS = 'id, name, email, phone, created_at, updated_at';

export async function listCustomers(params: {
  search?: string | undefined;
  limit: number;
  offset: number;
}): Promise<{ customers: Customer[]; total: number }> {
  // A single `$1 IS NULL OR ...` predicate keeps the SQL static, so the
  // planner can cache it and there is no string concatenation to audit.
  const search = params.search?.trim() || null;
  const filter = `WHERE $1::text IS NULL
                    OR name ILIKE '%' || $1 || '%'
                    OR phone ILIKE '%' || $1 || '%'
                    OR email ILIKE '%' || $1 || '%'`;

  const rows = await query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers ${filter}
      ORDER BY created_at DESC, id
      LIMIT $2 OFFSET $3`,
    [search, params.limit, params.offset],
  );

  const [count] = await query<{ total: number }>(
    `SELECT count(*)::bigint AS total FROM customers ${filter}`,
    [search],
  );

  return { customers: rows.map(toCustomer), total: count?.total ?? 0 };
}

export async function findCustomerById(
  id: string,
  client?: PoolClient,
): Promise<Customer | null> {
  const runner = client ?? pool;
  const { rows } = await runner.query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers WHERE id = $1`,
    [id],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
}

export async function findCustomerByPhone(
  phone: string,
  client?: PoolClient,
): Promise<Customer | null> {
  const runner = client ?? pool;
  const { rows } = await runner.query<CustomerRow>(
    `SELECT ${COLUMNS} FROM customers WHERE phone = $1`,
    [phone],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
}

export async function insertCustomer(
  input: { name: string; email: string | null; phone: string },
  client?: PoolClient,
): Promise<Customer> {
  const runner = client ?? pool;
  const { rows } = await runner.query<CustomerRow>(
    `INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3)
     RETURNING ${COLUMNS}`,
    [input.name, input.email, input.phone],
  );
  return toCustomer(rows[0]!);
}

export async function updateCustomer(
  id: string,
  patch: { name?: string; email?: string | null; phone?: string },
): Promise<Customer | null> {
  // COALESCE with a sentinel would break clearing `email` to NULL, so the
  // SET list is built from the keys actually present in the patch.
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.name !== undefined) sets.push(`name = $${sets.length + 1}`), values.push(patch.name);
  if (patch.email !== undefined) sets.push(`email = $${sets.length + 1}`), values.push(patch.email);
  if (patch.phone !== undefined) sets.push(`phone = $${sets.length + 1}`), values.push(patch.phone);

  if (sets.length === 0) return findCustomerById(id);

  const rows = await query<CustomerRow>(
    `UPDATE customers SET ${sets.join(', ')}
      WHERE id = $${values.length + 1}
      RETURNING ${COLUMNS}`,
    [...values, id],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
}

/** Returns false when no row matched, so the service can raise a 404. */
export async function deleteCustomer(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
