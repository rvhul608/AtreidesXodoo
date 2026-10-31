# Brightloop Subscription Management

Odoo x Make-A-Ton 9.0 project: a subscription management system for the fictional Brightloop Software. Express + TypeScript API (`apps/api`), local Postgres, no third-party services.

## Run the full application with Docker

The only requirement is Docker Desktop or Docker Engine with Docker Compose.

```bash
docker compose up --build
```

Open http://localhost:5173. The API is also available at http://localhost:3000 and its health endpoint is http://localhost:3000/health.

The API container waits for PostgreSQL, then runs migrations and seeds the demo data automatically. The seed is safe to re-run. Stop the stack with `docker compose down`; add `-v` to also remove the local database volume.

For a non-default local session key, start it with `JWT_SECRET='your-long-random-value' docker compose up --build`.

Demo accounts created by the seed:

- `admin@brightloop.local` / `ChangeMe123!`
- `staff@brightloop.local` / `DemoPass123!`
- `customer1@brightloop.local` / `DemoPass123!`

## Local development without Docker

Requirements: Node 18+ and a local Postgres with a `brightloop` role (password `password`) that owns `brightloop_dev` and `brightloop_test`.

```bash
npm ci --include=dev          # dev tools (tsx, vitest, tsc) are needed even if npm omits dev deps
cp .env.example .env          # then set a real JWT_SECRET
npm run migrate               # baseline schema + db/migrations, safe to re-run
npm run seed                  # demo users, catalog, plans, template, subscriptions
npm run dev --workspace apps/api   # http://localhost:3000
```

The seed prints the demo logins: `admin@brightloop.local` (from `SEED_ADMIN_*` in `.env`), `staff@brightloop.local`, and `customer1..3@brightloop.local`, all with demo password `DemoPass123!` except the admin. `SEED_ADMIN_ONLY=true npm run seed` creates only the admin. `SEED_SCALE=10000 npm run seed` adds bulk subscriptions to check list speed.

Checks:

```bash
npm run typecheck
npm test                      # resets and migrates brightloop_test, then runs the API tests
```

## Endpoints

All responses are `{ data, meta? }` (lists: `meta = { page, pageSize, total }`, `pageSize` max 100); errors are `{ error: { code, message, details? } }`. Auth is an httpOnly `session` cookie. Roles: `admin`, `staff`, `customer`.

| Area | Endpoints | Who |
| --- | --- | --- |
| Auth | `POST /api/auth/signup`, `/login`, `/logout`, `/forgot-password` (`/request-reset`), `/reset-password`; `GET /api/auth/me` | public / signed in |
| Users | `GET /api/users`, `POST /api/users` (create staff), `POST /api/users/:id/deactivate` | admin |
| Products | `GET /api/products`, `GET /api/products/:id`, `GET /api/products/:id/price?variantId=` | signed in |
| | `POST/PATCH/DELETE /api/products[/:id]`, `POST/PATCH/DELETE /api/products/:id/variants[/:variantId]`, `PUT /api/products/:id/taxes` | admin |
| Taxes | `GET /api/taxes`; `POST/PATCH/DELETE /api/taxes[/:id]` | signed in; admin writes |
| Plans | `GET /api/plans[?availableOn=]`, `GET /api/plans/:id`; `POST/PATCH /api/plans[/:id]` | signed in; admin writes |
| Quotation templates | `GET /api/templates[/:id]`; `POST/PATCH/DELETE /api/templates[/:id]` | signed in; admin writes |
| Subscriptions | `GET/POST /api/subscriptions`, `POST /api/subscriptions/from-template`, `GET/PATCH/DELETE /api/subscriptions/:id`, `POST /api/subscriptions/:id/transition`, `POST /api/subscriptions/:id/renew`, `POST /api/subscriptions/auto-close/run` | admin, staff |
| Portal | `GET /api/portal/subscriptions[/:id]`, `POST /api/portal/subscriptions/:id/{pause,resume,renew,close}`, `GET /api/portal/invoices[/:id]` | customer (own rows only) |
| Renewals | `GET /api/renewals/queue`, `POST /api/renewals/:id/renew`, `POST /api/renewals/chase/run` | admin, staff |
| Billing | `POST /api/billing/run?asOf=`, `GET /api/billing/preview/:subscriptionId` | admin, staff |
| Invoices | `GET /api/invoices[/:id]`, `POST /api/invoices/:id/{confirm,cancel,send}`, `GET /api/invoices/:id/print` | admin, staff |
| Payments | `POST/GET /api/invoices/:id/payments`, `GET /api/payments`, `GET /api/payments/summary` | admin, staff |
| Discounts | `GET/POST /api/discounts`, `GET/PATCH/DELETE /api/discounts/:id`, `POST /api/discounts/:id/{activate,deactivate}` | admin |
| Outbox | `GET /api/admin/outbox` | admin |

How each module works, and why: `docs/walkthroughs/` (`auth`, `catalog`, `plans`, `subscriptions`, `portal`, `renewals`, `billing`, `invoices`, `discounts`, `payments`).
