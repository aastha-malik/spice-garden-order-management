import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { ApiError } from './lib/errors.js';
import { customersRoute } from './routes/customers.route.js';
import { ordersRoute } from './routes/orders.route.js';

const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: allowedOrigins }));

app.get('/health', (c) => c.json({ status: 'ok' }));

// Mounted at the root: the contract specifies /customers and /orders with
// no version or /api prefix.
app.route('/customers', customersRoute);
app.route('/orders', ordersRoute);

app.notFound((c) =>
  c.json({ error: { code: 'RESOURCE_NOT_FOUND', message: 'Route does not exist' } }, 404),
);

/**
 * Single place where anything thrown below becomes an ApiError body.
 * Unrecognised errors are logged in full but reported as a generic 500 so
 * internal details never reach the client.
 */
app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json(error.toResponseBody(), error.status);
  }

  console.error('[unhandled]', error);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    500,
  );
});
