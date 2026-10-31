import Decimal from 'decimal.js';
import { addDays, addPeriod } from '../subscriptions/lifecycle.js';
import type { PlanPeriod } from '../subscriptions/repository.js';

export interface SubscriptionSnapshot {
  id: number;
  customerId: number;
  period: PlanPeriod;
  nextBillingDate: string;
  expiryDate: string | null;
  lines: Array<{
    subscriptionItemId: number;
    productId: number;
    variantId: number | null;
    description: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    taxIds: number[];
  }>;
}

export interface DiscountRuleSnapshot {
  id: number;
  kind: 'percentage' | 'fixed';
  value: string;
  appliesTo: 'subscription' | 'products';
  productIds: number[];
  minPurchase: string;
  minQuantity: string;
  startsOn: string | null;
  endsOn: string | null;
  usageLimit: number | null;
  timesUsed: number;
  isActive: boolean;
}

export type ComputedInvoiceLine = SubscriptionSnapshot['lines'][number] & {
  lineTotal: string;
  discountAmount: string;
  discountRuleIds: number[];
  taxAmount: string;
};

export interface ComputedInvoice {
  periodStart: string;
  periodEnd: string;
  lines: ComputedInvoiceLine[];
  subtotal: string;
  discountTotal: string;
  taxAmount: string;
  total: string;
  appliedRuleIds: number[];
  trace: {
    considered: Array<{ ruleId: number; applied: boolean; reason: string; amount: string }>;
    lines: Array<{ subscriptionItemId: number; discounts: number[] }>;
  };
}

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function computeInvoice(
  snapshot: SubscriptionSnapshot,
  asOf: string,
  rules: DiscountRuleSnapshot[],
): ComputedInvoice {
  void asOf;
  const periodStart = snapshot.nextBillingDate;
  const periodEnd = addDays(addPeriod(periodStart, snapshot.period), -1);
  const lines = snapshot.lines.map((line) => {
    const amount = money(new Decimal(line.quantity).times(line.unitPrice));
    return {
      ...line,
      lineTotal: amount.toFixed(2),
      discountAmount: '0.00',
      discountRuleIds: [] as number[],
      taxAmount: '0.00',
      remaining: amount,
      amount,
    };
  });
  const considered: ComputedInvoice['trace']['considered'] = [];
  const appliedRuleIds: number[] = [];

  for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
    const selected = lines.filter(
      (line) => rule.appliesTo === 'subscription' || rule.productIds.includes(line.productId),
    );
    let reason = '';
    if (!rule.isActive) reason = 'inactive';
    else if (rule.startsOn !== null && periodStart < rule.startsOn) reason = 'not started';
    else if (rule.endsOn !== null && periodStart > rule.endsOn) reason = 'expired';
    else if (rule.usageLimit !== null && rule.timesUsed >= rule.usageLimit) reason = 'usage limit reached';
    else if (selected.length === 0) reason = 'no matching products';
    const base = selected.reduce((sum, line) => sum.plus(line.remaining), new Decimal(0));
    const quantity = selected.reduce((sum, line) => sum.plus(line.quantity), new Decimal(0));
    if (!reason && base.lessThan(rule.minPurchase)) {
      reason = `below minimum purchase ${money(rule.minPurchase).toFixed(2)}`;
    }
    if (!reason && quantity.lessThan(rule.minQuantity)) reason = 'below minimum quantity';
    if (reason) {
      considered.push({ ruleId: rule.id, applied: false, reason, amount: '0.00' });
      continue;
    }

    const before = selected.reduce((sum, line) => sum.plus(line.remaining), new Decimal(0));
    if (rule.kind === 'percentage') {
      const percent = new Decimal(rule.value).div(100);
      for (const line of selected) {
        const discount = Decimal.min(line.remaining, money(line.remaining.times(percent)));
        line.remaining = line.remaining.minus(discount);
        line.discountRuleIds.push(rule.id);
      }
    } else if (before.greaterThan(0)) {
      const requested = Decimal.min(new Decimal(rule.value), before);
      let allocated = new Decimal(0);
      selected.forEach((line, index) => {
        const remainingBudget = requested.minus(allocated);
        const proportional =
          index === selected.length - 1
            ? remainingBudget
            : money(requested.times(line.remaining).div(before));
        const discount = Decimal.max(0, Decimal.min(line.remaining, remainingBudget, proportional));
        line.remaining = line.remaining.minus(discount);
        allocated = allocated.plus(discount);
        line.discountRuleIds.push(rule.id);
      });
    }
    const amount = before.minus(selected.reduce((sum, line) => sum.plus(line.remaining), new Decimal(0)));
    considered.push({ ruleId: rule.id, applied: true, reason: 'applied', amount: amount.toFixed(2) });
    appliedRuleIds.push(rule.id);
  }

  const resultLines = lines.map((line) => {
    const discount = line.amount.minus(line.remaining);
    const tax = money(line.remaining.times(line.taxRate));
    return {
      subscriptionItemId: line.subscriptionItemId,
      productId: line.productId,
      variantId: line.variantId,
      description: line.description,
      quantity: new Decimal(line.quantity).toFixed(2),
      unitPrice: money(line.unitPrice).toFixed(2),
      taxRate: new Decimal(line.taxRate).toString(),
      taxIds: line.taxIds,
      lineTotal: line.amount.toFixed(2),
      discountAmount: discount.toFixed(2),
      discountRuleIds: line.discountRuleIds,
      taxAmount: tax.toFixed(2),
    };
  });
  const subtotal = resultLines.reduce((sum, line) => sum.plus(line.lineTotal), new Decimal(0));
  const discountTotal = resultLines.reduce((sum, line) => sum.plus(line.discountAmount), new Decimal(0));
  const taxAmount = resultLines.reduce((sum, line) => sum.plus(line.taxAmount), new Decimal(0));
  return {
    periodStart,
    periodEnd,
    lines: resultLines,
    subtotal: subtotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    taxAmount: taxAmount.toFixed(2),
    total: subtotal.minus(discountTotal).plus(taxAmount).toFixed(2),
    appliedRuleIds,
    trace: {
      considered,
      lines: lines.map((line) => ({
        subscriptionItemId: line.subscriptionItemId,
        discounts: line.discountRuleIds,
      })),
    },
  };
}
