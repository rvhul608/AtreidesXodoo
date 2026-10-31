# Billing walkthrough

The invoice engine is a pure function: it receives a subscription and tax snapshot, an `asOf` date,
and discount rule snapshots. It returns period dates, line calculations, totals, and a trace explaining
each considered rule. It performs no database reads or writes.

`POST /api/billing/run` uses four asynchronous workers by default. Each claims up to 100 due active
subscriptions with `FOR UPDATE SKIP LOCKED`. The unique `(subscription_id, period_start)` constraint
protects invoice uniqueness. Batch line reads replace per-subscription queries; one SQL statement
stores invoices, lines, history, discount usage, counters, notifications, and advanced billing dates.
The response counts only committed work. Workers catch up missed periods until their queue is empty.
If a batch fails, it rolls back and that worker falls back to single-subscription transactions,
isolating the bad subscription while other subscriptions continue. The next run retries failures.

Only finite, unexhausted discount budgets require exclusive locks before calculation. Unlimited rules
are read concurrently, with atomic usage counter increments once per batch. Finite counters also
advance within the batch's calculation snapshot so a budget cannot be spent twice in one batch.
Rules run in id order, and each applies to the
remaining line values after earlier rules. Subscription rules select every line; product rules select
only scoped products. The trace records date-window, usage-limit, minimum-purchase, minimum-quantity,
and product-match decisions. Usage counts increase only with a created invoice; cancelling an invoice
releases those uses.

Tax uses the product's currently linked rates and applies to each line after discounts. Amounts are
rounded half-up to cents. Due dates add the number in payment terms matching `/net N/`; all other terms
mean due on receipt. Preview computes the invoice without changing subscription dates or usage counts.

## Worked example

ERP License with the Odoo brand variant: 1000.00 + 560.00 = 1560.00 x 2 seats = 3120.00. A 10% rule
for "2 or more seats" applies: discount 312.00, taxable 2808.00, GST 18% = 505.44, total 3313.44. The
invoice `trace` lists that rule as `applied` with amount 312.00, and any other rule with the reason it
was skipped (`expired`, `usage limit reached`, `below minimum purchase 5000.00`, ...).

## Endpoints (admin, staff)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/billing/run?asOf=YYYY-MM-DD` | bill everything due on or before `asOf` (default today) |
| GET | `/api/billing/preview/:subscriptionId?asOf=` | the invoice that would be created, with trace; writes nothing |

## Guarantees and how they are tested (`test/billing-run.test.ts`, `test/billing-engine.test.ts`)

- Running twice creates zero duplicates (unique `(subscription_id, period_start)`).
- Two runs at the same time create exactly one invoice per period (`SKIP LOCKED` + the unique key).
- Three missed months produce three back-to-back invoices and move the billing date past them.
- Paused, closed and expired subscriptions are never billed.
- A discount with a usage limit of 1 is applied to exactly one invoice, even across concurrent runs.
- A failing subscription is rolled back on its own while the others are billed.

## Performance

Configure `BILLING_CONCURRENCY` (1–8, default 4) and `BILLING_BATCH_SIZE` (1–500, default 100).
Concurrency is asynchronous database work, not CPU threads. The pool has 10 connections by default;
keep spare connections for interactive traffic. Finite discount budgets still serialize competing
workers until exhausted; many active limited rules can reduce throughput.

Run `npm run benchmark:billing` to generate a separate `brightloop_billing_benchmark` database and
measure an authenticated HTTP billing request for 5,527 due subscriptions among 10,010 total rows,
two invoice lines per due subscription, and the demo 100-use discount. It verifies all totals,
discount usage, line count, and an empty rerun. It never resets the development database.
`BENCHMARK_DATABASE_URL` must target that exact database; `BENCHMARK_ADMIN_URL` controls the server
used to create it. `BENCHMARK_INVOICES` changes the due workload. Reported latency is a measured local
result, not a guarantee across hardware, contention, networks, and arbitrary catch-up periods.
