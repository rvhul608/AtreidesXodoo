# Payments walkthrough

## Recording a payment

`POST /api/invoices/:id/payments` (admin, staff) with `method` (`cash`, `bank_transfer`, `card`,
`upi`, `cheque`, `other`), `amount` (decimal string), `paidOn` (not in the future) and an optional
`note`. In one transaction the service:

1. locks the invoice row (`SELECT ... FOR UPDATE`);
2. accepts only Confirmed invoices (Draft, Cancelled and Paid return 409 `INVOICE_NOT_PAYABLE`);
3. computes outstanding = total - received payments and rejects anything larger with
   409 `OVERPAYMENT` and the outstanding amount in `details`;
4. inserts the payment; when the balance reaches 0.00 it sets the invoice to Paid, stamps `paid_at`
   and writes a Confirmed -> Paid history row;
5. writes an audit entry and `pg_notify('payment_recorded')` (plus `invoice_status_changed` when paid).

Because of the row lock, two payments arriving at the same moment can't both squeeze in: the second one
sees the first one's amount and is rejected if it would overpay. A test runs exactly that race.

## Paid, outstanding, overdue

Every invoice view (`/api/invoices`, the portal) shows `amount_paid`, `outstanding` and `is_overdue`.
Overdue is derived on read (due date before today and still Confirmed) and never stored, so it can't
go stale. The renewal chase emails customers 3 days before, on, and 7 days after the due date.

## Endpoints (admin, staff)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/invoices/:id/payments` | record a payment |
| GET | `/api/invoices/:id/payments` | payments on one invoice |
| GET | `/api/payments?method=&customerId=&invoiceId=&from=&to=` | paginated list |
| GET | `/api/payments/summary?from=&to=` | count, total received and totals per method |

All amounts are `NUMERIC(12,2)` in the database and decimal strings in JSON, computed with decimal.js.
