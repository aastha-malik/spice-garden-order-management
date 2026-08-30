#!/usr/bin/env bash
# Drops, recreates and re-seeds the database from database/*.sql.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PSQL=(docker-compose -f "$ROOT/docker-compose.yml" exec -T db psql -U spice -d spice_garden -v ON_ERROR_STOP=1 -q)

echo "==> Waiting for Postgres..."
for _ in $(seq 1 30); do
  if docker-compose -f "$ROOT/docker-compose.yml" exec -T db pg_isready -U spice -d spice_garden >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying schema"
"${PSQL[@]}" < "$ROOT/database/schema.sql"

echo "==> Seeding"
"${PSQL[@]}" < "$ROOT/database/seed.sql"

echo "==> Done"
"${PSQL[@]}" -c "SELECT (SELECT count(*) FROM customers) AS customers, (SELECT count(*) FROM orders) AS orders, (SELECT count(*) FROM order_items) AS items;"
