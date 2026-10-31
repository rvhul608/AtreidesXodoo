import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { withTransaction } from '../../common/db.js';
import {
  amountPaid,
  findPayment,
  insertPayment,
  listInvoicePayments,
  listPayments as listRows,
  lockInvoice,
  notify,
  paymentSummary,
  setInvoicePaid,
  writeAudit,
  type PaymentFilters,
  type PaymentInput,
  type PaymentRow,
} from './repository.js';

export interface Actor {
  id: number;
}

function publicPayment(row: PaymentRow) {
  return {
    id: Number(row.id),
    invoice_id: Number(row.invoice_id),
    invoice_number: row.invoice_number,
    customer_id: Number(row.customer_id),
    customer_name: row.customer_name,
    amount: new Decimal(row.amount).toFixed(2),
    method: row.payment_method,
    status: row.status,
    paid_on: row.paid_on,
    note: row.notes,
    recorded_by: row.recorded_by === null ? null : Number(row.recorded_by),
    created_at: row.created_at,
  };
}

export async function recordPayment(invoiceId: number, input: PaymentInput, actor: Actor) {
  const result = await withTransaction(async (client) => {
    const invoice = await lockInvoice(client, invoiceId);
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found');
    if (invoice.status !== 'Confirmed')
      throw new AppError(409, 'INVOICE_NOT_PAYABLE', 'Only Confirmed invoices accept payments');
    const outstanding = new Decimal(invoice.total).minus(await amountPaid(client, invoiceId));
    if (new Decimal(input.amount).greaterThan(outstanding)) {
      throw new AppError(409, 'OVERPAYMENT', 'Payment exceeds the outstanding balance', {
        outstanding: outstanding.toFixed(2),
      });
    }
    const id = await insertPayment(client, invoice, input, actor.id);
    const nextOutstanding = outstanding.minus(input.amount);
    if (nextOutstanding.isZero()) await setInvoicePaid(client, invoiceId, actor.id);
    await notify(client, 'payment_recorded', { id: Number(id), invoice_id: invoiceId, amount: input.amount });
    await writeAudit(client, {
      customerId: Number(invoice.customer_id),
      userId: actor.id,
      entityType: 'payment',
      entityId: Number(id),
      action: 'payment_recorded',
      changes: { invoiceId, amount: input.amount, method: input.method },
    });
    return {
      id,
      invoice,
      amountPaid: new Decimal(invoice.total).minus(nextOutstanding),
      outstanding: nextOutstanding,
      status: nextOutstanding.isZero() ? 'Paid' : 'Confirmed',
    };
  });
  const payment = await withTransaction((client) => findPayment(client, result.id));
  return {
    ...publicPayment(payment),
    invoice: {
      id: invoiceId,
      status: result.status,
      total: new Decimal(result.invoice.total).toFixed(2),
      amount_paid: result.amountPaid.toFixed(2),
      outstanding: result.outstanding.toFixed(2),
    },
  };
}

export async function getInvoicePayments(id: number) {
  return (await listInvoicePayments(id)).map(publicPayment);
}

export async function getPayments(filters: PaymentFilters, page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await listRows(filters, limit, offset);
  return { data: result.rows.map(publicPayment), meta: paginationMeta(page, pageSize, result.total) };
}

export async function getPaymentSummary(from?: string, to?: string) {
  return paymentSummary(from, to);
}
