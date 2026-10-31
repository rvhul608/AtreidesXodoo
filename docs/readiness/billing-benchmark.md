# Concurrent billing measurement

Measured locally on 2026-10-31 using `npm run benchmark:billing` after the parallel billing changes.

The script resets only `brightloop_billing_benchmark`, prepares data outside the timed interval,
then times the full authenticated HTTP request and response to `/api/billing/run`.

- Total subscriptions: 10,010 (5,527 due).
- Invoices created: 5,527; invoice lines: 11,054.
- Workers: 4; claimed batch size: 100.
- HTTP elapsed time: **1,014 ms**, below the requested 2,000 ms target on this machine.
- Limited 10% volume discount: exactly 100 applications, matching the seeded usage cap.
- Discounted invoice totals: 2,655.00; remaining invoice totals: 2,950.00.
- A second run created zero invoices.

Assertions check every invoice total, the line and discount-usage counts, failure results, and
idempotency. The script exits unsuccessfully when elapsed HTTP time reaches two seconds. Results
depend on hardware, database load, discount rules and catch-up depth; this is not a throughput SLA.

Separate integration tests exercise two simultaneous eight-worker runs, multiple missed periods,
a shared 37-use discount, unlimited usage counters, a failed line insert, existing invoices with a
stale billing date, and cancellation concurrent with another billing run.
