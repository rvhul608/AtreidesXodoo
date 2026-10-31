# Infrastructure Setup & Walkthrough

## Quick Start

### 1. Install Dependencies
```bash
npm install
```
Installs root dependencies and all workspace packages (apps/api, apps/web).

### 2. Start Database
```bash
docker-compose up -d postgres
```
Starts PostgreSQL 18 container on localhost:5432. Confirm health:
```bash
docker-compose ps
```

### 3. Apply Migrations
```bash
npm run migrate
```
Creates all tables and schema. Idempotent—safe to rerun.

### 4. Seed Demo Data
```bash
npm run seed
```
Populates ~5000 customers, ~10000 subscriptions, invoices, and payments.

### 5. Start Development Servers
```bash
npm run dev
```
Starts API (http://localhost:3000) and Web (http://localhost:5173) in parallel.

### 6. Health Check
```bash
curl http://localhost:3000/health | jq .
```
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

Visit http://localhost:5173 to see the web app. Status will show green if API and DB are connected.

---

## Project Structure

```
.
├── package.json                    # Root workspace definition
├── tsconfig.base.json              # Shared TypeScript config
├── .gitignore                      # Excludes node_modules, .mingle, .env
├── .env.example                    # Environment template (copy to .env)
├── docker-compose.yml              # Postgres service
│
├── apps/
│   ├── api/
│   │   ├── package.json            # Express + Node.js backend
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   └── index.ts            # Main server, health endpoint
│   │   └── dist/                   # Built output
│   │
│   └── web/
│       ├── package.json            # React + Vite frontend
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx             # Status display
│       │   └── App.css
│       └── dist/                   # Built output
│
├── db/
│   ├── schema.sql                  # Full Phase 1 schema (idempotent)
│   ├── migrate.js                  # Migration runner (applies schema)
│   ├── reset.js                    # Drops all tables (dev only)
│   ├── seed.js                     # Populates demo data
│   └── migrations/                 # (Future: incremental migrations)
│
├── docs/
│   ├── api-contract.md             # Complete API specification
│   └── walkthroughs/
│       └── infra.md                # This file
│
└── scripts/
    └── health-check.js             # Standalone health check script
```

---

## npm Scripts

### Development
- `npm run dev` — Starts API + Web dev servers in watch mode
- `npm run typecheck` — Runs TypeScript validation (all workspaces)
- `npm run build` — Builds API + Web for production

### Database
- `npm run migrate` — Apply migrations (idempotent)
- `npm run migrate:reset` — Drop all tables + re-migrate (dev only)
- `npm run seed` — Populate demo data

### Health & Verification
- `npm run health-check` — Curl /health endpoint

---

## Database Schema Overview

### Core Tables

**Customers** — Tenant/organization records
```sql
id, legal_name, created_at, updated_at
```

**Users** — Customer users with roles
```sql
id, customer_id, email, password_hash (hashed), role, is_active
Indexes: customer_id, (customer_id, email UNIQUE)
```

**Reset Tokens** — Hashed, expiring, single-use
```sql
id, user_id, token_hash UNIQUE, expires_at, used_at
```

**Audit Log** — Compliance log
```sql
id, customer_id, user_id, entity_type, entity_id, action, changes (JSONB)
```

**Email Outbox** — Database-backed async notifications (no third-party APIs)
```sql
id, customer_id, recipient, subject, body, sent_at, error_message, retry_count
```

### Catalog Tables

**Products** — SKUs
```sql
id, customer_id, sku, name, description
Index: (customer_id, sku UNIQUE)
```

**Product Variants** — Packaging/options
```sql
id, product_id, variant_key, description
```

**Tax Rules** — Jurisdiction rates
```sql
id, customer_id, jurisdiction, tax_code, rate
Index: (customer_id, jurisdiction UNIQUE)
```

**Plans** — Billing plans with availability and policy flags
```sql
id, customer_id, plan_number, name, description,
available_from, available_until,
min_quantity, max_quantity,
auto_renew_allowed, early_termination_allowed
```

**Plan Pricing** — Per-period pricing
```sql
id, plan_id, period ('monthly'|'quarterly'|'annual'), price NUMERIC(12,2)
Index: (plan_id, period UNIQUE)
```

### Subscription Tables

**Subscriptions** — Active contracts
```sql
id, customer_id, subscription_number UNIQUE,
plan_id, period, quantity, unit_price,
start_date, end_date, next_billing_date,
auto_renew, status ('Active'|'Paused'|'Cancelled'),
created_at, updated_at
Indexes: status, (next_billing_date WHERE status='Active')
```

**Subscription Items** — Line items in subscription
```sql
id, subscription_id, product_variant_id, quantity, unit_price
```

**Subscription History** — Status audit trail
```sql
id, subscription_id, status, changed_at
```

### Billing Tables

**Invoices** — Billing documents
```sql
id, customer_id, subscription_id, invoice_number,
period_start, period_end,
subtotal, tax_amount, discount_total, total (all NUMERIC(12,2)),
issued_date, due_date,
status ('Draft'|'Confirmed'|'Paid'|'Cancelled'),
trace (JSONB—rule evaluation),
created_at, updated_at
Constraint: UNIQUE(subscription_id, period_start)
Indexes: status, due_date, customer_id
```

**Invoice Line Items** — Snapshot of prices/taxes/discounts
```sql
id, invoice_id, description, quantity, unit_price, line_total,
tax_rate, tax_amount, discount_percent, discount_amount (all NUMERIC(12,2))
```

**Payments** — Received payments (local records only)
```sql
id, invoice_id, customer_id, amount NUMERIC(12,2),
payment_method, status ('Received'|'Failed'|'Reversed'),
transaction_date, notes
Index: invoice_id
```

### Discount Tables

**Discount Rules** — Rule definitions
```sql
id, customer_id, name, discount_percent, description, is_active
```

**Discount Scopes** — Rule applicability
```sql
id, discount_rule_id, scope_type ('plan'|'product'|'subscription'), scope_id
```

**Discount Usage** — Per-invoice usage tracking
```sql
id, discount_rule_id, invoice_id, amount NUMERIC(12,2)
```

---

## Money & Exact Arithmetic

**Rule:** All monetary values use `NUMERIC(12,2)` in the database and **decimal strings** in API contracts.

### In Database
```sql
CREATE TABLE invoices (
  ...
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ...
);
```

### In API Contracts
```json
{
  "subtotal": "99.99",
  "tax_amount": "8.25",
  "total": "108.24"
}
```

### In Application Code (JavaScript)
Use `decimal.js`:
```typescript
import Decimal from 'decimal.js';

const subtotal = new Decimal('99.99');
const tax = subtotal.mul('0.0825');
const total = subtotal.plus(tax);

console.log(total.toString()); // "108.2475" → round to "108.25"
```

---

## Billing Uniqueness & Concurrency

### Invoice Uniqueness
Enforced by constraint:
```sql
UNIQUE(subscription_id, period_start)
```
One invoice per subscription per billing period.

### Renewal Concurrency
Multiple workers may attempt renewal simultaneously. Use:
```sql
SELECT * FROM subscriptions
WHERE next_billing_date <= NOW() AND status = 'Active'
FOR UPDATE SKIP LOCKED;
```

This locks rows for update, skipping locked rows (worker isolation).

### Payment Idempotency
Payments are records of received funds. If a payment is submitted twice:
1. Check invoice status: if already Paid, reject.
2. Check amount: if overpayment, reject.
3. If valid: INSERT payment, update invoice status to Paid (same transaction).

---

## Real-Time: Postgres LISTEN/NOTIFY

The application uses Postgres native LISTEN/NOTIFY for real-time updates.

### Supported Channels
1. **subscription_updated** — fired when subscription status or next_billing_date changes
   ```json
   { "subscription_id": 456, "status": "Active", "next_billing_date": "2024-12-01" }
   ```

2. **invoice_ready** — fired when invoice moves to Confirmed
   ```json
   { "invoice_id": 789, "subscription_id": 456, "due_date": "2024-12-15", "total": "108.24" }
   ```

3. **payment_processed** — fired when payment is received
   ```json
   { "payment_id": 2001, "invoice_id": 789, "status": "Received", "amount": "108.24" }
   ```

### Implementation Example (Node.js)
```typescript
import { Client } from 'pg';

const client = new Client(process.env.DATABASE_URL);
await client.connect();

client.query('LISTEN invoice_ready');

client.on('notification', (msg) => {
  if (msg.channel === 'invoice_ready') {
    const data = JSON.parse(msg.payload);
    // Broadcast to SSE clients: `data: ${msg.payload}`
  }
});
```

Triggers (in database) fire NOTIFY on INSERT/UPDATE:
```sql
CREATE TRIGGER invoice_ready_notify AFTER UPDATE ON invoices
FOR EACH ROW
WHEN (NEW.status = 'Confirmed' AND OLD.status != 'Confirmed')
EXECUTE FUNCTION notify_invoice_ready();

CREATE FUNCTION notify_invoice_ready() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'invoice_ready',
    json_build_object(
      'invoice_id', NEW.id,
      'subscription_id', NEW.subscription_id,
      'due_date', NEW.due_date,
      'total', NEW.total
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Development Workflow

### Phase 1a: Infrastructure (Agent B) ✓
- [x] Database schema (all tables, indexes, constraints)
- [x] Migration runner (idempotent)
- [x] API scaffold (Express, health check)
- [x] Web scaffold (React, Vite, health display)
- [x] Docker Compose (Postgres)
- [x] API contract specification

### Phase 1b: Feature Implementation
**Agent A (Auth/Outbox/Portal)**
- [ ] Login/logout endpoints
- [ ] Password reset flow
- [ ] RBAC enforcement
- [ ] Outbox admin page

**Agent B (Billing/Payments/SSE)**
- [ ] computeInvoice pure function
- [ ] Invoice creation endpoint
- [ ] Payment charging endpoint
- [ ] Renewal scheduler
- [ ] SSE endpoint (LISTEN/NOTIFY integration)

**Agent C (Catalog/Subscriptions/Reports)**
- [ ] Product, plan, tax endpoints (read)
- [ ] Subscription CRUD
- [ ] Subscription lifecycle (pause, cancel, resume)
- [ ] Invoice listing with filters
- [ ] Reports (overdue, upcoming renewals)

### Testing
- [ ] Unit tests: computeInvoice with edge cases (0.01, rounding, discounts)
- [ ] Integration tests: migrations, schema constraints
- [ ] Concurrency tests: renewal SKIP LOCKED, payment idempotency
- [ ] End-to-end: login → subscribe → invoice → pay

---

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
Ensure Docker Compose is running:
```bash
docker-compose ps
docker-compose logs postgres
```

### Migration Failure
Migrations are idempotent. If a migration fails, inspect the error, fix the schema, and rerun:
```bash
npm run migrate
```

### Port Already in Use
Change `API_PORT`, `WEB_PORT`, or stop other processes:
```bash
lsof -i :3000  # API port
lsof -i :5173  # Web port
```

### TypeScript Errors
Run typecheck:
```bash
npm run typecheck
```

Fix errors in `src/` files. Common issues: missing types, strict null checks.

---

## Next Steps

1. **Commit skeleton** — Clean git history, main branch
2. **Agent A begins** — Auth routes, session, reset tokens
3. **Agent B begins** — Billing engine, SSE, payment logic
4. **Agent C begins** — Catalog CRUD, subscription lifecycle
5. **Integration** — Cross-team testing, full end-to-end flow
6. **Judging submission** — README, demo video, live system

---

## References

- **API Contract:** docs/api-contract.md
- **Schema:** db/schema.sql
- **Environment:** .env.example
- **Docker:** docker-compose.yml
- **Root Scripts:** package.json
