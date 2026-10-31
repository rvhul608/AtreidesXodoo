# Customer support assistant

The support assistant offers guided lookups and an experimental local-model chat. It never accepts arbitrary database queries. An authenticated customer can request their subscriptions, unpaid invoices, or an invoice breakdown.

The UI sends `POST /api/support/message` with one of these JSON bodies:

- `{ "topic": "subscriptions" }`
- `{ "topic": "unpaid_invoices" }`
- `{ "topic": "invoice_details", "invoiceId": 123 }`

The response is `{ "data": { "message": "...", "items": [...] } }`. Lists return at most 20 items. Amounts are decimal strings. An unknown invoice and another customer's invoice both return the same empty result.

The route requires a customer session and derives the customer ID from `request.auth`, never the request body. The invoice breakdown reads stored totals; it does not yet call the billing engine's detailed explanation service.

## Knowledge and local chat

After migrations, authenticated staff and admins can create and edit documents using `POST /api/support-knowledge` and `PUT /api/support-knowledge/:id`, with `{ "title": "...", "body": "...", "published": true }`. `GET /api/support-knowledge?page=1&pageSize=20` lists documents, including drafts. Set `published` to false to remove a document from customer retrieval. Do not put private account information in shared knowledge.

Customers can send `POST /api/support/chat` with `{ "message": "What does the plan include?" }`. To include account information, the UI must explicitly specify `account`, for example `{ "message": "When is my next payment?", "account": { "topic": "unpaid_invoices" } }`. Topics match the guided API above. The backend searches published documents with PostgreSQL full-text search and returns `{ data: { answer, sources: [{ id, title }] } }`. It provides only matching document excerpts and explicitly requested customer-scoped account data to the model. Keyword search is not semantic vector search, and answers must be tested for accuracy.

The backend calls a llama.cpp OpenAI-compatible server at `http://127.0.0.1:8080` only. With a compatible `llama-server` binary installed, launch the downloaded model from the repository root:

```sh
models/llama-b11979/llama-server -m models/Qwen3-0.6B-Q8_0.gguf --host 127.0.0.1 --port 8080 -c 4096 --no-webui
```

The model and runtime files are ignored by Git and must be downloaded separately on another machine. The endpoint reports 503 when the server is unavailable; PostgreSQL and the model runtime must both be running. Model generation may exceed the project's two-second target, particularly on CPU. Generated text is untrusted; the UI must render it as text and never execute it. Do not expose the local model server to the network.
