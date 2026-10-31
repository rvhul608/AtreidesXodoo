# Customer support assistant

The support assistant searches published help articles and performs verified account lookups. It runs with the normal Docker stack and needs no model server, API key, or download. It never accepts arbitrary database queries. An authenticated customer can request their subscriptions, unpaid invoices, or an invoice breakdown. Staff and admins can use knowledge search, while account lookups require a customer session.

The UI sends `POST /api/support/message` with one of these JSON bodies:

- `{ "topic": "subscriptions" }`
- `{ "topic": "unpaid_invoices" }`
- `{ "topic": "invoice_details", "invoiceId": 123 }`

The response is `{ "data": { "message": "...", "items": [...] } }`. Lists return at most 20 items. Amounts are decimal strings. An unknown invoice and another customer's invoice both return the same empty result.

The route requires a customer session and derives the customer ID from `request.auth`, never the request body. The invoice breakdown reads stored totals; it does not yet call the billing engine's detailed explanation service.

## Knowledge and chat

After migrations, authenticated staff and admins can create and edit documents using `POST /api/support-knowledge` and `PUT /api/support-knowledge/:id`, with `{ "title": "...", "body": "...", "published": true }`. `GET /api/support-knowledge?page=1&pageSize=20` lists documents, including drafts. Set `published` to false to remove a document from customer retrieval. Do not put private account information in shared knowledge.

Send `POST /api/support/chat` with `{ "message": "How do I pause my subscription?" }`. Common account questions are recognized automatically: subscriptions, next billing, unpaid invoices, and `invoice 123`. Explicit `account` topics still work. Responses contain `{ data: { answer, sources: [{ id, title }], records: [...] } }`. Account records are always scoped to the session's customer ID, and draft invoices are hidden.

PostgreSQL full-text search drops common question words and searches remaining terms with OR, ranking matching articles. The response quotes up to two published excerpts and returns account records separately. This is keyword retrieval, not a general conversational model: it cannot infer arbitrary paraphrases or answer questions outside the knowledge base. Unknown questions return a contact-support message. React renders excerpts as plain text. Migration `0013` adds initial articles for pause/resume, renewal, invoices, and password resets.

Tests in `apps/api/test/support-chat.test.ts` cover authenticated access, staff knowledge search, natural-language account lookup, cross-customer isolation, draft visibility, and operation without any model connection.
