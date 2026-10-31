# Plans and quotation templates walkthrough

## How it works

Plans define a price, billing period, minimum quantity, availability dates, and four policy flags. The response includes `pricing: [{ period, price }]` for compatibility. Money remains a decimal string. A plan can be filtered by `availableOn` and patched one policy flag at a time.

Quotation templates belong to a plan and contain product lines. Each line stores the product's resolved unit price, including a selected variant's extra price. Expiry is the creation date plus `validityDays`; expired templates remain readable and report `is_expired`.

## Endpoints

| Method | Path                 | Purpose                                          |
| ------ | -------------------- | ------------------------------------------------ |
| GET    | `/api/plans`         | List plans, optionally filtered by `availableOn` |
| GET    | `/api/plans/:id`     | Read one plan                                    |
| POST   | `/api/plans`         | Create a plan                                    |
| PATCH  | `/api/plans/:id`     | Change exactly one policy flag                   |
| GET    | `/api/templates`     | Paginated templates with priced lines            |
| GET    | `/api/templates/:id` | Read one template                                |
| POST   | `/api/templates`     | Create a template with priced lines              |
| PATCH  | `/api/templates/:id` | Replace template fields and lines                |
| DELETE | `/api/templates/:id` | Delete a template                                |

## Edge cases

Dates must be real ISO calendar dates, and `availableUntil` cannot precede `availableFrom`. Supported periods are daily, weekly, monthly, and yearly. Duplicate plan numbers return 409. Unknown plans, products, or variants are rejected; variants must belong to their specified product. Lists return `{ data, meta }` with page, pageSize, and total.
