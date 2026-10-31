# Brightloop Subscription API Contract
**Phase 1 Schema & Infrastructure Skeleton**

## Overview

This API contract defines all Phase 1 endpoints, request/response shapes, authentication, RBAC, real-time patterns, and the pure billing engine. Implementation responsibility is divided:

- **Agent A:** Auth routes, outbox, user portal
- **Agent B:** Billing/payments services, real-time SSE, database health
- **Agent C:** Catalog routes, subscription lifecycle, reports

---

## Authentication & Authorization

### Cookie-based Session Auth
- All endpoints (except `/health`) require a valid session cookie: `session=<id>`
- Sessions stored in database (managed by Agent A)
- RBAC roles: `admin`, `user`, `viewer`
- Customer scope enforcement: users can only access resources for their customer_id

### Error Response (Unauthorized)
```json
{
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED"
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
  "status": "ok",
  "timestamp": "2024-11-01T10:30:00Z",
  "database": {
    "connected": true,
    "timestamp": "2024-11-01T10:30:00Z"
  }
}
```

**Response 503 Service Unavailable (DB down)**
```json
{
  "status": "error",
  "error": "Database connection failed",
  "database": {
    "connected": false
  }
}
```

---

## Auth Routes (Agent A)

### POST /auth/login
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
  "user": {
    "id": 123,
    "email": "user@company.local",
    "customer_id": 456,
    "role": "admin"
  }
}
```

**Response 401 Unauthorized**
```json
{
  "error": "Invalid credentials"
}
```

### POST /auth/logout
Clear session.

**Response 204 No Content**

### POST /auth/request-reset
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
  "message": "Reset link sent if account exists"
}
```

Implementation: creates reset token (hashed in DB), sends via email_outbox.

---

## Billing Routes (Agent B)

### GET /api/invoices
List invoices for authenticated user's customer. Paginated.

**Query Parameters**
- `status`: Draft, Confirmed, Paid, Cancelled (optional)
- `limit`: default 20, max 100
- `offset`: default 0
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
  "pagination": {
    "limit": 20,
    "offset": 0,
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
  "error": "Invoice not in Draft status"
}
```

### POST /api/invoices/:id/charge
Record a payment against invoice. Idempotent: checks invoice is not already paid.

**Request**
```json
{
  "amount": "108.24",
  "payment_method": "card",
  "notes": "Payment received via Stripe" // optional
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
  "error": "Invoice not ready for payment or amount exceeds due total"
}
```

**Response 422 Unprocessable** (amount mismatch)
```json
{
  "error": "Amount exceeds outstanding balance"
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
- `limit`: default 20, max 100
- `offset`: default 0

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
  "pagination": {
    "limit": 20,
    "offset": 0,
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

## Error Responses

### 400 Bad Request
```json
{
  "error": "Bad request",
  "details": { "field": "invalid" }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "code": "INSUFFICIENT_PERMISSIONS"
}
```

### 404 Not Found
```json
{
  "error": "Not found"
}
```

### 409 Conflict
```json
{
  "error": "Conflict",
  "details": { "reason": "Invoice already paid" }
}
```

### 422 Unprocessable Entity
```json
{
  "error": "Unprocessable entity",
  "details": { "field": "value must be positive" }
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
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
