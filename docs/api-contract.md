# Brightloop Subscription API Contract
**Version 1.0 — canonical contract**

## Overview

This API contract defines all endpoint shapes, authentication, RBAC, real-time patterns, and the pure billing engine. It is based on `db/schema.sql`; a route for data not yet represented in the schema requires an append-only migration before it can ship.

The **Canonical conventions** below override older illustrative response snippets later in this document. Feature owners must update this file before changing a public shape.

Implementation responsibility is divided:

- **Agent A:** Auth routes, outbox, user portal
- **Agent B:** Billing/payments services, real-time SSE, database health
- **Agent C:** Catalog routes, subscription lifecycle, reports

### Canonical conventions

- All product endpoints use the `/api` prefix. `GET /health` is the sole public exception.
- Success payloads are `{ "data": ... }`; list payloads are `{ "data": [...], "meta": { "page", "pageSize", "total" } }`. Logout may return `204 No Content`.
- Errors are `{ "error": { "code", "message", "details?" } }`. `details` is structured validation information and never a stack trace.
- Lists accept `page` (default `1`) and `pageSize` (default `20`, maximum `100`), plus only the documented filters. SQL must use parameterized values.
- Identifiers are positive integers. Timestamps are ISO 8601 strings; dates use `YYYY-MM-DD`.
- Mutating endpoints validate request bodies with Zod. Money and quantity are decimal strings; application code uses `decimal.js`, and persisted money remains `NUMERIC(12,2)`.
- Calls are customer-scoped from the authenticated session. A request never accepts an arbitrary `customer_id` to widen access.

---

## Authentication & Authorization

### Cookie-based Session Auth
- All endpoints (except `/health`) require a valid httpOnly session cookie: `session=<id>`
- Sessions stored in database (managed by Agent A)
- RBAC roles: `admin`, `user`, `viewer`
- Customer scope enforcement: users can only access resources for their customer_id

### Error Response (Unauthorized)
```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required"
  }
}
```

---

## Core Data Types & Money Handling

### Decimal Strings (Exact Arithmetic)
All monetary amounts are transmitted as **decimal strings** to avoid IEEE 754 floating-point errors.

```typescript
type Money = string; // e.g., "99.99", "0.01", "1234567.89"
type Quantity = string; // e.g., "1.00", "10.50"
```

Database storage: `NUMERIC(12,2)` for exact arithmetic.
Application: Use `decimal.js` for computations.

### Example Request
```json
{
  "quantity": "2.50",
  "unit_price": "99.99",
  "tax_rate": "0.0825"
}
```

---

## Health & System

### GET /health
**Public endpoint (no auth required)**

Returns database connectivity and server status.

**Response 200 OK**
```json
{
  "data": {
    "status": "ok",
    "timestamp": "2024-11-01T10:30:00Z",
    "database": {
      "connected": true,
      "timestamp": "2024-11-01T10:30:00Z"
    }
  }
}
```

**Response 503 Service Unavailable (DB down)**
```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database connection failed"
  }
}
```

---

## Auth Routes (Agent A)

### POST /api/auth/login
Login with email and password.

**Request**
```json
{
  "email": "user@company.local",
  "password": "secret"
}
```

**Response 200 OK**
Sets `session` cookie; user customer_id inferred from user record.
```json
{
  "data": {
    "user": {
      "id": 123,
      "email": "user@company.local",
      "customer_id": 456,
      "role": "admin"
    }
  }
}
```

**Response 401 Unauthorized**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid credentials"
  }
}
```

### POST /api/auth/logout
Clear session.

**Response 204 No Content**

### POST /api/auth/request-reset
Request password reset token (single-use, expiring).

**Request**
```json
{
  "email": "user@company.local"
}
```

**Response 200 OK** (always, no user enumeration)
```json
{
  "data": {
    "message": "Reset link sent if account exists"
  }
}
```

Implementation: creates reset token (hashed in DB), sends via email_outbox.

---

## Billing Routes (Agent B)

### GET /api/invoices
List invoices for authenticated user's customer. Paginated.

**Query Parameters**
- `status`: Draft, Confirmed, Paid, Cancelled (optional)
- `page`: default 1
- `pageSize`: default 20, max 100
- `sort`: `created_at`, `due_date`, `total` (default: `due_date` DESC)

**Response 200 OK**
```json
{
  "data": [
    {
      "id": 789,
      "invoice_number": "INV-2024-001",
      "subscription_id": 456,
      "period_start": "2024-11-01",
      "period_end": "2024-11-30",
      "subtotal": "99.99",
      "tax_amount": "8.25",
      "discount_total": "0.00",
      "total": "108.24",
      "status": "Confirmed",
      "due_date": "2024-12-15",
      "issued_date": "2024-11-01",
      "created_at": "2024-11-01T09:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}
```

### GET /api/invoices/:id
Fetch a single invoice with line items.

**Response 200 OK**
```json
{
  "id": 789,
  "invoice_number": "INV-2024-001",
  "subscription_id": 456,
  "period_start": "2024-11-01",
  "period_end": "2024-11-30",
  "subtotal": "99.99",
  "tax_amount": "8.25",
  "discount_total": "0.00",
  "total": "108.24",
  "status": "Confirmed",
  "due_date": "2024-12-15",
  "issued_date": "2024-11-01",
  "trace": {
    "considered_rules": [],
    "applied_rules": [],
    "skipped_rules": []
  },
  "line_items": [
    {
      "id": 1001,
      "description": "Monthly Service - Plan XYZ",
      "quantity": "1.00",
      "unit_price": "99.99",
      "line_total": "99.99",
      "tax_rate": "0.0825",
      "tax_amount": "8.25",
      "discount_percent": "0.00",
      "discount_amount": "0.00"
    }
  ],
  "payments": [
    {
      "id": 2001,
      "amount": "108.24",
      "status": "Received",
      "transaction_date": "2024-11-05T14:30:00Z"
    }
  ]
}
```

### POST /api/invoices/:id/confirm
Move invoice from Draft → Confirmed state. Only admin.

**Response 200 OK**
```json
{
  "id": 789,
  "status": "Confirmed"
}
```

**Response 409 Conflict** (if not in Draft)
```json
{
  "error": {
    "code": "INVALID_INVOICE_STATE",
    "message": "Invoice is not in Draft status"
  }
}
```

### POST /api/invoices/:id/charge
Record a payment against invoice. Idempotent: checks invoice is not already paid.

**Request**
```json
{
  "amount": "108.24",
  "payment_method": "card",
  "notes": "Payment received locally"
}
```

**Response 200 OK**
```json
{
  "invoice": {
    "id": 789,
    "status": "Paid"
  },
  "payment": {
    "id": 2001,
    "amount": "108.24",
    "status": "Received",
    "transaction_date": "2024-11-05T14:30:00Z"
  }
}
```

**Response 409 Conflict** (if overpayment or invoice not Confirmed)
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Invoice is not ready for payment or amount exceeds due total"
  }
}
```

**Response 422 Unprocessable** (amount mismatch)
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Amount exceeds outstanding balance"
  }
}
```

---

## Billing Engine: computeInvoice (Pure Function)

**NOT AN ENDPOINT**—called internally by services.

Pure function (no DB reads/writes):
```typescript
computeInvoice(
  subscriptionSnapshot: SubscriptionSnapshot,
  asOfDate: Date,
  rulesSnapshot: RulesSnapshot
): InvoiceComputation
```

### Inputs
```typescript
interface SubscriptionSnapshot {
  id: number;
  plan_id: number;
  period: 'monthly' | 'quarterly' | 'annual';
  quantity: string; // NUMERIC as decimal string
  unit_price: string;
  items: Array<{
    product_variant_id?: number;
    quantity: string;
    unit_price: string;
  }>;
}

interface RulesSnapshot {
  taxes: Array<{ jurisdiction: string; rate: string }>;
  discounts: Array<{
    id: number;
    percent: string;
    applicable_scopes: Array<{ type: 'plan' | 'product'; id: number }>;
  }>;
}
```

### Output
```typescript
interface InvoiceComputation {
  line_items: Array<{
    description: string;
    quantity: string;
    unit_price: string;
    line_total: string;
    tax_rate: string;
    tax_amount: string;
    discount_percent: string;
    discount_amount: string;
  }>;
  subtotal: string;
  tax_amount: string;
  discount_total: string;
  total: string;
  trace: {
    considered_rules: string[];
    applied_rules: string[];
    skipped_rules: string[];
  };
}
```

**Algorithm**
1. Iterate line items; compute subtotal (qty × unit_price per line).
2. Apply applicable discount rules; compute discount_amount per line, decrement subtotal.
3. Compute tax per line: (line_total - discount_amount) × tax_rate.
4. Aggregate totals.
5. Return all values as decimal strings; include trace of rule evaluation.

**Persistence (separate transaction)**
Caller wraps computeInvoice result in database transaction:
1. INSERT invoice with computed totals
2. INSERT invoice_line_items
3. INSERT INTO discount_usage for each applied discount
4. COMMIT

---

## Real-Time: Server-Sent Events (Agent B)

### GET /api/subscribe?channel=<channel>
Opens SSE stream for real-time updates. Requires auth. Customer-scoped.

**Supported Channels**
- `subscription_updated`: subscription status/billing date changes
- `invoice_ready`: invoice moves to Confirmed
- `payment_processed`: payment received against invoice

**Headers**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Customer-Id: <authenticated customer_id>
```

**Event Stream** (example: invoice_ready)
```
event: invoice_ready
data: {"invoice_id": 789, "subscription_id": 456, "due_date": "2024-12-15", "total": "108.24"}

event: invoice_ready
data: {"invoice_id": 790, "subscription_id": 456, "due_date": "2024-12-20", "total": "108.24"}
```

**Implementation**
- Uses Postgres LISTEN/NOTIFY + application event handler
- Enforces customer scope: filters events by authenticated customer_id
- No arbitrary channel exposure; only listed channels allowed
- Reconnect with exponential backoff on client

---

## Subscription Routes (Agent C)

### GET /api/subscriptions
List subscriptions. Paginated, customer-scoped.

**Query Parameters**
- `status`: Active, Paused, Cancelled (optional)
- `page`: default 1
- `pageSize`: default 20, max 100

**Response 200 OK**
```json
{
  "data": [
    {
      "id": 456,
      "subscription_number": "SUB-2024-001",
      "plan_id": 123,
      "customer_id": 999,
      "period": "monthly",
      "quantity": "1.00",
      "unit_price": "99.99",
      "start_date": "2024-11-01",
      "end_date": null,
      "next_billing_date": "2024-12-01",
      "auto_renew": true,
      "status": "Active",
      "created_at": "2024-11-01T08:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 42
  }
}
```

### POST /api/subscriptions
Create new subscription (admin only).

**Request**
```json
{
  "plan_id": 123,
  "period": "monthly",
  "quantity": "1.00",
  "start_date": "2024-11-01",
  "auto_renew": true
}
```

**Response 201 Created**
```json
{
  "id": 456,
  "subscription_number": "SUB-2024-001",
  "plan_id": 123,
  "status": "Active"
}
```

### PATCH /api/subscriptions/:id
Update subscription status (pause, cancel, resume).

**Request**
```json
{
  "status": "Paused"
}
```

**Response 200 OK**
```json
{
  "id": 456,
  "status": "Paused",
  "updated_at": "2024-11-05T10:30:00Z"
}
```

---

## Catalog Routes (Agent C)

### GET /api/plans
List available plans (customer-scoped).

**Response 200 OK**
```json
{
  "data": [
    {
      "id": 123,
      "plan_number": "PLAN-MONTHLY",
      "name": "Monthly Plan",
      "description": "Month-to-month billing",
      "min_quantity": 1,
      "max_quantity": null,
      "available_from": "2024-01-01",
      "available_until": null,
      "pricing": [
        {
          "period": "monthly",
          "price": "99.99"
        }
      ]
    }
  ]
}
```

### GET /api/products
List products and variants (customer-scoped).

### GET /api/taxes
List applicable tax rules (jurisdiction-based).

---

## Outbox & Async Notifications (Agent A)

### GET /api/admin/outbox
Admin page to view pending and sent emails.

**Response 200 OK**
```json
{
  "data": [
    {
      "id": 1,
      "recipient": "user@company.local",
      "subject": "Password Reset",
      "body": "Click here to reset...",
      "sent_at": "2024-11-05T10:30:00Z",
      "error_message": null,
      "retry_count": 0,
      "created_at": "2024-11-05T10:00:00Z"
    }
  ]
}
```

---

## Endpoint ownership and coverage

The detailed examples above preserve the implementation intent for selected routes. This inventory is the complete delivery surface. An entry marked **planned** is a contract reservation, not a claim that the route is implemented. Every list uses the canonical pagination fields unless noted.

| Owner | Method and path | Roles | Query / body | Success `data` |
|---|---|---|---|---|
| Shared | `GET /health` | public | — | API and database health |
| Auth | `POST /api/auth/signup` | public | company name, email, password | user and customer |
| Auth | `POST /api/auth/login` | public | email, password | authenticated user; sets cookie |
| Auth | `POST /api/auth/logout` | authenticated | — | `null`; clears cookie |
| Auth | `GET /api/auth/me` | admin, user, viewer | — | authenticated user |
| Auth | `POST /api/auth/request-reset` | public | email | generic acceptance message |
| Auth | `POST /api/auth/reset` | public | token, new password | `null` |
| Auth | `GET, POST /api/users` | admin | page/pageSize; email, role | paginated users; created user |
| Auth | `PATCH /api/users/:id` | admin | is_active, role | updated user |
| Catalog | `GET, POST /api/products` | authenticated; admin write | page/pageSize, search; sku, name, description | paginated products; created product |
| Catalog | `GET, PATCH /api/products/:id` | authenticated; admin write | product fields | product |
| Catalog | `POST /api/products/:id/variants` | admin | variant_key, description | variant |
| Catalog | `GET, POST /api/taxes` | authenticated; admin write | page/pageSize; jurisdiction, tax_code, rate | paginated tax rules; created tax rule |
| Catalog | `GET, POST /api/plans` | authenticated; admin write | page/pageSize; plan metadata and pricing | paginated plans; created plan |
| Catalog | `GET, PATCH /api/plans/:id` | authenticated; admin write | plan metadata and pricing | plan |
| Catalog | `GET, POST /api/templates` | authenticated; admin write | page/pageSize; name, description, lines | paginated templates; created template |
| Catalog | `GET, PATCH /api/templates/:id` | authenticated; admin write | template metadata and lines | template |
| Subscriptions | `GET, POST /api/subscriptions` | authenticated; admin write | page/pageSize, status; plan_id, period, quantity, start_date, auto_renew | paginated subscriptions; created subscription |
| Subscriptions | `GET, PATCH /api/subscriptions/:id` | authenticated; admin write | status, end_date, auto_renew | subscription and transition history entry |
| Subscriptions | `GET /api/subscriptions/:id/history` | authenticated | page/pageSize | paginated status history |
| Billing | `GET /api/invoices` | authenticated | page/pageSize, status, due date range, sort | paginated invoices |
| Billing | `GET /api/invoices/:id` | authenticated | — | invoice, lines, payments, trace |
| Billing | `POST /api/invoices/:id/confirm` | admin | — | confirmed invoice |
| Billing | `POST /api/invoices/:id/cancel` | admin | reason | cancelled invoice |
| Billing | `POST /api/invoices/:id/send` | admin | — | invoice and queued outbox item |
| Billing | `GET /api/invoices/:id/print` | authenticated | — | print-safe invoice representation |
| Payments | `POST /api/invoices/:id/charge` | admin | amount, payment_method, notes, idempotency key | invoice and payment |
| Payments | `GET /api/payments` | authenticated | page/pageSize, invoice_id, status | paginated payments |
| Billing | `POST /api/billing-runs/preview` **planned** | admin | as_of_date, subscription filters | calculations only; no writes |
| Billing | `POST /api/billing-runs` **planned** | admin | as_of_date, subscription filters, idempotency key | persisted run and invoices |
| Billing | `GET /api/billing-runs` **planned** | admin | page/pageSize | paginated runs |
| Realtime | `GET /api/subscribe?channel=` | authenticated | allowlisted channel | SSE stream scoped to customer |
| Portal | `GET /api/portal/subscriptions` | authenticated | page/pageSize | caller's subscriptions |
| Portal | `GET /api/portal/invoices` | authenticated | page/pageSize, status | caller's invoices |
| Portal | `GET /api/portal/invoices/:id` | authenticated | — | caller's invoice only |
| Reports | `GET /api/reports/dashboard` **planned** | admin, user | date range, status | active count, collected, outstanding, overdue, MRR/ARR |
| Reports | `GET /api/reports/revenue` **planned** | admin, user | date range, grouping | paginated aggregate rows |
| Reports | `GET /api/reports/outstanding` | admin, user | page/pageSize, due date range | paginated outstanding invoices |
| Reports | `GET /api/reports/overdue` | admin, user | page/pageSize, due date range | paginated overdue invoices |
| Reports | `GET /api/reports/mrr` **planned** | admin, user | as_of_date | MRR, ARR, net-new MRR, churn, next-30-day expected billing |
| Leakage | `GET /api/leakage` **planned** | admin | page/pageSize, type, status | findings and estimated amount at risk |
| Leakage | `POST /api/leakage/imports` **planned** | admin | local CSV file | imported and matched/unmatched rows |
| Leakage | `POST /api/leakage/:id/recover` **planned** | admin | recovery action | recovery result; delegates to billing engine |
| Explain | `GET /api/invoices/:id/explain` **planned** | authenticated | — | read-only calculation trace |
| Simulator | `POST /api/simulator/preview` **planned** | admin | hypothetical pricing/rules/date | non-persisted invoice preview |
| Renewals | `GET /api/renewals` **planned** | admin, user | page/pageSize, date range | upcoming renewals |
| Renewals | `POST /api/renewals/:id/chase` **planned** | admin | template / note | queued outbox action |
| Outbox | `GET /api/admin/outbox` | admin | page/pageSize, sent status | paginated outbox email rows |

For role-based access, `admin` mutates tenant records, `user` has permitted operational reads, and `viewer` has read-only access. All three roles remain tenant-scoped. The current schema deliberately uses these three values; `staff` and `customer` must not be introduced without a coordinated migration and contract update.

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Bad request",
    "details": { "field": "invalid" }
  }
}
```

### 401 Unauthorized
```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication is required"
  }
}
```

### 403 Forbidden
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action"
  }
}
```

### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

### 409 Conflict
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "Invoice already paid",
    "details": { "reason": "Invoice already paid" }
  }
}
```

### 422 Unprocessable Entity
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "details": { "field": "value must be positive" }
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred"
  }
}
```
(Details excluded in production; development may include stack trace)

---

## Summary

This contract defines the skeleton API. Phase 1 priority:
1. Database schema fully normalized and indexed ✓
2. Auth scaffold (login/logout, RBAC, reset tokens) — Agent A
3. Billing engine (pure computeInvoice + persistence, SSE) — Agent B
4. Catalog & subscription CRUD (read-only for now) — Agent C
5. Outbox admin view — Agent A

All monetary values are **decimal strings**. No floating-point. Idempotent operations where noted. Real-time via Postgres LISTEN/NOTIFY.
