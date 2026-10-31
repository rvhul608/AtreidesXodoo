import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  computeInvoice,
  type DiscountRuleSnapshot,
  type SubscriptionSnapshot,
} from '../src/modules/billing/engine.js';

const snapshot: SubscriptionSnapshot = {
  id: 1,
  customerId: 1,
  period: 'monthly',
  nextBillingDate: '2026-01-31',
  expiryDate: null,
  lines: [
    {
      subscriptionItemId: 1,
      productId: 11,
      variantId: 4,
      description: 'Widget (Large)',
      quantity: '2',
      unitPrice: '12.50',
      taxRate: '0.18',
      taxIds: [1],
    },
    {
      subscriptionItemId: 2,
      productId: 12,
      variantId: null,
      description: 'Service',
      quantity: '1',
      unitPrice: '20.00',
      taxRate: '0',
      taxIds: [],
    },
  ],
};

function rule(overrides: Partial<DiscountRuleSnapshot> = {}): DiscountRuleSnapshot {
  return {
    id: 1,
    kind: 'percentage',
    value: '10',
    appliesTo: 'subscription',
    productIds: [],
    minPurchase: '0',
    minQuantity: '0',
    startsOn: null,
    endsOn: null,
    usageLimit: null,
    timesUsed: 0,
    isActive: true,
    ...overrides,
  };
}

describe('computeInvoice', () => {
  it('prices lines, discounts per line and taxes the discounted amount', () => {
    const invoice = computeInvoice(snapshot, '2026-02-01', [rule()]);
    expect(invoice.periodEnd).toBe('2026-02-27');
    expect(invoice.subtotal).toBe('45.00');
    expect(invoice.discountTotal).toBe('4.50');
    expect(invoice.lines[0].taxAmount).toBe('4.05');
    expect(invoice.total).toBe('44.55');
  });

  it('limits product rules to target products and explains skipped rules', () => {
    const invoice = computeInvoice(snapshot, '2026-02-01', [
      rule({ appliesTo: 'products', productIds: [12] }),
      rule({ id: 2, startsOn: '2026-03-01' }),
      rule({ id: 3, usageLimit: 1, timesUsed: 1 }),
      rule({ id: 4, minPurchase: '500' }),
    ]);
    expect(invoice.lines[0].discountAmount).toBe('0.00');
    expect(invoice.lines[1].discountAmount).toBe('2.00');
    expect(invoice.trace.considered.map((entry) => entry.reason)).toEqual([
      'applied',
      'not started',
      'usage limit reached',
      'below minimum purchase 500.00',
    ]);
  });

  it('stacks fixed rules with the exact remainder on the last eligible line', () => {
    const invoice = computeInvoice(snapshot, '2026-02-01', [
      rule({ kind: 'fixed', value: '10.00' }),
      rule({ id: 2, kind: 'fixed', value: '1.00' }),
    ]);
    expect(invoice.discountTotal).toBe('11.00');
    const distributed = invoice.lines.reduce((sum, line) => sum.plus(line.discountAmount), new Decimal(0));
    expect(distributed.toFixed(2)).toBe('11.00');
    expect(invoice.appliedRuleIds).toEqual([1, 2]);
  });

  it('skips minimum quantity and no-match cases with trace reasons', () => {
    const invoice = computeInvoice(snapshot, '2026-02-01', [
      rule({ minQuantity: '100' }),
      rule({ id: 2, appliesTo: 'products', productIds: [99] }),
      rule({ id: 3, endsOn: '2026-01-30' }),
    ]);
    expect(invoice.trace.considered.map((entry) => entry.reason)).toEqual([
      'below minimum quantity',
      'no matching products',
      'expired',
    ]);
  });
});
