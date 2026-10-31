# Renewal chasing walkthrough

## Invoice chase (phase 1)

`POST /api/renewals/chase/run?asOf=YYYY-MM-DD` is available to `admin` and `staff`. When omitted, `asOf` uses the server's current UTC date. Each request scans confirmed invoices and writes a reminder to `outbox_emails` for the first active customer account email:

- `pre_due`: due date is exactly three days after `asOf`.
- `due`: due date equals `asOf`.
- `overdue_7`: due date is exactly seven days before `asOf`.

Only exact-day events are sent; missed days are not caught up. Paid and cancelled invoices are never chased. Overdue is derived from the invoice due date and current status; it is not stored. `renewal_chase_log` uniquely claims each invoice and stage in the same transaction as the outbox insert. Repeated and concurrent runs therefore produce no duplicate reminder for a stage. The endpoint returns the `asOf` date and counts for all three stages. Invalid calendar dates return a validation error.

## Admin outbox

`GET /api/admin/outbox` requires `admin` and returns newest-first rows with `{ data, meta }`. `page` defaults to 1 and `pageSize` to 20 (maximum 100). Optional `recipient` filters to an exact email address. The current `outbox_emails` schema has no delivery state, `sent_at`, error, or retry fields, so the response exposes its available fields: id, recipient, subject, body, and created_at.

## Queue and renew: pending A3

`GET /api/renewals/queue` and `POST /api/renewals/:id/renew` are pending the A3 subscription lifecycle implementation and are intentionally not included in this phase.

## How to test

Run `TEST_DATABASE_URL=postgresql://brightloop:password@localhost:5432/brightloop_test_b npm test`. The integration tests cover access control, all chase stages and date boundaries, paid/cancelled exclusions, idempotency, invalid dates, and outbox pagination.
