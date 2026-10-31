# Customer support assistant

The support assistant is a guided, read-only feature. It does not use an AI model or accept arbitrary database queries. An authenticated customer can request their subscriptions, unpaid invoices, or an invoice breakdown.

The UI sends `POST /api/support/message` with one of these JSON bodies:

- `{ "topic": "subscriptions" }`
- `{ "topic": "unpaid_invoices" }`
- `{ "topic": "invoice_details", "invoiceId": 123 }`

The response is `{ "data": { "message": "...", "items": [...] } }`. Lists return at most 20 items. Amounts are decimal strings. An unknown invoice and another customer's invoice both return the same empty result.

The route requires a customer session and derives the customer ID from `request.auth`, never the request body. The invoice breakdown reads stored totals; it does not yet call the billing engine's detailed explanation service.
