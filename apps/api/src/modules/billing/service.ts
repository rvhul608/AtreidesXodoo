import Decimal from 'decimal.js';
import { AppError } from '../../common/errors.js';
import { addDays, todayIso } from '../subscriptions/lifecycle.js';
import {
  findSubscriptionForPreview,
  loadPreviewRules,
  lockDiscountRules,
  withTransaction,
} from './repository.js';
import { computeInvoice, type DiscountRuleSnapshot } from './engine.js';
import { claimBillingBatch, loadBatchSubscriptions, persistBillingBatch, type BatchInvoice } from './batch.repository.js';

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

export interface BillingOptions { concurrency?: number; batchSize?: number }

function bounded(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new Error(`Billing setting must be an integer between 1 and ${max}`);
  return parsed;
}

/** Bounded workers claim disjoint batches; a failed batch falls back to single-row transactions. */
export async function runBilling(asOf: string, actor: Actor, options: BillingOptions = {}) {
  const started = performance.now();
  const concurrency = bounded(options.concurrency ?? process.env.BILLING_CONCURRENCY, 4, 8);
  const batchSize = bounded(options.batchSize ?? process.env.BILLING_BATCH_SIZE, 100, 500);
  let skippedExisting = 0;
  const invoiceIds: number[] = [];
  const failures: BillingFailure[] = [];
  const failedIds = new Set<number>();
  async function worker() {
    let size = batchSize;
    while (true) {
      let claimed: number[] = [];
      try {
        const result = await withTransaction(async (client) => {
          const heads = await claimBillingBatch(client, asOf, [...failedIds], size);
          claimed = heads.map((head) => Number(head.id));
          if (!heads.length) return null;
          const subscriptions = await loadBatchSubscriptions(client, heads);
          const rules = await lockDiscountRules(client);
          const entries: BatchInvoice[] = [];
          for (const [index, subscription] of subscriptions.entries()) {
            const invoice = computeInvoice(subscription, asOf, rules);
            const existing = heads[index].existing;
            entries.push({ subscriptionId: subscription.id, customerId: subscription.customerId,
              existing, nextDate: addDays(invoice.periodEnd, 1),
              invoice: { ...invoice, issuedDate: asOf, dueDate: dueDate(asOf, subscription.paymentTerms) } });
            if (!existing) for (const rule of rules) {
              if (invoice.appliedRuleIds.includes(rule.id)) rule.timesUsed += 1;
            }
          }
          const ids = await persistBillingBatch(client, entries, actor.id);
          return { ids, skipped: entries.length - ids.length };
        });
        if (result === null) break;
        invoiceIds.push(...result.ids);
        skippedExisting += result.skipped;
      } catch (error) {
        if (!claimed.length) throw error;
        if (claimed.length > 1) { size = 1; continue; }
        const id = claimed[0];
        if (!failedIds.has(id)) {
          failedIds.add(id);
          failures.push({ subscription_id: id, error: (error as Error).message });
        }
      }
    }
  }
  const results = await Promise.allSettled(Array.from({ length: concurrency }, () => worker()));
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  return { asOf, created: invoiceIds.length, skippedExisting, invoiceIds, failed: failures,
    durationMs: Math.round(performance.now() - started), concurrency, batchSize };
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
