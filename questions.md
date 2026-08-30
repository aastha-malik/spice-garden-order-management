# Questions & Assumptions

The specification left a number of points open. Each one below states the
ambiguity, the decision taken, and the reasoning. Anything marked **Question**
is something I would confirm with the product owner before a real release.

---

## 1. Status transition rules were never defined

The contract declares an `INVALID_STATUS_TRANSITION` error for
`PATCH /orders/{order_id}/status` but never says which transitions are legal.

**Assumed rules** — modelled on how an order actually moves through a kitchen:

| From | Allowed next |
|---|---|
| `CONFIRMED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY`, `CANCELLED` |
| `READY` | `COMPLETED`, `CANCELLED` |
| `COMPLETED` | — (terminal) |
| `CANCELLED` | — (terminal) |

- Orders move **forward one step at a time**; skipping a step (e.g. `CONFIRMED → READY`) is rejected.
- An order can be cancelled from any non-terminal state.
- `COMPLETED` and `CANCELLED` are terminal — no reopening.
- Setting a status to its **current value is rejected** rather than treated as a
  no-op, so a redundant write surfaces rather than silently succeeding.

Defined once in `ALLOWED_TRANSITIONS` in
[`backend/src/services/order.service.ts`](backend/src/services/order.service.ts),
and the frontend derives its action buttons from the same table so the UI can
never offer an illegal move.

> **Question:** should a manager be able to reverse an accidental `COMPLETED`,
> or reopen a cancelled order? The current rules say no; a real deployment would
> likely want a supervisor override with an audit trail.

---

## 2. `itemCount` — dishes or line items?

`OrderDetails.itemCount` is ambiguous when a line reads `quantity: 3`.

**Assumed:** the **sum of quantities** (total dishes), not the number of distinct
lines. An order of 3 naan + 2 lassi reports `itemCount: 5`. This is the number
the kitchen and the bill care about.

Computed in the database by the `recalc_order_totals()` trigger, so it cannot
drift from the item rows.

---

## 3. `items[]` in the contract has no `id`, but item deletion needs one

`DELETE /orders/{order_id}/items/{item_id}` requires an item id, yet the
`OrderDetails` example omits `id` from the item objects — a client that only
had the documented fields could never build that URL.

**Assumed:** this is an oversight. We return `id` on each item **in addition to**
the documented fields. The response is a strict superset of the contract, so no
consumer written against the spec is affected.

---

## 4. `POST /orders` with no customer id, but a phone that already exists

The spec says: if no customer id is given, "create a customer using the provided
customer details". It does not say what happens when that phone number already
belongs to a customer — and `RESOURCE_ALREADY_EXISTS` is notably **absent** from
this endpoint's error table (unlike `POST /customers`, where it is listed).

**Assumed:** the existing customer is **reused** and the order is attached to
them. That absence reads as deliberate, and it matches the real workflow — a
repeat diner gives their phone number, and staff should not have to check first
whether they are already in the system.

Consequence: the customer's stored `name`/`email` are **not** overwritten by the
values sent with the order. Editing a customer is `PATCH /customers/{id}`.

> **Question:** should a name mismatch on a known phone number warn the user?

---

## 5. Deleting a customer who has orders

`DELETE /customers/{id}` lists only `RESOURCE_NOT_FOUND` — implying the delete
always succeeds — but orders hold a required foreign key to the customer, and
`OrderDetails` embeds the customer object.

**Assumed:** `ON DELETE CASCADE`. Deleting a customer deletes their orders.

This is the reading the contract forces, but it is **destructive and
irreversible**, and it silently erases historical revenue. In production I would
argue for a **soft delete** (`deleted_at`) so order history survives, with an
extra `RESOURCE_IN_USE` error for a hard delete.

> **Question:** should customers with completed orders be soft-deleted instead?

---

## 6. Removing the last item from an order

`POST /orders` rejects an empty `items` array ("Order must contain at least one
item"), but nothing is said about deleting items down to zero.

**Assumed:** the same invariant holds for the lifetime of the order. Deleting the
final remaining item returns `VALIDATION_FAILED` with a message pointing the
user at cancelling the order instead.

---

## 7. When can an order's items be changed?

Not specified. **Assumed:** items may be added or removed only while the order is
`CONFIRMED` or `PREPARING`. Once it is `READY` the food is plated, and once
`COMPLETED`/`CANCELLED` the order is closed; changing it would silently alter a
settled bill. Attempts return `VALIDATION_FAILED`.

---

## 8. Smaller decisions

| Area | Decision |
|---|---|
| `orderNumber` format | `ORD-` + a Postgres sequence starting at `1001` (`ORD-1001`, `ORD-1002`, …), matching the mock-up. A sequence keeps numbers short, sortable and safe under concurrency. |
| Money | `NUMERIC(12,2)` in Postgres — never floating point. The `pg` driver is configured to return it as a JSON `number`, since the contract types it that way. |
| `totalPrice` per item | A **generated column** (`quantity * unit_price`), so it cannot be written independently and can never contradict its inputs. |
| `totalAmount` / `itemCount` | Denormalised onto `orders` because the contract returns them on every order, including in list responses. Maintained by a trigger on `order_items`, so no code path can leave them stale. |
| Pagination | Defaults `page=1`, `size=10` (the mock-up shows 10 rows); `size` capped at `100`. Non-integer or `< 1` values return `INVALID_FILTER` rather than silently falling back. |
| `search` | Case-insensitive substring match. Orders search `orderNumber` + the customer's `name`/`phone`/`email`; customers search `name`/`phone`/`email`. |
| Sort order | Orders newest-first (`created_at DESC`), which is what a service desk needs. Not configurable — the contract exposes no sort parameter. |
| Customer uniqueness | `phone` is the natural key and carries a `UNIQUE` constraint. Duplicates are caught by the database constraint rather than a read-then-write check, so concurrent creates cannot both succeed. Email is nullable and not unique. |
| Malformed UUID in a path | Returns `RESOURCE_NOT_FOUND` — an id that is not a UUID cannot identify a stored row, and 404 is the failure every id-addressed endpoint declares. |
| `PATCH /customers/{id}` with `"email": null` | Explicitly clears the email. `undefined` (field omitted) leaves it unchanged. |
| "Real time" monitoring | The contract defines no websocket or SSE endpoint, so the order list polls every 10 seconds via TanStack Query. Adequate for service-hour monitoring without changing the protocol. |
| Authentication | Out of scope. The brief describes an internal tool but specifies no auth in the contract, and no endpoint is user-scoped. A real deployment needs staff login and role checks before this is exposed. |

---

## 9. Things deliberately left out

Scoped out to land a complete, working v1 — each is a known gap, not an oversight:

- **Authentication / authorisation** — see above.
- **An automated test suite.** `backend/scripts/smoke.sh` covers all 9 endpoints
  and every documented error code end-to-end (35 assertions), but it is not a
  substitute for unit and integration tests.
- **A menu/catalogue table.** Items are free text with a price typed per order,
  exactly as the contract models them. A real system would reference a `menu_items`
  table so prices and names stay consistent.
- **An order status audit log.** Knowing *when* an order became `READY`, and who
  changed it, is what makes the "operational performance" reporting in the brief
  possible. Only the current status and `updated_at` are stored today.
- **Multi-location support.** The brief mentions a chain with "multiple locations",
  but nothing in the data model or contract references a location. Flagged as the
  most likely next schema change.

> **Question:** is per-location scoping planned for v2? It affects the schema
> (a `locations` table plus a `location_id` on `orders`) and every list endpoint,
> so it is far cheaper to design in now than to retrofit.
