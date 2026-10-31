import { AppError } from '../../common/errors.js';

export type InvoiceStatus = 'Draft' | 'Confirmed' | 'Paid' | 'Cancelled';

export type InvoiceAction = 'confirm' | 'cancel' | 'send';

export interface InvoiceTransition {
  from: InvoiceStatus;
  to: InvoiceStatus;
  action: InvoiceAction;
  changesStatus: boolean;
}

export function decideInvoiceTransition(status: InvoiceStatus, action: InvoiceAction): InvoiceTransition {
  if (action === 'confirm' && status === 'Draft') {
    return { from: status, to: 'Confirmed', action, changesStatus: true };
  }
  if (action === 'cancel' && (status === 'Draft' || status === 'Confirmed')) {
    return { from: status, to: 'Cancelled', action, changesStatus: true };
  }
  if (action === 'send' && (status === 'Confirmed' || status === 'Paid')) {
    return { from: status, to: status, action, changesStatus: false };
  }
  throw new AppError(409, 'INVALID_TRANSITION', `Cannot ${action} an invoice in ${status} status`);
}
