# Discounts walkthrough

## What a rule holds

Only admins manage discount rules (`/api/discounts`); staff and customers get 403. A rule has:

| Field | Meaning |
| --- | --- |
| `kind` + `value` | `percentage` (0 < value <= 100) or `fixed` amount |
| `appliesTo` | `subscription` (every line) or `products` (only lines for `productIds`) |
| `minPurchase`, `minQuantity` | the eligible lines must reach these before the rule applies |
| `startsOn`, `endsOn` | inclusive date window, checked against the invoice period start |
| `usageLimit` | how many invoices may use it; empty means unlimited |
| `isActive` | admins can switch a rule off without deleting it |

`times_used` is maintained by billing only; the API never accepts it.

## Derived state

Lists and details show a `state` computed in SQL, never stored, in this priority: `inactive`,
`scheduled` (starts in the future), `expired` (ended), `exhausted` (`times_used` reached the limit),
otherwise `active`. `GET /api/discounts?status=active` filters on it.

## How it reaches invoices

Nobody has to remember a discount. On every billing run the engine considers every rule, applies the
eligible ones to the next invoice, and records why the others were skipped in the invoice trace. A rule
stops applying by itself once it is past `endsOn` or used up. Usage safety:

- the rules are locked (`SELECT ... FOR UPDATE`) inside each invoice transaction, so two runs can't
  both take the last use;
- `discount_usage` is unique per rule and invoice, and a DB check keeps `times_used <= usage_limit`;
- cancelling an invoice gives its uses back.

## Endpoints (admin only)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/discounts?status=&q=` | paginated list with product ids, uses and state |
| GET | `/api/discounts/:id` | detail with the 100 most recent uses |
| POST | `/api/discounts` | create |
| PATCH | `/api/discounts/:id` | edit; `productIds` replaces the set |
| POST | `/api/discounts/:id/activate`, `/deactivate` | switch on/off |
| DELETE | `/api/discounts/:id` | only if never used (otherwise 409 `DISCOUNT_IN_USE`; deactivate it) |

## Edge cases

- Product rules need at least one existing product; subscription rules may not list products (400).
- A usage limit can't be lowered below the number of uses already made (409 `USAGE_LIMIT_BELOW_USED`).
- `endsOn` before `startsOn` is rejected, both by validation and by a DB check.
