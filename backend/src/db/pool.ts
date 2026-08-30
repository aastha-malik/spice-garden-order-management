import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

/**
 * node-postgres returns NUMERIC and BIGINT as strings to avoid precision loss.
 * The API contract types money as `number` and counts as `integer`, so we
 * parse them here, once, at the driver boundary.
 *
 * Safe for this domain: order totals stay far inside IEEE-754 integer range.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

export const pool = new pg.Pool({ connectionString });

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Runs `fn` inside a transaction, rolling back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Postgres unique-violation SQLSTATE, used to map races onto 409s. */
export const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    (error as { code?: string }).code === UNIQUE_VIOLATION;
}
