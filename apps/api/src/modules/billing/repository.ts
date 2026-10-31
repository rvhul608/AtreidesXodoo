import type { PoolClient } from 'pg';
import { pool } from '../../common/db.js';
import { withTransaction } from '../subscriptions/repository.js';
import type { DiscountRuleSnapshot, SubscriptionSnapshot } from './engine.js';

export { withTransaction };

export interface BillingSubscription extends SubscriptionSnapshot {
  paymentTerms: string;
}

interface SubscriptionHead {
  id: string;
  customer_id: string;
  period: SubscriptionSnapshot['period'];
  next_billing_date: string;
  expiry_date: string | null;
  payment_terms: string;
}

// SKIP LOCKED lets concurrent runs share the queue; excludeIds skips rows that failed earlier in this run.
export async function lockOneDueSubscription(
  client: PoolClient,
  asOf: string,
  excludeIds: number[] = [],
): Promise<BillingSubscription | null> {
  const selected = await client.query<SubscriptionHead>(
    `SELECT id, customer_id, period, next_billing_date::text AS next_billing_date,
       expiry_date::text AS expiry_date, payment_terms
     FROM subscriptions
     WHERE status = 'Active' AND next_billing_date <= $1
       AND (expiry_date IS NULL OR next_billing_date <= expiry_date)
       AND NOT (id = ANY($2::bigint[]))
     ORDER BY next_billing_date, id
     FOR UPDATE SKIP LOCKED LIMIT 1`,
    [asOf, excludeIds],
  );
  const head = selected.rows[0];
  if (!head) return null;

  const lineResult = await client.query<{
    id: string;
    product_id: string;
    product_variant_id: string | null;
    description: string;
    quantity: string;
    unit_price: string;
    tax_rate: string;
    tax_ids: string[];
  }>(
    `SELECT si.id, si.product_id, si.product_variant_id,
       COALESCE(si.description, p.name) AS description, si.quantity, si.unit_price,
       COALESCE(SUM(tr.rate), 0)::text AS tax_rate,
       COALESCE(ARRAY_AGG(tr.id ORDER BY tr.id) FILTER (WHERE tr.id IS NOT NULL), '{}') AS tax_ids
     FROM subscription_items si
     JOIN products p ON p.id = si.product_id
     LEFT JOIN product_taxes pt ON pt.product_id = p.id
     LEFT JOIN tax_rules tr ON tr.id = pt.tax_id
     WHERE si.subscription_id = $1
     GROUP BY si.id, p.name
     ORDER BY si.id`,
    [head.id],
  );

  return {
    id: Number(head.id),
    customerId: Number(head.customer_id),
    period: head.period,
    nextBillingDate: head.next_billing_date,
    expiryDate: head.expiry_date,
    paymentTerms: head.payment_terms,
    lines: lineResult.rows.map((line) => ({
      subscriptionItemId: Number(line.id),
      productId: Number(line.product_id),
      variantId: line.product_variant_id === null ? null : Number(line.product_variant_id),
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      taxRate: line.tax_rate,
      taxIds: line.tax_ids.map(Number),
    })),
  };
}

export async function lockDiscountRules(
  client: PoolClient,
  shouldLock = true,
): Promise<DiscountRuleSnapshot[]> {
  const result = await client.query<{
    id: string;
    kind: 'percentage' | 'fixed';
    value: string;
    applies_to: 'subscription' | 'products';
    min_purchase: string;
    min_quantity: string;
    starts_on: string | null;
    ends_on: string | null;
    usage_limit: number | null;
    times_used: number;
    is_active: boolean;
  }>(
    `SELECT id, kind, value, applies_to, min_purchase, min_quantity,
       starts_on::text AS starts_on, ends_on::text AS ends_on,
       usage_limit, times_used, is_active
     FROM discount_rules
     WHERE applies_to IN ('subscription', 'products')
     ORDER BY id ${shouldLock ? 'FOR UPDATE' : ''}`,
  );
  if (result.rows.length === 0) return [];
  const ids = result.rows.map((rule) => rule.id);
  const scopes = await client.query<{ discount_rule_id: string; scope_id: string }>(
    `SELECT discount_rule_id, scope_id FROM discount_scopes
     WHERE discount_rule_id = ANY($1::bigint[]) AND scope_type = 'product'`,
    [ids],
  );
  const productsByRule = new Map<number, number[]>();
  for (const scope of scopes.rows) {
    const ruleId = Number(scope.discount_rule_id);
    productsByRule.set(ruleId, [...(productsByRule.get(ruleId) ?? []), Number(scope.scope_id)]);
  }
  return result.rows.map((rule) => ({
    id: Number(rule.id),
    kind: rule.kind,
    value: rule.value,
    appliesTo: rule.applies_to,
    productIds: productsByRule.get(Number(rule.id)) ?? [],
    minPurchase: rule.min_purchase,
    minQuantity: rule.min_quantity,
    startsOn: rule.starts_on,
    endsOn: rule.ends_on,
    usageLimit: rule.usage_limit,
    timesUsed: rule.times_used,
    isActive: rule.is_active,
  }));
}

export async function createInvoice(
  client: PoolClient,
  subscription: BillingSubscription,
  invoice: {
    periodStart: string;
    periodEnd: string;
    issuedDate: string;
    dueDate: string;
    subtotal: string;
    discountTotal: string;
    taxAmount: string;
    total: string;
    trace: unknown;
  },
): Promise<number | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO invoices
       (customer_id, subscription_id, period_start, period_end, subtotal, discount_total,
        tax_amount, total, issued_date, due_date, status, trace)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Draft',$11)
     ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING id`,
    [
      subscription.customerId,
      subscription.id,
      invoice.periodStart,
      invoice.periodEnd,
      invoice.subtotal,
      invoice.discountTotal,
      invoice.taxAmount,
      invoice.total,
      invoice.issuedDate,
      invoice.dueDate,
      JSON.stringify(invoice.trace),
    ],
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

export async function insertInvoiceLines(
  client: PoolClient,
  invoiceId: number,
  lines: ReturnType<typeof import('./engine.js').computeInvoice>['lines'],
): Promise<void> {
  for (const [index, line] of lines.entries()) {
    await client.query(
      `INSERT INTO invoice_line_items
         (invoice_id, product_id, product_variant_id, description, quantity, unit_price,
          line_total, tax_rate, tax_amount, discount_amount, tax_ids, discount_rule_ids, line_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        invoiceId,
        line.productId,
        line.variantId,
        line.description,
        line.quantity,
        line.unitPrice,
        line.lineTotal,
        line.taxRate,
        line.taxAmount,
        line.discountAmount,
        line.taxIds,
        line.discountRuleIds,
        index + 1,
      ],
    );
  }
}

export async function recordDiscountUsage(
  client: PoolClient,
  invoiceId: number,
  usage: Array<{ ruleId: number; amount: string }>,
): Promise<void> {
  for (const entry of usage) {
    await client.query(
      'INSERT INTO discount_usage (discount_rule_id, invoice_id, amount) VALUES ($1, $2, $3)',
      [entry.ruleId, invoiceId, entry.amount],
    );
    await client.query('UPDATE discount_rules SET times_used = times_used + 1 WHERE id = $1', [entry.ruleId]);
  }
}

export async function insertInvoiceHistory(
  client: PoolClient,
  invoiceId: number,
  actorId: number | null,
  toStatus = 'Draft',
  action = 'generated',
): Promise<void> {
  await client.query(
    `INSERT INTO invoice_status_history (invoice_id, from_status, to_status, action, actor_user_id)
     VALUES ($1, NULL, $2, $3, $4)`,
    [invoiceId, toStatus, action, actorId],
  );
  await client.query('SELECT pg_notify($1, $2)', [
    'invoice_status_changed',
    JSON.stringify({ invoiceId, from: null, to: toStatus, action }),
  ]);
}

export async function notifyInvoiceCreated(
  client: PoolClient,
  invoiceId: number,
  subscriptionId: number,
): Promise<void> {
  await client.query('SELECT pg_notify($1, $2)', [
    'invoice_created',
    JSON.stringify({ invoiceId, subscriptionId }),
  ]);
}

export async function advanceBillingDate(
  client: PoolClient,
  subscriptionId: number,
  nextDate: string,
): Promise<void> {
  await client.query('UPDATE subscriptions SET next_billing_date = $2, updated_at = NOW() WHERE id = $1', [
    subscriptionId,
    nextDate,
  ]);
}

export async function findSubscriptionForPreview(id: number): Promise<BillingSubscription | null> {
  return withTransaction(async (client) => {
    const selected = await client.query<SubscriptionHead>(
      `SELECT id, customer_id, period, next_billing_date::text AS next_billing_date,
         expiry_date::text AS expiry_date, payment_terms
       FROM subscriptions WHERE id = $1`,
      [id],
    );
    const row = selected.rows[0];
    if (!row) return null;
    const lines = await client.query<{
      id: string;
      product_id: string;
      product_variant_id: string | null;
      description: string;
      quantity: string;
      unit_price: string;
      tax_rate: string;
      tax_ids: string[];
    }>(
      `SELECT si.id, si.product_id, si.product_variant_id, COALESCE(si.description, p.name) AS description,
         si.quantity, si.unit_price, COALESCE(SUM(tr.rate),0)::text AS tax_rate,
         COALESCE(ARRAY_AGG(tr.id) FILTER (WHERE tr.id IS NOT NULL), '{}') AS tax_ids
       FROM subscription_items si JOIN products p ON p.id = si.product_id
       LEFT JOIN product_taxes pt ON pt.product_id = p.id LEFT JOIN tax_rules tr ON tr.id = pt.tax_id
       WHERE si.subscription_id = $1 GROUP BY si.id,p.name ORDER BY si.id`,
      [id],
    );
    return {
      id: Number(row.id),
      customerId: Number(row.customer_id),
      period: row.period,
      nextBillingDate: row.next_billing_date,
      expiryDate: row.expiry_date,
      paymentTerms: row.payment_terms,
      lines: lines.rows.map((line) => ({
        subscriptionItemId: Number(line.id),
        productId: Number(line.product_id),
        variantId: line.product_variant_id === null ? null : Number(line.product_variant_id),
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        taxRate: line.tax_rate,
        taxIds: line.tax_ids.map(Number),
      })),
    };
  });
}

export async function loadPreviewRules(): Promise<DiscountRuleSnapshot[]> {
  const client = await pool.connect();
  try {
    return await lockDiscountRules(client, false);
  } finally {
    client.release();
  }
}
