#!/usr/bin/env python3
"""
Contract conformance test for the Spice Garden Order Management System.

Every assertion here is derived directly from the API Contract section of the
assignment brief: exact field names, exact value types, exact HTTP status
codes, and every error row in every "Possible Errors" table.

Usage:  python3 tests/contract_test.py [base_url]
"""
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

PASS, FAIL = 0, 0
FAILURES = []


def call(method, path, body=None):
    """Returns (status, parsed_json_or_None, raw_text)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None), raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw), raw
        except json.JSONDecodeError:
            return e.code, None, raw


def check(label, condition, detail=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  \033[32mok\033[0m   {label}")
    else:
        FAIL += 1
        FAILURES.append(f"{label} — {detail}")
        print(f"  \033[31mFAIL\033[0m {label}\n         {detail}")


def section(title):
    print(f"\n\033[1m{title}\033[0m")


# --------------------------------------------------------------- shape checks
def is_timestamptz(value):
    """Contract types createdAt/updatedAt as <timestampz>."""
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    # Must carry timezone information, not just a naive local time.
    return value.endswith("Z") or "+" in value[10:] or "-" in value[10:]


CUSTOMER_FIELDS = {"id", "name", "email", "phone", "createdAt", "updatedAt"}
ORDER_FIELDS = {
    "id", "orderNumber", "customerId", "status", "totalAmount", "itemCount",
    "createdAt", "updatedAt", "customer", "items",
}
ITEM_FIELDS = {"itemName", "quantity", "unitPrice", "totalPrice"}
STATUSES = {"CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"}


def customer_problems(c, where):
    """Validates one Customer object against the contract."""
    p = []
    if not isinstance(c, dict):
        return [f"{where}: not an object"]
    missing = CUSTOMER_FIELDS - set(c)
    if missing:
        p.append(f"{where}: missing {sorted(missing)}")
    extra = set(c) - CUSTOMER_FIELDS
    if extra:
        p.append(f"{where}: undocumented fields {sorted(extra)}")
    if "id" in c and not isinstance(c["id"], str):
        p.append(f"{where}: id must be string, got {type(c['id']).__name__}")
    if "name" in c and not isinstance(c["name"], str):
        p.append(f"{where}: name must be string")
    if "email" in c and not (c["email"] is None or isinstance(c["email"], str)):
        p.append(f"{where}: email must be string or null")
    if "phone" in c and not isinstance(c["phone"], str):
        p.append(f"{where}: phone must be string")
    for f in ("createdAt", "updatedAt"):
        if f in c and not is_timestamptz(c[f]):
            p.append(f"{where}: {f} is not a timestamptz — got {c[f]!r}")
    return p


def order_problems(o, where):
    """Validates one OrderDetails object against the contract."""
    p = []
    if not isinstance(o, dict):
        return [f"{where}: not an object"]
    missing = ORDER_FIELDS - set(o)
    if missing:
        p.append(f"{where}: missing {sorted(missing)}")
    extra = set(o) - ORDER_FIELDS
    if extra:
        p.append(f"{where}: undocumented fields {sorted(extra)}")

    for f in ("id", "orderNumber", "customerId"):
        if f in o and not isinstance(o[f], str):
            p.append(f"{where}: {f} must be string")
    if "status" in o and o["status"] not in STATUSES:
        p.append(f"{where}: status {o['status']!r} not in the documented enum")
    # bool is a subclass of int in Python; exclude it explicitly.
    if "totalAmount" in o and (isinstance(o["totalAmount"], bool)
                               or not isinstance(o["totalAmount"], (int, float))):
        p.append(f"{where}: totalAmount must be a number, got "
                 f"{type(o['totalAmount']).__name__} ({o['totalAmount']!r})")
    if "itemCount" in o and (isinstance(o["itemCount"], bool)
                             or not isinstance(o["itemCount"], int)):
        p.append(f"{where}: itemCount must be an integer, got "
                 f"{type(o['itemCount']).__name__}")
    for f in ("createdAt", "updatedAt"):
        if f in o and not is_timestamptz(o[f]):
            p.append(f"{where}: {f} is not a timestamptz — got {o[f]!r}")

    if "customer" in o:
        p += customer_problems(o["customer"], f"{where}.customer")
    if "customerId" in o and isinstance(o.get("customer"), dict):
        if o["customerId"] != o["customer"].get("id"):
            p.append(f"{where}: customerId does not match customer.id")

    if "items" in o:
        if not isinstance(o["items"], list):
            p.append(f"{where}: items must be an array")
        else:
            for i, it in enumerate(o["items"]):
                w = f"{where}.items[{i}]"
                if not ITEM_FIELDS <= set(it):
                    p.append(f"{w}: missing {sorted(ITEM_FIELDS - set(it))}")
                    continue
                if not isinstance(it["itemName"], str):
                    p.append(f"{w}: itemName must be string")
                if isinstance(it["quantity"], bool) or not isinstance(it["quantity"], int):
                    p.append(f"{w}: quantity must be an integer")
                for f in ("unitPrice", "totalPrice"):
                    if isinstance(it[f], bool) or not isinstance(it[f], (int, float)):
                        p.append(f"{w}: {f} must be a number, got "
                                 f"{type(it[f]).__name__} ({it[f]!r})")
                if abs(it["quantity"] * it["unitPrice"] - it["totalPrice"]) > 0.001:
                    p.append(f"{w}: totalPrice != quantity * unitPrice")
    return p


def pagination_problems(meta, where):
    """ApiResponse.meta.pagination shape."""
    if not isinstance(meta, dict) or "pagination" not in meta:
        return [f"{where}: meta.pagination missing"]
    pg = meta["pagination"]
    p = []
    for f in ("page", "size", "total", "totalPages"):
        if f not in pg:
            p.append(f"{where}: pagination.{f} missing")
        elif isinstance(pg[f], bool) or not isinstance(pg[f], int):
            p.append(f"{where}: pagination.{f} must be an integer, got {pg[f]!r}")
    return p


def error_problems(body, expected_code, where):
    """ApiError shape: { error: { code, message } }."""
    p = []
    if not isinstance(body, dict) or "error" not in body:
        return [f"{where}: response is not an ApiError object — got {body!r}"]
    err = body["error"]
    if set(err) != {"code", "message"}:
        p.append(f"{where}: error object must have exactly code+message, got {sorted(err)}")
    if err.get("code") != expected_code:
        p.append(f"{where}: expected code {expected_code}, got {err.get('code')!r}")
    if not isinstance(err.get("message"), str) or not err.get("message"):
        p.append(f"{where}: message must be a non-empty string")
    return p


def expect_error(label, method, path, code, expected_code, body=None):
    st, js, _ = call(method, path, body)
    if st != code:
        check(label, False, f"expected HTTP {code}, got {st}: {js}")
        return
    probs = error_problems(js, expected_code, label)
    check(label, not probs, "; ".join(probs))


# =============================================================== the test run
print(f"\033[1mContract conformance — {BASE}\033[0m")
print("Assertions derived from the assignment's API Contract section.")

# ------------------------------------------------------- GET /customers
section("GET /customers  →  200 ApiResponse<Customer[]>")
st, js, _ = call("GET", "/customers")
check("returns 200", st == 200, f"got {st}")
check("body has 'data'", isinstance(js, dict) and "data" in js, f"got {js}")
check("data is an array", isinstance(js.get("data"), list))
probs = []
for i, c in enumerate(js.get("data", [])):
    probs += customer_problems(c, f"data[{i}]")
check("every Customer matches the contract exactly", not probs, "; ".join(probs[:4]))
check("meta.pagination present and integer-typed",
      not pagination_problems(js.get("meta"), "meta"),
      "; ".join(pagination_problems(js.get("meta"), "meta")))

st, js2, _ = call("GET", "/customers?search=Aarav")
check("search filters the result set",
      st == 200 and all("aarav" in c["name"].lower() or "aarav" in (c["email"] or "").lower()
                        for c in js2["data"]) and len(js2["data"]) >= 1,
      f"got {[c['name'] for c in js2.get('data', [])]}")

st, js3, _ = call("GET", "/customers?page=1&size=3")
check("size caps the page length", st == 200 and len(js3["data"]) <= 3, f"got {len(js3.get('data', []))}")
check("pagination echoes the request", js3["meta"]["pagination"]["size"] == 3
      and js3["meta"]["pagination"]["page"] == 1, f"got {js3.get('meta')}")

section("GET /customers  →  INVALID_FILTER")
expect_error("page not valid (page=0)",    "GET", "/customers?page=0",     400, "INVALID_FILTER")
expect_error("page not valid (page=abc)",  "GET", "/customers?page=abc",   400, "INVALID_FILTER")
expect_error("page not valid (page=-1)",   "GET", "/customers?page=-1",    400, "INVALID_FILTER")
expect_error("size not valid (size=0)",    "GET", "/customers?size=0",     400, "INVALID_FILTER")
expect_error("size not valid (size=abc)",  "GET", "/customers?size=abc",   400, "INVALID_FILTER")
expect_error("size not valid (size=1.5)",  "GET", "/customers?size=1.5",   400, "INVALID_FILTER")

# ------------------------------------------------------- POST /customers
section("POST /customers  →  201 ApiResponse<Customer>")
import random
phone = f"+9199{random.randint(10000000, 99999999)}"
st, js, _ = call("POST", "/customers", {"name": "Contract Test", "email": None, "phone": phone})
check("returns 201 Created", st == 201, f"got {st}: {js}")
probs = customer_problems(js.get("data", {}), "data")
check("Customer matches the contract exactly", not probs, "; ".join(probs))
check("no pagination on a non-paginated endpoint", "meta" not in js or js.get("meta") is None,
      f"got meta={js.get('meta')}")
check("email accepts null", js["data"]["email"] is None, f"got {js['data']['email']!r}")
CUST_ID = js["data"]["id"]

st, js, _ = call("POST", "/customers", {"name": "With Email", "email": f"c{random.randint(1,10**6)}@ex.com",
                                        "phone": f"+9198{random.randint(10000000, 99999999)}"})
check("email accepts a string", st == 201 and isinstance(js["data"]["email"], str), f"got {js}")
CUST_ID_2 = js["data"]["id"]

section("POST /customers  →  VALIDATION_FAILED / RESOURCE_ALREADY_EXISTS")
expect_error("required field missing (no name)", "POST", "/customers", 400, "VALIDATION_FAILED",
             {"phone": "+919000000001"})
expect_error("required field missing (no phone)", "POST", "/customers", 400, "VALIDATION_FAILED",
             {"name": "No Phone"})
expect_error("wrong type (name is a number)", "POST", "/customers", 400, "VALIDATION_FAILED",
             {"name": 12345, "phone": "+919000000002"})
expect_error("wrong type (phone is a number)", "POST", "/customers", 400, "VALIDATION_FAILED",
             {"name": "Bad Phone", "phone": 919000000003})
expect_error("wrong type (email is not an email)", "POST", "/customers", 400, "VALIDATION_FAILED",
             {"name": "Bad Email", "email": "not-an-email", "phone": "+919000000004"})
expect_error("duplicate phone number", "POST", "/customers", 409, "RESOURCE_ALREADY_EXISTS",
             {"name": "Duplicate", "phone": phone})

# ------------------------------------------------------- PATCH /customers/{id}
section("PATCH /customers/{id}  →  200 ApiResponse<Customer>")
st, js, _ = call("PATCH", f"/customers/{CUST_ID}", {"name": "Renamed Contract"})
check("returns 200", st == 200, f"got {st}: {js}")
check("all fields optional — name only is accepted", js["data"]["name"] == "Renamed Contract",
      f"got {js.get('data', {}).get('name')!r}")
probs = customer_problems(js.get("data", {}), "data")
check("Customer matches the contract exactly", not probs, "; ".join(probs))

st, js, _ = call("PATCH", f"/customers/{CUST_ID_2}", {"email": None})
check("email can be cleared to null", st == 200 and js["data"]["email"] is None, f"got {js}")

st, js, _ = call("PATCH", f"/customers/{CUST_ID}", {"phone": f"+9197{random.randint(10000000,99999999)}"})
check("phone alone is accepted", st == 200, f"got {st}: {js}")

section("PATCH /customers/{id}  →  errors")
expect_error("customer does not exist", "PATCH",
             "/customers/00000000-0000-4000-8000-000000000000", 404, "RESOURCE_NOT_FOUND",
             {"name": "Ghost"})
expect_error("wrong type (name is a number)", "PATCH", f"/customers/{CUST_ID}",
             400, "VALIDATION_FAILED", {"name": 999})
expect_error("phone already taken by another customer", "PATCH", f"/customers/{CUST_ID}",
             409, "RESOURCE_ALREADY_EXISTS", {"phone": phone})

# ------------------------------------------------------- GET /orders
section("GET /orders  →  200 ApiResponse<OrderDetail[]>")
st, js, _ = call("GET", "/orders")
check("returns 200", st == 200, f"got {st}")
check("data is an array", isinstance(js.get("data"), list))
probs = []
for i, o in enumerate(js.get("data", [])):
    probs += order_problems(o, f"data[{i}]")
check("every OrderDetail matches the contract exactly", not probs, "; ".join(probs[:4]))
check("meta.pagination present and integer-typed",
      not pagination_problems(js.get("meta"), "meta"),
      "; ".join(pagination_problems(js.get("meta"), "meta")))
check("list embeds the full customer object",
      all(isinstance(o["customer"], dict) for o in js["data"]))
check("list embeds the items array",
      all(isinstance(o["items"], list) for o in js["data"]))

for s in sorted(STATUSES):
    st, jz, _ = call("GET", f"/orders?status={s}")
    check(f"status={s} returns only {s}",
          st == 200 and all(o["status"] == s for o in jz["data"]),
          f"got {[o['status'] for o in jz.get('data', [])]}")

st, js, _ = call("GET", f"/orders?customerId={CUST_ID}")
check("customerId filters to that customer",
      st == 200 and all(o["customerId"] == CUST_ID for o in js["data"]), f"got {st}")

st, js, _ = call("GET", "/orders?search=ORD-1001")
check("search matches on orderNumber",
      st == 200 and any(o["orderNumber"] == "ORD-1001" for o in js["data"]),
      f"got {[o['orderNumber'] for o in js.get('data', [])]}")
st, js, _ = call("GET", "/orders?search=Priya")
check("search matches on customer name",
      st == 200 and len(js["data"]) > 0 and all("priya" in o["customer"]["name"].lower() for o in js["data"]),
      f"got {[o['customer']['name'] for o in js.get('data', [])]}")

section("GET /orders  →  INVALID_FILTER / RESOURCE_NOT_FOUND")
expect_error("page not valid",   "GET", "/orders?page=0",        400, "INVALID_FILTER")
expect_error("size not valid",   "GET", "/orders?size=xyz",      400, "INVALID_FILTER")
expect_error("status not valid", "GET", "/orders?status=COOKING", 400, "INVALID_FILTER")
expect_error("status wrong case", "GET", "/orders?status=confirmed", 400, "INVALID_FILTER")
expect_error("customer does not exist", "GET",
             "/orders?customerId=00000000-0000-4000-8000-000000000000", 404, "RESOURCE_NOT_FOUND")

# ------------------------------------------------------- POST /orders
section("POST /orders  →  201 ApiResponse<OrderDetail>")
st, js, _ = call("POST", "/orders", {
    "customer": {"id": CUST_ID},
    "items": [{"itemName": "Paneer Tikka", "quantity": 2, "unitPrice": 250.50},
              {"itemName": "Butter Naan", "quantity": 3, "unitPrice": 60}],
})
check("returns 201 Created", st == 201, f"got {st}: {js}")
probs = order_problems(js.get("data", {}), "data")
check("OrderDetail matches the contract exactly", not probs, "; ".join(probs))
check("no pagination on a non-paginated endpoint", "meta" not in js or js.get("meta") is None,
      f"got meta={js.get('meta')}")
ORDER = js["data"]
ORDER_ID = ORDER["id"]
check("existing customer id is honoured", ORDER["customerId"] == CUST_ID)
check("totalAmount = sum of line totals (2*250.50 + 3*60 = 681)",
      abs(ORDER["totalAmount"] - 681) < 0.001, f"got {ORDER['totalAmount']}")
check("new order starts in CONFIRMED", ORDER["status"] == "CONFIRMED", f"got {ORDER['status']}")
check("orderNumber is populated", bool(ORDER["orderNumber"]), f"got {ORDER['orderNumber']!r}")

# Customer id absent → create the customer from the supplied details.
new_phone = f"+9196{random.randint(10000000, 99999999)}"
st, js, _ = call("POST", "/orders", {
    "customer": {"id": None, "name": "Walk In", "email": None, "phone": new_phone},
    "items": [{"itemName": "Masala Dosa", "quantity": 1, "unitPrice": 180}],
})
check("customer id null → customer is created", st == 201, f"got {st}: {js}")
check("created customer carries the supplied details",
      js["data"]["customer"]["name"] == "Walk In" and js["data"]["customer"]["phone"] == new_phone,
      f"got {js['data']['customer']}")
probs = order_problems(js.get("data", {}), "data")
check("OrderDetail matches the contract exactly", not probs, "; ".join(probs))
CREATED_CUST = js["data"]["customerId"]

st, js, _ = call("POST", "/orders", {
    "customer": {"name": "Omitted Id", "phone": f"+9195{random.randint(10000000,99999999)}"},
    "items": [{"itemName": "Idli", "quantity": 2, "unitPrice": 70}],
})
check("customer id omitted entirely → customer is created", st == 201, f"got {st}: {js}")

section("POST /orders  →  VALIDATION_FAILED / RESOURCE_NOT_FOUND")
expect_error("order must contain at least one item", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}, "items": []})
expect_error("items key missing entirely", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}})
expect_error("customer key missing entirely", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"items": [{"itemName": "X", "quantity": 1, "unitPrice": 10}]})
expect_error("wrong type (quantity is a string)", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}, "items": [{"itemName": "X", "quantity": "two", "unitPrice": 10}]})
expect_error("wrong type (quantity is fractional)", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}, "items": [{"itemName": "X", "quantity": 1.5, "unitPrice": 10}]})
expect_error("wrong type (unitPrice is a string)", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}, "items": [{"itemName": "X", "quantity": 1, "unitPrice": "ten"}]})
expect_error("item field missing (no itemName)", "POST", "/orders", 400, "VALIDATION_FAILED",
             {"customer": {"id": CUST_ID}, "items": [{"quantity": 1, "unitPrice": 10}]})
expect_error("customer does not exist", "POST", "/orders", 404, "RESOURCE_NOT_FOUND",
             {"customer": {"id": "00000000-0000-4000-8000-000000000000"},
              "items": [{"itemName": "X", "quantity": 1, "unitPrice": 10}]})

# ------------------------------------------------------- GET /orders/{order_id}
section("GET /orders/{order_id}  →  200 ApiResponse<OrderDetail>")
st, js, _ = call("GET", f"/orders/{ORDER_ID}")
check("returns 200", st == 200, f"got {st}")
probs = order_problems(js.get("data", {}), "data")
check("OrderDetail matches the contract exactly", not probs, "; ".join(probs))
check("no pagination on a non-paginated endpoint", "meta" not in js or js.get("meta") is None,
      f"got meta={js.get('meta')}")
check("returns the requested order", js["data"]["id"] == ORDER_ID)
expect_error("order does not exist", "GET",
             "/orders/00000000-0000-4000-8000-000000000000", 404, "RESOURCE_NOT_FOUND")

# ------------------------------------------------------- POST /orders/{id}/items
section("POST /orders/{order_id}/items  →  201 ApiResponse<OrderDetail>")
before = js["data"]["totalAmount"]
st, js, _ = call("POST", f"/orders/{ORDER_ID}/items",
                 {"itemName": "Gulab Jamun", "quantity": 2, "unitPrice": 60})
check("returns 201 Created", st == 201, f"got {st}: {js}")
probs = order_problems(js.get("data", {}), "data")
check("returns the full OrderDetail", not probs, "; ".join(probs))
check("the new item is present",
      any(i["itemName"] == "Gulab Jamun" for i in js["data"]["items"]))
check("totalAmount is recalculated (681 + 120 = 801)",
      abs(js["data"]["totalAmount"] - (before + 120)) < 0.001,
      f"got {js['data']['totalAmount']}, expected {before + 120}")
ITEM_ID = next(i for i in js["data"]["items"] if i["itemName"] == "Gulab Jamun")["id"]

expect_error("order does not exist", "POST",
             "/orders/00000000-0000-4000-8000-000000000000/items", 404, "RESOURCE_NOT_FOUND",
             {"itemName": "X", "quantity": 1, "unitPrice": 10})
expect_error("required field missing (no itemName)", "POST", f"/orders/{ORDER_ID}/items",
             400, "VALIDATION_FAILED", {"quantity": 1, "unitPrice": 10})
expect_error("wrong type (quantity is a string)", "POST", f"/orders/{ORDER_ID}/items",
             400, "VALIDATION_FAILED", {"itemName": "X", "quantity": "1", "unitPrice": 10})
expect_error("wrong type (negative unitPrice)", "POST", f"/orders/{ORDER_ID}/items",
             400, "VALIDATION_FAILED", {"itemName": "X", "quantity": 1, "unitPrice": -5})

# ------------------------------------------------------- DELETE item
section("DELETE /orders/{order_id}/items/{item_id}  →  200 ApiResponse<OrderDetail>")
st, js, _ = call("DELETE", f"/orders/{ORDER_ID}/items/{ITEM_ID}")
check("returns 200 OK", st == 200, f"got {st}: {js}")
probs = order_problems(js.get("data", {}), "data")
check("returns the full OrderDetail", not probs, "; ".join(probs))
check("the item is gone",
      all(i["id"] != ITEM_ID for i in js["data"]["items"]))
check("totalAmount is recalculated back to 681",
      abs(js["data"]["totalAmount"] - 681) < 0.001, f"got {js['data']['totalAmount']}")

expect_error("order does not exist", "DELETE",
             f"/orders/00000000-0000-4000-8000-000000000000/items/{ITEM_ID}",
             404, "RESOURCE_NOT_FOUND")
expect_error("order item does not exist", "DELETE",
             f"/orders/{ORDER_ID}/items/00000000-0000-4000-8000-000000000000",
             404, "RESOURCE_NOT_FOUND")

# ------------------------------------------------------- PATCH status
section("PATCH /orders/{order_id}/status  →  200 ApiResponse<OrderDetail>")
st, js, _ = call("PATCH", f"/orders/{ORDER_ID}/status", {"status": "PREPARING"})
check("returns 200", st == 200, f"got {st}: {js}")
probs = order_problems(js.get("data", {}), "data")
check("returns the full OrderDetail", not probs, "; ".join(probs))
check("status is updated", js["data"]["status"] == "PREPARING", f"got {js['data']['status']}")

expect_error("order does not exist", "PATCH",
             "/orders/00000000-0000-4000-8000-000000000000/status",
             404, "RESOURCE_NOT_FOUND", {"status": "PREPARING"})
expect_error("required field missing (no status)", "PATCH", f"/orders/{ORDER_ID}/status",
             400, "VALIDATION_FAILED", {})
expect_error("wrong type (status not in enum)", "PATCH", f"/orders/{ORDER_ID}/status",
             400, "VALIDATION_FAILED", {"status": "COOKING"})
expect_error("wrong type (status is a number)", "PATCH", f"/orders/{ORDER_ID}/status",
             400, "VALIDATION_FAILED", {"status": 1})
expect_error("transition not allowed (PREPARING → CONFIRMED)", "PATCH",
             f"/orders/{ORDER_ID}/status", 409, "INVALID_STATUS_TRANSITION", {"status": "CONFIRMED"})
expect_error("transition not allowed (PREPARING → COMPLETED)", "PATCH",
             f"/orders/{ORDER_ID}/status", 409, "INVALID_STATUS_TRANSITION", {"status": "COMPLETED"})

st, js, _ = call("PATCH", f"/orders/{ORDER_ID}/status", {"status": "READY"})
check("PREPARING → READY allowed", st == 200 and js["data"]["status"] == "READY", f"got {st}")
st, js, _ = call("PATCH", f"/orders/{ORDER_ID}/status", {"status": "COMPLETED"})
check("READY → COMPLETED allowed", st == 200 and js["data"]["status"] == "COMPLETED", f"got {st}")
expect_error("terminal state is terminal (COMPLETED → PREPARING)", "PATCH",
             f"/orders/{ORDER_ID}/status", 409, "INVALID_STATUS_TRANSITION", {"status": "PREPARING"})

# cancellation path on a separate order
st, js, _ = call("POST", "/orders", {"customer": {"id": CUST_ID},
                                     "items": [{"itemName": "Chai", "quantity": 1, "unitPrice": 40}]})
CANCEL_ID = js["data"]["id"]
st, js, _ = call("PATCH", f"/orders/{CANCEL_ID}/status", {"status": "CANCELLED"})
check("CONFIRMED → CANCELLED allowed", st == 200 and js["data"]["status"] == "CANCELLED", f"got {st}")
expect_error("terminal state is terminal (CANCELLED → CONFIRMED)", "PATCH",
             f"/orders/{CANCEL_ID}/status", 409, "INVALID_STATUS_TRANSITION", {"status": "CONFIRMED"})

# ------------------------------------------------------- DELETE /customers/{id}
section("DELETE /customers/{id}  →  204 No Content")
st, js, raw = call("DELETE", f"/customers/{CREATED_CUST}")
check("returns 204", st == 204, f"got {st}")
check("body is empty", raw == "", f"got {raw!r}")
expect_error("customer does not exist", "DELETE", f"/customers/{CREATED_CUST}",
             404, "RESOURCE_NOT_FOUND")
expect_error("id that was never a customer", "DELETE",
             "/customers/00000000-0000-4000-8000-000000000000", 404, "RESOURCE_NOT_FOUND")

# ------------------------------------------------------- summary
print("\n" + "=" * 70)
if FAILURES:
    print(f"\033[31m{FAIL} FAILED\033[0m, {PASS} passed\n")
    for f in FAILURES:
        print(f"  ✗ {f}")
    sys.exit(1)
print(f"\033[32mALL {PASS} ASSERTIONS PASSED\033[0m")
