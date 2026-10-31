# Catalog walkthrough

## How it works

Brightloop uses one shared company catalog. Products and tax rules have nullable customer ownership so every customer sees the same entries. Administrators manage products, variants, taxes, and product tax links; any authenticated role can read them.

Product prices and variant additions are decimal strings. A variant unit price is `sales_price + extra_price`. Tax rates are fractions from `0` through `1` (for example, `0.1800` means 18%). Product lists load variants and linked taxes for the page in batches.

## Endpoints

| Method | Path                                    | Purpose                                 |
| ------ | --------------------------------------- | --------------------------------------- |
| GET    | `/api/products`                         | Paginated products, variants, and taxes |
| POST   | `/api/products`                         | Create a product                        |
| GET    | `/api/products/:id`                     | Read one product                        |
| PATCH  | `/api/products/:id`                     | Change product fields                   |
| DELETE | `/api/products/:id`                     | Delete an unreferenced product          |
| POST   | `/api/products/:id/variants`            | Add a variant                           |
| PATCH  | `/api/products/:id/variants/:variantId` | Change variant fields                   |
| DELETE | `/api/products/:id/variants/:variantId` | Delete a variant                        |
| GET    | `/api/products/:id/price?variantId=`    | Resolve base, extra, and unit price     |
| PUT    | `/api/products/:id/taxes`               | Replace the product's tax set           |
| GET    | `/api/taxes`                            | Paginated tax rules                     |
| POST   | `/api/taxes`                            | Create a tax rule                       |
| PATCH  | `/api/taxes/:id`                        | Change tax fields                       |
| DELETE | `/api/taxes/:id`                        | Delete an unreferenced tax rule         |

## Edge cases

Invalid money and date inputs return 400. Duplicate SKUs and tax names return 409. Missing products and variants return specific 404 errors; a variant from a different product is rejected. A product referenced by a quotation template cannot be deleted. Tax replacement is set based: duplicates collapse, and unknown IDs reject the entire request.
