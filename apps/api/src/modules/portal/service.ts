import Decimal from 'decimal.js';
import type { AuthPrincipal } from '../../common/auth.types.js';
import { AppError } from '../../common/errors.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { todayIso } from '../subscriptions/lifecycle.js';
import {
  getSubscription,
  listSubscriptions,
  transitionSubscription,
  type TransitionTarget,
} from '../subscriptions/service.js';
import { findCustomerInvoice, listCustomerInvoices, type InvoiceRow } from './repository.js';

export type PortalAction = 'pause' | 'resume' | 'renew' | 'close';

const actionTargets: Record<PortalAction, TransitionTarget> = {
  pause: 'Paused',
  resume: 'Active',
  renew: 'renew',
  close: 'Closed',
};

// Customers always carry a customer id (DB CHECK); fail closed if one ever does not.
export function portalCustomerId(principal: AuthPrincipal): number {
  if (principal.customerId === null) {
    throw new AppError(403, 'FORBIDDEN', 'This account is not linked to a customer');
  }
  return principal.customerId;
}

function publicInvoice(row: InvoiceRow) {
  const total = new Decimal(row.total);
  const paid = new Decimal(row.amount_paid);
  return {
    id: Number(row.id),
    invoice_number: row.invoice_number,
    subscription_id: Number(row.subscription_id),
    subscription_number: row.subscription_number,
    period_start: row.period_start,
    period_end: row.period_end,
    issued_date: row.issued_date,
    due_date: row.due_date,
    status: row.status,
    subtotal: new Decimal(row.subtotal).toFixed(2),
    tax_amount: new Decimal(row.tax_amount).toFixed(2),
    discount_total: new Decimal(row.discount_total).toFixed(2),
    total: total.toFixed(2),
    amount_paid: paid.toFixed(2),
    outstanding: Decimal.max(total.minus(paid), 0).toFixed(2),
    is_overdue: row.is_overdue,
  };
}

export async function listMySubscriptions(principal: AuthPrincipal, page: number, pageSize: number) {
  return listSubscriptions({ customerId: portalCustomerId(principal) }, page, pageSize);
}

export async function getMySubscription(principal: AuthPrincipal, id: number) {
  return getSubscription(id, portalCustomerId(principal));
}

export async function actOnMySubscription(principal: AuthPrincipal, id: number, action: PortalAction) {
  return transitionSubscription(id, actionTargets[action], { id: principal.id }, {
    customerId: portalCustomerId(principal),
    reason: `portal_${action}`,
  });
}

export async function listMyInvoices(principal: AuthPrincipal, page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await listCustomerInvoices(portalCustomerId(principal), todayIso(), limit, offset);
  return { data: result.rows.map(publicInvoice), meta: paginationMeta(page, pageSize, result.total) };
}

export async function getMyInvoice(principal: AuthPrincipal, id: number) {
  const row = await findCustomerInvoice(portalCustomerId(principal), id, todayIso());
  if (!row) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found');
  return publicInvoice(row);
}
