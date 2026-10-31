# Invoices walkthrough

Invoices move from Draft to Confirmed to Paid, with Paid reserved for the payments module. Draft and
Confirmed invoices can be cancelled unless a received payment exists. Each status change stores a
history row and emits `invoice_status_changed` in the same transaction.

Confirming records `confirmed_at`. Sending is allowed for Confirmed or Paid invoices; it records
`sent_at`, appends a `sent` history event, and queues an email for the customer's first active user.
Printing returns a self-contained HTML invoice with escaped customer and line text.

Cancelling releases discount usage and decrements each affected rule's usage count, so a cancelled
invoice does not consume a limited promotion. Overdue is derived at read time from a Confirmed status
and a due date before today. The portal excludes Draft invoices.

## Endpoints (admin, staff)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/invoices?status=&customerId=&subscriptionId=&overdue=true&q=&dueFrom=&dueTo=` | paginated list with amount paid, outstanding and `is_overdue` |
| GET | `/api/invoices/:id` | detail with lines, status history and payments |
| POST | `/api/invoices/:id/confirm` | Draft -> Confirmed |
| POST | `/api/invoices/:id/cancel` | Draft/Confirmed -> Cancelled (409 `INVOICE_HAS_PAYMENTS` once paid into) |
| POST | `/api/invoices/:id/send` | email to the customer via `outbox_emails` |
| GET | `/api/invoices/:id/print` | print-ready HTML page |

Every action goes through one `transitionInvoice` function: it locks the invoice row, checks the move
in `lifecycle.ts` (409 `INVALID_TRANSITION` otherwise), and writes the history row, audit entry and
notification in the same transaction. Customers read their own issued invoices through the portal.
