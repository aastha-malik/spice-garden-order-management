# Spice Garden — Order Management System

An internal tool for restaurant staff to create customer orders, track them
through the kitchen, and monitor service in real time.

- **Backend** — [Hono](https://hono.dev) + [Zod](https://zod.dev) on Node, TypeScript, raw SQL over `node-postgres`
- **Database** — PostgreSQL 16 (Docker), hand-written schema
- **Frontend** — React 18 + TypeScript, Vite, Tailwind CSS v4, TanStack Query, React Router

All assumptions and open questions are in **[questions.md](questions.md)**.

---

## Prerequisites

| Tool | Version used |
|---|---|
| Node.js | 22.x (18+ works) |
| npm | 10.x |
| Docker + Docker Compose | any recent version |

---

## Quick start

From the repository root:

```bash
# 1. Start PostgreSQL (published on host port 5433)
docker-compose up -d db

# 2. Backend — install, load schema + seed data, run
cd backend
cp .env.example .env
npm install
npm run db:reset        # applies database/schema.sql then database/seed.sql
npm run dev             # http://localhost:3000

# 3. Frontend — in a second terminal
cd frontend
cp .env.example .env
npm install
npm run dev             # http://localhost:5173
```

Open **http://localhost:5173**. The app ships with 8 customers and 15 orders
spread across all five statuses.

> **Port note:** the database container publishes on **5433**, not 5432, so it
> does not clash with a PostgreSQL you may already run locally.

### Verify the install

```bash
cd backend && npm run smoke
```

This exercises all 9 endpoints and every documented error code against the
running API — 35 assertions covering pagination, filters, validation, status
transitions and cascade behaviour.

---

## Project layout

```
├── docker-compose.yml       PostgreSQL 16
├── database/
│   ├── schema.sql           Tables, enum, indexes, triggers (source of truth)
│   └── seed.sql             8 customers, 15 orders, 34 items
├── backend/
│   ├── src/
│   │   ├── app.ts           Hono app, CORS, central error handler
│   │   ├── index.ts         Server bootstrap + graceful shutdown
│   │   ├── db/pool.ts       Connection pool, type parsers, transaction helper
│   │   ├── lib/             Error types, response envelopes, pagination, validators
│   │   ├── schemas/         Zod request schemas
│   │   ├── repositories/    All SQL lives here
│   │   ├── services/        Business rules (status transitions, invariants)
│   │   └── routes/          HTTP layer
│   └── scripts/             db-reset.sh, smoke.sh
└── frontend/
    └── src/
        ├── api/             Typed API client + shared types
        ├── components/      Reusable UI (badges, buttons, pager)
        └── pages/           Orders list, order detail, create order, customers
```

**Layering:** routes handle HTTP and validation, services own business rules,
repositories own SQL. Only repositories know about `snake_case`; everything
above sees the camelCase API shapes.

---

## Environment variables

**`backend/.env`**

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://spice:spice@localhost:5433/spice_garden` | Postgres connection string |
| `PORT` | `3000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |

**`frontend/.env`**

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | Base URL of the API |

---

## Database design

Three tables, plus an `order_status` enum matching the contract exactly.

```
customers ──1:N──> orders ──1:N──> order_items
```

The design leans on the database to enforce invariants rather than trusting
application code:

- **`order_items.total_price` is a generated column** (`quantity * unit_price`).
  It cannot be written independently, so a line total can never contradict its
  own inputs.
- **`orders.total_amount` and `orders.item_count` are maintained by a trigger**
  (`recalc_order_totals`) that fires on every insert, update and delete of an
  order item. They are denormalised because the contract returns them on every
  order — including in list responses — but no code path can leave them stale.
- **`customers.phone` is `UNIQUE`.** Duplicates are caught by the constraint
  rather than a read-then-write check, so two concurrent creates cannot both
  succeed.
- **`orders.order_number`** defaults to `'ORD-' || nextval('order_number_seq')`,
  starting at `ORD-1001` — short, sortable and safe under concurrency.
- **Indexes** on `orders(status)`, `orders(customer_id)`, `orders(created_at DESC)`
  and `order_items(order_id, created_at)` cover the filter and sort paths the
  list endpoint actually uses.

`schema.sql` is re-runnable — it drops and recreates everything, so
`npm run db:reset` always returns a known-good state.

---

## API

Base URL `http://localhost:3000`. Every response uses the contract envelope:

```jsonc
// success
{ "data": { ... }, "meta": { "pagination": { "page": 1, "size": 10, "total": 15, "totalPages": 2 } } }

// error
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "Order does not exist" } }
```

| Method | Endpoint | Success |
|---|---|---|
| `GET` | `/customers` — `search`, `page`, `size` | 200 |
| `POST` | `/customers` | 201 |
| `PATCH` | `/customers/{id}` | 200 |
| `DELETE` | `/customers/{id}` | 204 |
| `GET` | `/orders` — `search`, `status`, `customerId`, `page`, `size` | 200 |
| `POST` | `/orders` | 201 |
| `GET` | `/orders/{order_id}` | 200 |
| `PATCH` | `/orders/{order_id}/status` | 200 |
| `POST` | `/orders/{order_id}/items` | 201 |
| `DELETE` | `/orders/{order_id}/items/{item_id}` | 200 |

`GET /health` is also available for readiness checks.

### Error codes

| Code | HTTP |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `INVALID_FILTER` | 400 |
| `RESOURCE_NOT_FOUND` | 404 |
| `RESOURCE_ALREADY_EXISTS` | 409 |
| `INVALID_STATUS_TRANSITION` | 409 |
| `INTERNAL_ERROR` | 500 |

### Order status lifecycle

```
CONFIRMED ──> PREPARING ──> READY ──> COMPLETED
    │             │           │
    └─────────────┴───────────┴──> CANCELLED
```

`COMPLETED` and `CANCELLED` are terminal. Any other transition returns
`INVALID_STATUS_TRANSITION`. The rules are defined once in
`backend/src/services/order.service.ts`; the frontend reads the same table so
it never offers a button the API would reject.

The contract does not define these rules — see [questions.md](questions.md#1-status-transition-rules-were-never-defined).

### Example

```bash
# Create an order for a new customer
curl -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{
    "customer": { "name": "Asha Rao", "email": null, "phone": "+919812345678" },
    "items": [
      { "itemName": "Paneer Butter Masala", "quantity": 2, "unitPrice": 320 },
      { "itemName": "Garlic Naan",          "quantity": 4, "unitPrice": 70 }
    ]
  }'

# Advance it through the kitchen
curl -X PATCH http://localhost:3000/orders/<id>/status \
  -H 'content-type: application/json' -d '{"status":"PREPARING"}'
```

---

## Features

**Orders** — paginated list with debounced search across order number and
customer name/phone/email, status filter tabs, and colour-coded badges. Filters
live in the URL, so a filtered view can be bookmarked or shared. The list
re-polls every 10 seconds for the "real time" monitoring in the brief; the
contract defines no websocket, so polling keeps the protocol unchanged.

**Order detail** — customer panel, itemised bill with a live total, and status
actions limited to legal transitions. Items can be added or removed while the
order is `CONFIRMED` or `PREPARING`.

**Create order** — attach to an existing customer via search, or enter a new
one. A phone number already on file is reused rather than rejected. Dynamic item
rows with a running total.

**Customers** — searchable, paginated list with create, edit and delete.
Deleting warns first, because it cascades to that customer's orders.

---

## Available scripts

**backend/**

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:reset` | Re-apply schema + seed data |
| `npm run smoke` | End-to-end API check (35 assertions) |

**frontend/**

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |

---

## Troubleshooting

**`DATABASE_URL is not set`** — copy `backend/.env.example` to `backend/.env`.

**Port 5433 already allocated** — change the host side of the port mapping in
`docker-compose.yml` and update `DATABASE_URL` to match.

**Frontend loads but shows "Could not reach the API"** — confirm the backend is
running (`curl localhost:3000/health`) and that `VITE_API_URL` matches its port.

**Reset everything** — `docker-compose down -v && docker-compose up -d db`, then
`cd backend && npm run db:reset`.

---

## Known gaps

No authentication, no automated test suite beyond `smoke.sh`, no menu
catalogue, no status audit log, and no multi-location support. Each is
explained in [questions.md](questions.md#9-things-deliberately-left-out).
