# Billing walkthrough

The invoice engine is a pure function: it receives a subscription and tax snapshot, an `asOf` date,
and discount rule snapshots. It returns period dates, line calculations, totals, and a trace explaining
each considered rule. It performs no database reads or writes.

`POST /api/billing/run` works one subscription per transaction. PostgreSQL selects one due active
subscription with `FOR UPDATE SKIP LOCKED`; the unique `(subscription_id, period_start)` constraint
protects idempotency if another run reaches the same period. Each successful transaction stores the
invoice, lines, history, discount usage and billing date together. Repeated calls catch up missed
periods until no due subscription remains. If one subscription fails (for example a bad line), only its
transaction rolls back: it gets no invoice, its billing date stays put, it is listed under `failed` in
the response, and the run carries on with every other due subscription. The next run retries it.

Eligible discount rules are locked before calculation. Rules run in id order, and each applies to the
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

List and detail endpoints stay in the tens of milliseconds with 10,000 subscriptions and 5,500
invoices. The billing run itself is a batch job: one transaction per subscription, about 12 ms each
locally, so 500 due subscriptions take about 6 seconds and 5,500 take about 70. Running several
workers in parallel (safe with `SKIP LOCKED`) would cut that further, but the discount-rule lock
would first need narrowing to only the rules actually applied. That is not done yet.
