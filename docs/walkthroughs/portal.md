# Customer portal walkthrough

## Who can use it

`/api/portal/*` is only for users with role `customer`. Staff and admin get 403 and use the staff APIs. Every customer account has a `customer_id` (enforced by a database CHECK), and every portal query is filtered by the caller's `customer_id` from the session. The id is never taken from the request.

## Isolation

A customer asking for another customer's subscription or invoice gets **404**, not 403. A 403 would confirm that the id exists. Isolation lives in the SQL itself (`WHERE ... AND customer_id = $n`), including inside the locked `SELECT ... FOR UPDATE` that subscription actions use. A customer therefore cannot pause or close someone else's subscription by guessing ids. `apps/api/test/portal.test.ts` checks list, detail, invoice and action isolation between two customers.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/portal/subscriptions` | my subscriptions (paginated) with lines and totals |
| GET | `/api/portal/subscriptions/:id` | one of mine, with full status history |
| POST | `/api/portal/subscriptions/:id/pause` | needs plan `allow_pause` |
| POST | `/api/portal/subscriptions/:id/resume` | Paused -> Active |
| POST | `/api/portal/subscriptions/:id/renew` | needs plan `allow_renew` |
| POST | `/api/portal/subscriptions/:id/close` | early close needs plan `allow_early_close` |
| GET | `/api/portal/invoices` | my invoices (read-only, paginated) |
| GET | `/api/portal/invoices/:id` | one of my invoices |

Actions call the same `transitionSubscription` function as staff, so the plan rules, the history row (reason `portal_pause` etc.) and the status notification are identical. A disallowed action returns `409 PLAN_DISALLOWS`.

## Invoices

Invoices are created by the billing workstream; the portal only reads them. Each invoice includes `amount_paid` (sum of `Received` payments), `outstanding` (total minus paid, never below zero) and `is_overdue`. Overdue is derived at read time: due date before today and status not Paid or Cancelled. It is never stored, so it cannot go stale.

## Edge cases

- Unknown action names (e.g. `/delete`) fail validation with 400.
- Paging works as on every list: `page` from 1, `pageSize` 1 to 100.
