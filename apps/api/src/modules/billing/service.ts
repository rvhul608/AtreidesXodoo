import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { addDays, todayIso } from '../subscriptions/lifecycle.js';
import {
  advanceBillingDate,
  createInvoice,
  findSubscriptionForPreview,
  insertInvoiceHistory,
  insertInvoiceLines,
  loadPreviewRules,
  lockDiscountRules,
  lockOneDueSubscription,
  notifyInvoiceCreated,
  recordDiscountUsage,
  withTransaction,
} from './repository.js';
import { computeInvoice, type DiscountRuleSnapshot } from './engine.js';

export interface Actor {
  id: number | null;
}

function dueDate(issuedDate: string, paymentTerms: string): string {
  const match = paymentTerms.match(/net\s*(\d+)/i);
  return addDays(issuedDate, match ? Number(match[1]) : 0);
}

export interface BillingFailure {
  subscription_id: number;
  error: string;
}

/**
 * Bills every due subscription, one transaction per subscription. A failure rolls back only that
 * subscription (no invoice, billing date unchanged) and the run carries on with the rest.
 */
export async function runBilling(asOf: string, actor: Actor) {
  let created = 0;
  let skippedExisting = 0;
  const invoiceIds: number[] = [];
  const failures: BillingFailure[] = [];
  const failedIds: number[] = [];

  while (true) {
    let currentId: number | null = null;
    try {
      const billedId = await withTransaction(async (client) => {
        const subscription = await lockOneDueSubscription(client, asOf, failedIds);
        if (!subscription) return null;
        currentId = subscription.id;
        const rules = await lockDiscountRules(client);
        const invoice = computeInvoice(subscription, asOf, rules);
        const id = await createInvoice(client, subscription, {
          ...invoice,
          issuedDate: asOf,
          dueDate: dueDate(asOf, subscription.paymentTerms),
        });
        if (id === null) {
          // UNIQUE (subscription_id, period_start) already holds an invoice for this period.
          skippedExisting += 1;
        } else {
          await insertInvoiceLines(client, id, invoice.lines);
          const usageAmounts = invoice.trace.considered
            .filter((entry) => entry.applied)
            .map((entry) => ({ ruleId: entry.ruleId, amount: entry.amount }));
          await recordDiscountUsage(client, id, usageAmounts);
          await insertInvoiceHistory(client, id, actor.id);
          await notifyInvoiceCreated(client, id, subscription.id);
          created += 1;
          invoiceIds.push(id);
        }
        await advanceBillingDate(client, subscription.id, addDays(invoice.periodEnd, 1));
        return subscription.id;
      });
      if (billedId === null) break;
    } catch (error) {
      if (currentId === null) throw error;
      failedIds.push(currentId);
      failures.push({ subscription_id: currentId, error: (error as Error).message });
    }
  }

  return { asOf, created, skippedExisting, invoiceIds, failed: failures };
}

export async function previewBilling(subscriptionId: number, asOf: string) {
  const subscription = await findSubscriptionForPreview(subscriptionId);
  if (!subscription) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription was not found');
  const rules: DiscountRuleSnapshot[] = await loadPreviewRules();
  const invoice = computeInvoice(subscription, asOf, rules);
  return {
    ...invoice,
    dueDate: dueDate(asOf, subscription.paymentTerms),
    total: new Decimal(invoice.total).toFixed(2),
  };
}

export function billingDate(value?: string): string {
  return value ?? todayIso();
}
