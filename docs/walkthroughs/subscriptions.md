# Subscriptions walkthrough

## What a subscription holds

A subscription belongs to one customer and one plan. It has a unique number, a start date, an optional expiry date, payment terms and one or more product lines. Each line stores the product, optional variant, quantity, unit price, amount, tax amount and the ids of the tax rules that applied. The response adds `totals` (`untaxed`, `tax`, `total`) as decimal strings.

Numbers come from the Postgres sequence `subscription_number_seq` through the column default (`SUB-000123`). Postgres hands out each value once, so two concurrent creates can never collide, and a global unique index enforces it as a second guard.

## Pricing

Unit price = product `sales_price` + variant `extra_price`. A 1000.00 product with the "Odoo" brand variant (+560.00) is priced at 1560.00. Amount = quantity × unit price. Tax = amount × the sum of the product's linked tax rates, rounded half-up to 2 decimals. All maths uses `decimal.js` and every value is stored as `NUMERIC(12,2)`, so there is no floating-point drift.

Prices and tax ids are snapshotted onto the line when the subscription is created or edited. A later catalog price change does not silently change an existing subscription. Editing a Draft or Quotation re-prices its lines from the current catalog.

The billing engine (Section B) reads `subscriptions.period`, `quantity`, `unit_price` and `next_billing_date`. Those columns are filled from the plan on create, and the original columns were kept rather than renamed so that code keeps working.

## Creating

- `POST /api/subscriptions` with `customerId`, `planId`, `startDate`, optional `expiryDate`, `paymentTerms` and `lines[{ productId, variantId?, quantity }]`.
- `POST /api/subscriptions/from-template` with `templateId`, `customerId`, `startDate`. The template's plan and lines are copied and re-priced. A template is valid for `validity_days` from its creation date; after that the call returns `409 TEMPLATE_EXPIRED`.

Checks on create and edit: the customer and plan exist (404), each variant belongs to its product (`400 VARIANT_MISMATCH`), the total quantity meets the plan's `min_quantity` (`400 MIN_QUANTITY`), the start date is inside the plan's `available_from`/`available_until` window (`400 PLAN_UNAVAILABLE`), and expiry is not before start (`400 INVALID_EXPIRY`).

`PATCH /api/subscriptions/:id` works only while the status is Draft or Quotation. `DELETE` works only on a Draft. Anything later returns `409 SUBSCRIPTION_LOCKED`, because a confirmed subscription is a commitment and must be closed rather than erased.

## The status flow

```
Draft -> Quotation -> Confirmed -> Active -> Closed
            |                        ^  |
            v                        |  v
          Draft                     Paused -> Closed
```

Every status change goes through one function, `transitionSubscription(id, to, actor, options)` in `apps/api/src/modules/subscriptions/service.ts`. The staff endpoints, the customer portal, the renewal queue and the auto-close job all call it. Inside one transaction it:

1. locks the row with `SELECT ... FOR UPDATE`, so concurrent requests on the same subscription run one after the other;
2. applies the rules in `lifecycle.ts` (pure functions with no database access);
3. writes the new state, a `subscription_history` row (from, to, action, actor, reason) and an audit entry;
4. sends `pg_notify('subscription_status_changed', ...)`, which Postgres delivers only on commit.

An illegal move such as Draft -> Active returns `409 INVALID_TRANSITION`. A move the plan forbids returns `409 PLAN_DISALLOWS`:

| Move | Plan flag |
| --- | --- |
| Active -> Paused | `allow_pause` |
| Active/Paused -> Closed before `expiry_date` | `allow_early_close` (recorded as action `early_close`) |
| Renew | `allow_renew` |

Resuming (Paused -> Active) is always allowed, so a customer is never stuck in Paused because an admin changed the plan later.

## next_billing_date

| Event | Effect |
| --- | --- |
| Confirmed -> Active | the later of `start_date` and today |
| Active -> Paused | left frozen; `paused_at` = today |
| Paused -> Active | frozen date + days paused, but never earlier than today; `paused_at` cleared |
| Closed | cleared (null) |
| Renew | unchanged |

Shifting by the paused days means the customer is not billed for the pause and no period is skipped.

## Renewal

Only an Active subscription with an expiry date can be renewed. The expiry moves forward by one plan period from the current expiry (or from today if it has already passed), so terms stay back-to-back. Month ends are clamped: Jan 31 + 1 month = Feb 28. Open-ended subscriptions (no expiry) have nothing to renew and return 409.

## Auto-close

`POST /api/subscriptions/auto-close/run?asOf=YYYY-MM-DD` (staff/admin) closes Active or Paused subscriptions whose plan has `auto_close` and whose `expiry_date` is before `asOf`. Each one goes through `transitionSubscription` with reason `auto_close`, so each gets its own history row. If a subscription was closed manually in the meantime, it is skipped.

## Endpoints (staff and admin)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/subscriptions?status=&customerId=&q=&page=&pageSize=` | paginated list, newest first |
| GET | `/api/subscriptions/:id` | detail with lines, totals and history |
| POST | `/api/subscriptions` | create a Draft |
| POST | `/api/subscriptions/from-template` | create a Draft from a quotation template |
| PATCH | `/api/subscriptions/:id` | edit a Draft or Quotation |
| DELETE | `/api/subscriptions/:id` | delete a Draft |
| POST | `/api/subscriptions/:id/transition` | `{ to, reason? }` |
| POST | `/api/subscriptions/:id/renew` | extend by one period |
| POST | `/api/subscriptions/auto-close/run?asOf=` | close expired auto-close subscriptions |

Customers get 403 here and use the portal instead.

## Performance

Lists use `(customer_id, id DESC)` and `(status, id DESC)` indexes. Lines for a page are fetched in one `= ANY($1)` query, not one query per row. Expiry and billing lookups use partial indexes on Active rows. With 10,010 seeded subscriptions (`SEED_SCALE=10000 npm run seed`), list, filter, search and detail calls each answered in under 40 ms locally.

## Edge cases

- Two simultaneous transitions on one subscription: the row lock serialises them, the second sees the new state, and exactly one history row is written for the move.
- Quantities may be decimals (e.g. support hours) with at most 2 places; the plan minimum compares against the sum of line quantities.
- History rows survive status changes; they are deleted only with a Draft subscription that never left Draft.
