import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Spice Garden API listening on http://localhost:${info.port}`);
});

/** Drain in-flight requests and DB connections on Ctrl-C / container stop. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  });
}
