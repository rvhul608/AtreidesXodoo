import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { writeAuditEntry } from '../../common/audit.repository.js';
import { writeOutboxEmail } from '../../common/outbox.repository.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import {
  findBillingContact,
  findInvoice,
  findInvoiceHistory,
  findInvoiceLines,
  findInvoicePayments,
  listInvoices,
  lockInvoice,
  markInvoiceSent,
  receivedPaymentExists,
  releaseDiscountUsage,
  updateInvoiceStatus,
  withTransaction,
  writeInvoiceHistory,
  type InvoiceFilters,
  type InvoiceRow,
} from './repository.js';
import { decideInvoiceTransition, type InvoiceAction, type InvoiceStatus } from './lifecycle.js';

export interface Actor {
  id: number;
}

function publicRow(row: InvoiceRow) {
  return {
    id: Number(row.id),
    invoice_number: row.invoice_number,
    customer_id: Number(row.customer_id),
    customer_name: row.customer_name,
    subscription_id: Number(row.subscription_id),
    subscription_number: row.subscription_number,
    subtotal: new Decimal(row.subtotal).toFixed(2),
    discount_total: new Decimal(row.discount_total).toFixed(2),
    tax_amount: new Decimal(row.tax_amount).toFixed(2),
    total: new Decimal(row.total).toFixed(2),
    issued_date: row.issued_date,
    due_date: row.due_date,
    status: row.status,
    amount_paid: new Decimal(row.amount_paid).toFixed(2),
    outstanding: new Decimal(row.outstanding).toFixed(2),
    is_overdue: row.is_overdue,
  };
}

export async function listInvoicePage(filters: InvoiceFilters, page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await listInvoices(filters, limit, offset);
  return { data: result.rows.map(publicRow), meta: paginationMeta(page, pageSize, result.total) };
}

export async function getInvoice(id: number) {
  const row = await findInvoice(id);
  if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found');
  const [lines, history, payments] = await Promise.all([
    findInvoiceLines(id),
    findInvoiceHistory(id),
    findInvoicePayments(id),
  ]);
  return {
    ...publicRow(row),
    lines: lines.map((line) => ({
      ...line,
      id: Number(line.id),
      quantity: new Decimal(line.quantity).toFixed(2),
      unit_price: new Decimal(line.unit_price).toFixed(2),
      line_total: new Decimal(line.line_total).toFixed(2),
      tax_rate: line.tax_rate,
      tax_amount: new Decimal(line.tax_amount).toFixed(2),
      discount_amount: new Decimal(line.discount_amount).toFixed(2),
    })),
    history,
    payments,
  };
}

export async function transitionInvoice(id: number, action: InvoiceAction, actor: Actor, reason?: string) {
  return withTransaction(async (client) => {
    const row = await lockInvoice(client, id);
    if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found');
    const decision = decideInvoiceTransition(row.status as InvoiceStatus, action);
    if (action === 'cancel' && (await receivedPaymentExists(client, id))) {
      throw new AppError(
        409,
        'INVOICE_HAS_PAYMENTS',
        'An invoice with received payments cannot be cancelled',
      );
    }
    if (action === 'cancel') await releaseDiscountUsage(client, id);
    if (decision.changesStatus) {
      const timestampColumn = action === 'confirm' ? 'confirmed_at' : 'cancelled_at';
      await updateInvoiceStatus(client, id, decision.to, timestampColumn);
    } else {
      await markInvoiceSent(client, id);
      const recipient = await findBillingContact(client, Number(row.customer_id));
      if (recipient) {
        const total = new Decimal(row.total).toFixed(2);
        await writeOutboxEmail(client, {
          customerId: Number(row.customer_id),
          recipient,
          subject: `Invoice ${row.invoice_number} from Brightloop Software`,
          body: `Invoice ${row.invoice_number} total ${total}, due ${row.due_date}.`,
        });
      }
    }
    await writeInvoiceHistory(client, id, decision.from, decision.to, action, actor.id, reason);
    await writeAuditEntry(client, {
      customerId: Number(row.customer_id),
      userId: actor.id,
      entityType: 'invoice',
      entityId: id,
      action,
      changes: { from: decision.from, to: decision.to, reason },
    });
    return { id, status: decision.to, action };
  });
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

export async function printInvoice(id: number) {
  const invoice = await getInvoice(id);
  const lines = invoice.lines
    .map((line) => {
      const amount = new Decimal(line.line_total)
        .minus(line.discount_amount)
        .plus(line.tax_amount)
        .toFixed(2);
      return `<tr><td>${escapeHtml(String(line.description))}</td>
    <td>${escapeHtml(String(line.quantity))}</td><td>${escapeHtml(String(line.unit_price))}</td>
    <td>${escapeHtml(String(line.discount_amount))}</td><td>${escapeHtml(String(line.tax_amount))}</td>
    <td>${escapeHtml(amount)}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8">
    <title>${escapeHtml(invoice.invoice_number)}</title>
    <style>body{font:16px Arial;margin:40px;color:#222}table{width:100%;border-collapse:collapse}
    th,td{padding:10px;border-bottom:1px solid #ccc;text-align:left}.totals{margin-left:auto;width:280px}
    @media print{body{margin:12mm}}</style></head><body><h1>Brightloop Software</h1>
    <h2>Invoice ${escapeHtml(invoice.invoice_number)}</h2><p>${escapeHtml(invoice.customer_name)}</p>
    <p>Issued ${escapeHtml(invoice.issued_date)} · Due ${escapeHtml(invoice.due_date)} ·
    ${escapeHtml(invoice.status)}</p><table><thead><tr><th>Item</th><th>Qty</th><th>Unit price</th>
    <th>Discount</th><th>Tax</th><th>Amount</th></tr></thead><tbody>${lines}</tbody></table>
    <div class="totals"><p>Subtotal ${escapeHtml(invoice.subtotal)}</p>
    <p>Discount ${escapeHtml(invoice.discount_total)}</p><p>Tax ${escapeHtml(invoice.tax_amount)}</p>
    <strong>Total ${escapeHtml(invoice.total)}</strong></div></body></html>`;
}
