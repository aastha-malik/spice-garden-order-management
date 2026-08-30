#!/usr/bin/env bash
# End-to-end check of every endpoint and every documented error code.
# Usage: bash scripts/smoke.sh [base_url]
set -uo pipefail

BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0

# check <label> <expected_status> <expected_substring|-> <curl args...>
check() {
  local label="$1" want="$2" needle="$3"; shift 3
  local out code body
  out=$(curl -s -w $'\n%{http_code}' "$@")
  code=$(printf '%s' "$out" | tail -n1)
  body=$(printf '%s' "$out" | sed '$d')

  if [[ "$code" != "$want" ]]; then
    printf '  FAIL  %-52s expected %s got %s\n        %s\n' "$label" "$want" "$code" "${body:0:160}"
    FAIL=$((FAIL+1)); return
  fi
  if [[ "$needle" != "-" && "$body" != *"$needle"* ]]; then
    printf '  FAIL  %-52s missing %s\n        %s\n' "$label" "$needle" "${body:0:160}"
    FAIL=$((FAIL+1)); return
  fi
  printf '  ok    %-52s %s\n' "$label" "$code"
  PASS=$((PASS+1))
}

json() { printf '%s' "$1"; }
jget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1"; }

echo "== Spice Garden API smoke test against $BASE =="

echo
echo "-- customers --"
check "GET /customers"                      200 '"pagination"' "$BASE/customers"
check "GET /customers?search=Aarav"         200 'Aarav'        "$BASE/customers?search=Aarav"
check "GET /customers?page=0 -> bad filter" 400 'INVALID_FILTER' "$BASE/customers?page=0"
check "GET /customers?size=abc -> bad"      400 'INVALID_FILTER' "$BASE/customers?size=abc"

PHONE="+9199$(date +%H%M%S)$RANDOM"
NEW_CUSTOMER=$(curl -s -X POST "$BASE/customers" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"email\":null,\"phone\":\"$PHONE\"}")
CUST_ID=$(printf '%s' "$NEW_CUSTOMER" | jget "['data']['id']")
echo "  ..    created customer $CUST_ID"

check "POST /customers duplicate phone"     409 'RESOURCE_ALREADY_EXISTS' \
  -X POST "$BASE/customers" -H 'content-type: application/json' \
  -d "{\"name\":\"Dup\",\"phone\":\"$PHONE\"}"
check "POST /customers missing name"        400 'VALIDATION_FAILED' \
  -X POST "$BASE/customers" -H 'content-type: application/json' -d '{"phone":"+919000000000"}'
check "PATCH /customers/{id}"               200 'Renamed' \
  -X PATCH "$BASE/customers/$CUST_ID" -H 'content-type: application/json' -d '{"name":"Renamed"}'
check "PATCH /customers/{unknown}"          404 'RESOURCE_NOT_FOUND' \
  -X PATCH "$BASE/customers/00000000-0000-4000-8000-000000000000" \
  -H 'content-type: application/json' -d '{"name":"x"}'

echo
echo "-- orders --"
check "GET /orders"                          200 '"pagination"' "$BASE/orders"
check "GET /orders?status=PREPARING"         200 'PREPARING'    "$BASE/orders?status=PREPARING"
check "GET /orders?status=NOPE -> bad"       400 'INVALID_FILTER' "$BASE/orders?status=NOPE"
check "GET /orders?customerId=unknown"       404 'RESOURCE_NOT_FOUND' \
  "$BASE/orders?customerId=00000000-0000-4000-8000-000000000000"
check "GET /orders?search=ORD-1001"          200 'ORD-1001'     "$BASE/orders?search=ORD-1001"

ORDER=$(curl -s -X POST "$BASE/orders" -H 'content-type: application/json' -d "{
  \"customer\": {\"id\": \"$CUST_ID\"},
  \"items\": [{\"itemName\":\"Paneer Tikka\",\"quantity\":2,\"unitPrice\":250.5},
              {\"itemName\":\"Naan\",\"quantity\":3,\"unitPrice\":60}]
}")
ORDER_ID=$(printf '%s' "$ORDER" | jget "['data']['id']")
TOTAL=$(printf '%s' "$ORDER" | jget "['data']['totalAmount']")
COUNT=$(printf '%s' "$ORDER" | jget "['data']['itemCount']")
echo "  ..    created order $ORDER_ID  total=$TOTAL itemCount=$COUNT"
[[ "$TOTAL" == "681.0" || "$TOTAL" == "681" ]] \
  && { echo "  ok    totalAmount computed by trigger (681)"; PASS=$((PASS+1)); } \
  || { echo "  FAIL  totalAmount expected 681 got $TOTAL"; FAIL=$((FAIL+1)); }
[[ "$COUNT" == "5" ]] \
  && { echo "  ok    itemCount = sum of quantities (5)"; PASS=$((PASS+1)); } \
  || { echo "  FAIL  itemCount expected 5 got $COUNT"; FAIL=$((FAIL+1)); }

# totalAmount must serialise as a JSON number, not a string.
printf '%s' "$ORDER" | grep -q '"totalAmount": *[0-9]' \
  && { echo "  ok    totalAmount is a JSON number"; PASS=$((PASS+1)); } \
  || { echo "  FAIL  totalAmount is not a JSON number"; FAIL=$((FAIL+1)); }

check "POST /orders with no items"           400 'VALIDATION_FAILED' \
  -X POST "$BASE/orders" -H 'content-type: application/json' \
  -d "{\"customer\":{\"id\":\"$CUST_ID\"},\"items\":[]}"
check "POST /orders unknown customer"        404 'RESOURCE_NOT_FOUND' \
  -X POST "$BASE/orders" -H 'content-type: application/json' \
  -d '{"customer":{"id":"00000000-0000-4000-8000-000000000000"},"items":[{"itemName":"x","quantity":1,"unitPrice":1}]}'
check "GET /orders/{id}"                     200 "$ORDER_ID" "$BASE/orders/$ORDER_ID"
check "GET /orders/{unknown}"                404 'RESOURCE_NOT_FOUND' \
  "$BASE/orders/00000000-0000-4000-8000-000000000000"

echo
echo "-- order items --"
ITEM_ID=$(printf '%s' "$ORDER" | jget "['data']['items'][0]['id']")
check "POST /orders/{id}/items -> 201"       201 'Gulab Jamun' \
  -X POST "$BASE/orders/$ORDER_ID/items" -H 'content-type: application/json' \
  -d '{"itemName":"Gulab Jamun","quantity":2,"unitPrice":60}'
check "POST items invalid quantity"          400 'VALIDATION_FAILED' \
  -X POST "$BASE/orders/$ORDER_ID/items" -H 'content-type: application/json' \
  -d '{"itemName":"Bad","quantity":0,"unitPrice":10}'
check "DELETE /orders/{id}/items/{item}"     200 '"data"' \
  -X DELETE "$BASE/orders/$ORDER_ID/items/$ITEM_ID"
check "DELETE unknown item"                  404 'RESOURCE_NOT_FOUND' \
  -X DELETE "$BASE/orders/$ORDER_ID/items/00000000-0000-4000-8000-000000000000"

echo
echo "-- status transitions --"
check "CONFIRMED -> READY rejected"          409 'INVALID_STATUS_TRANSITION' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"READY"}'
check "CONFIRMED -> PREPARING"               200 'PREPARING' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"PREPARING"}'
check "PREPARING -> READY"                   200 'READY' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"READY"}'
check "READY: items now immutable"           400 'VALIDATION_FAILED' \
  -X POST "$BASE/orders/$ORDER_ID/items" -H 'content-type: application/json' \
  -d '{"itemName":"Late","quantity":1,"unitPrice":10}'
check "READY -> COMPLETED"                   200 'COMPLETED' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"COMPLETED"}'
check "COMPLETED -> PREPARING rejected"      409 'INVALID_STATUS_TRANSITION' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"PREPARING"}'
check "invalid status value"                 400 'VALIDATION_FAILED' \
  -X PATCH "$BASE/orders/$ORDER_ID/status" -H 'content-type: application/json' -d '{"status":"NOPE"}'

echo
echo "-- last item guard + cascade delete --"
SOLO=$(curl -s -X POST "$BASE/orders" -H 'content-type: application/json' \
  -d "{\"customer\":{\"id\":\"$CUST_ID\"},\"items\":[{\"itemName\":\"Only\",\"quantity\":1,\"unitPrice\":99}]}")
SOLO_ID=$(printf '%s' "$SOLO" | jget "['data']['id']")
SOLO_ITEM=$(printf '%s' "$SOLO" | jget "['data']['items'][0]['id']")
check "cannot delete the last item"          400 'VALIDATION_FAILED' \
  -X DELETE "$BASE/orders/$SOLO_ID/items/$SOLO_ITEM"

check "DELETE /customers/{id} -> 204"        204 '-' -X DELETE "$BASE/customers/$CUST_ID"
check "DELETE /customers/{id} again -> 404"  404 'RESOURCE_NOT_FOUND' -X DELETE "$BASE/customers/$CUST_ID"
check "orders cascaded with customer"        404 'RESOURCE_NOT_FOUND' "$BASE/orders/$ORDER_ID"

echo
echo "================================"
printf 'passed: %s   failed: %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
