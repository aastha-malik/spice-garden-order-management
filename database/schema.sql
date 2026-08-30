-- Spice Garden - Order Management System
-- Schema. Re-runnable: drops and recreates everything.

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP SEQUENCE IF EXISTS order_number_seq CASCADE;
DROP FUNCTION IF EXISTS recalc_order_totals() CASCADE;
DROP FUNCTION IF EXISTS touch_updated_at() CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TYPE order_status AS ENUM (
    'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'
);

-- Keeps updated_at honest without the application having to remember.
CREATE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------- customers
CREATE TABLE customers (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL CHECK (length(trim(name)) > 0),
    email      TEXT        NULL,
    -- Phone is the natural key for a walk-in customer: it is how staff
    -- identify a repeat diner, so it carries the uniqueness constraint.
    phone      TEXT        NOT NULL UNIQUE CHECK (length(trim(phone)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER customers_touch_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX customers_name_idx  ON customers (lower(name));
CREATE INDEX customers_phone_idx ON customers (phone);


-- ------------------------------------------------------------------- orders
-- Human-facing order numbers (ORD-1001, ORD-1002, ...) are drawn from a
-- sequence so they stay short, sortable and gap-tolerant under concurrency.
CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT         NOT NULL UNIQUE
                              DEFAULT ('ORD-' || nextval('order_number_seq')),
    customer_id  UUID         NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
    status       order_status NOT NULL DEFAULT 'CONFIRMED',
    -- Denormalised: the API returns both on every order, including in list
    -- responses. Maintained by trigger (see recalc_order_totals) so they can
    -- never drift from order_items.
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    item_count   INTEGER        NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TRIGGER orders_touch_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE INDEX orders_status_idx       ON orders (status);
CREATE INDEX orders_customer_id_idx  ON orders (customer_id);
CREATE INDEX orders_created_at_idx   ON orders (created_at DESC);
CREATE INDEX orders_order_number_idx ON orders (order_number);


-- -------------------------------------------------------------- order_items
CREATE TABLE order_items (
    id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID           NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    item_name   TEXT           NOT NULL CHECK (length(trim(item_name)) > 0),
    quantity    INTEGER        NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    -- Generated: line total cannot be written independently, so it can never
    -- contradict quantity x unit_price.
    total_price NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id, created_at);


-- Recompute the denormalised order totals after any item change.
-- item_count is the sum of quantities (total dishes), not the number of lines.
CREATE FUNCTION recalc_order_totals() RETURNS TRIGGER AS $$
DECLARE
    target_order UUID := COALESCE(NEW.order_id, OLD.order_id);
BEGIN
    UPDATE orders o
       SET total_amount = COALESCE((SELECT SUM(i.total_price)
                                      FROM order_items i
                                     WHERE i.order_id = target_order), 0),
           item_count   = COALESCE((SELECT SUM(i.quantity)
                                      FROM order_items i
                                     WHERE i.order_id = target_order), 0),
           updated_at   = now()
     WHERE o.id = target_order;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_recalc_totals
    AFTER INSERT OR UPDATE OR DELETE ON order_items
    FOR EACH ROW EXECUTE FUNCTION recalc_order_totals();
