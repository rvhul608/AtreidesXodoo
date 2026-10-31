# Renewal chasing walkthrough

## Invoice chase (phase 1)

`POST /api/renewals/chase/run?asOf=YYYY-MM-DD` is available to `admin` and `staff`. When omitted, `asOf` uses the server's local date. Each request scans confirmed invoices and writes a reminder to `outbox_emails` for the first active customer account email:

- `pre_due`: due date is exactly three days after `asOf`.
- `due`: due date equals `asOf`.
- `overdue_7`: due date is exactly seven days before `asOf`.

Only exact-day events are sent; missed days are not caught up. Paid and cancelled invoices are never chased. Overdue is derived from the invoice due date and current status; it is not stored. `renewal_chase_log` uniquely claims each invoice and stage in the same transaction as the outbox insert. Repeated and concurrent runs therefore produce no duplicate reminder for a stage. The endpoint returns the `asOf` date and counts for all three stages. Invalid calendar dates return a validation error.

## Admin outbox

`GET /api/admin/outbox` requires `admin` and returns newest-first rows with `{ data, meta }`. `page` defaults to 1 and `pageSize` to 20 (maximum 100). Optional `recipient` filters to an exact email address. The current `outbox_emails` schema has no delivery state, `sent_at`, error, or retry fields, so the response exposes its available fields: id, recipient, subject, body, and created_at.

## Renewal queue

`GET /api/renewals/queue?days=30&asOf=YYYY-MM-DD&page=&pageSize=` (admin, staff) lists Active subscriptions whose `expiry_date` falls between `asOf` (default today) and `asOf + days` (default 30, max 365). Results are sorted soonest first and include the customer, plan, `days_left` and `can_renew` (the plan's `allow_renew`), so the UI can grey out the renew button. The query uses the partial index on `subscriptions(expiry_date) WHERE status = 'Active'`.

`POST /api/renewals/:id/renew` is the one-click renew. It calls the same `transitionSubscription(id, 'renew', ...)` as every other status change, so the plan check (`409 PLAN_DISALLOWS`), row lock, history row (reason `renewal_queue`) and notification all behave the same. The expiry moves forward by one plan period from the current expiry.

## How to test

Run `npm test`. `test/renewals.test.ts` covers access control, all chase stages and date boundaries, paid/cancelled exclusions, idempotency, invalid dates and outbox pagination. `test/renewals-queue.test.ts` covers the queue window, ordering, `can_renew` and renew/409.
