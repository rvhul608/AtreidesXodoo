import type { PoolClient } from 'pg';
import type { BillingSubscription } from './repository.js';
import type { ComputedInvoice } from './engine.js';

export interface BillingHead {
  id: string; customer_id: string; period: BillingSubscription['period']; next_billing_date: string;
  expiry_date: string | null; payment_terms: string; existing: boolean;
}

export async function claimBillingBatch(client: PoolClient, asOf: string, exclude: number[], size: number): Promise<BillingHead[]> {
  const result = await client.query<BillingHead>(`
    SELECT s.id, s.customer_id, s.period, s.next_billing_date::text,
      s.expiry_date::text, s.payment_terms,
      EXISTS (SELECT 1 FROM invoices i WHERE i.subscription_id = s.id AND i.period_start = s.next_billing_date) AS existing
    FROM subscriptions s
    WHERE s.status = 'Active' AND s.next_billing_date <= $1
      AND (s.expiry_date IS NULL OR s.next_billing_date <= s.expiry_date)
      AND NOT (s.id = ANY($2::bigint[]))
    ORDER BY s.next_billing_date, s.id FOR UPDATE OF s SKIP LOCKED LIMIT $3`, [asOf, exclude, size]);
  return result.rows;
}

export async function loadBatchSubscriptions(client: PoolClient, heads: BillingHead[]): Promise<BillingSubscription[]> {
  const lines = await client.query<{
    subscription_id: string; id: string; product_id: string; product_variant_id: string | null;
    description: string; quantity: string; unit_price: string; tax_rate: string; tax_ids: string[];
  }>(`SELECT si.subscription_id, si.id, si.product_id, si.product_variant_id,
      COALESCE(si.description, p.name) AS description, si.quantity, si.unit_price,
      COALESCE(SUM(tr.rate), 0)::text AS tax_rate,
      COALESCE(ARRAY_AGG(tr.id ORDER BY tr.id) FILTER (WHERE tr.id IS NOT NULL), '{}') AS tax_ids
    FROM subscription_items si JOIN products p ON p.id = si.product_id
    LEFT JOIN product_taxes pt ON pt.product_id = p.id LEFT JOIN tax_rules tr ON tr.id = pt.tax_id
    WHERE si.subscription_id = ANY($1::bigint[]) GROUP BY si.id, p.name ORDER BY si.subscription_id, si.id`,
  [heads.map((head) => head.id)]);
  const grouped = new Map<string, BillingSubscription['lines']>();
  for (const line of lines.rows) {
    const group = grouped.get(line.subscription_id) ?? [];
    group.push({ subscriptionItemId: Number(line.id), productId: Number(line.product_id),
      variantId: line.product_variant_id === null ? null : Number(line.product_variant_id),
      description: line.description, quantity: line.quantity, unitPrice: line.unit_price,
      taxRate: line.tax_rate, taxIds: line.tax_ids.map(Number) });
    grouped.set(line.subscription_id, group);
  }
  return heads.map((head) => ({ id: Number(head.id), customerId: Number(head.customer_id),
    period: head.period, nextBillingDate: head.next_billing_date, expiryDate: head.expiry_date,
    paymentTerms: head.payment_terms, lines: grouped.get(head.id) ?? [] }));
}

export interface BatchInvoice {
  subscriptionId: number; customerId: number; existing: boolean; nextDate: string;
  invoice: ComputedInvoice & { issuedDate: string; dueDate: string };
}

/** One statement persists the whole batch; any SQL failure rolls it all back. */
export async function persistBillingBatch(client: PoolClient, entries: BatchInvoice[], actorId: number | null): Promise<number[]> {
  const usedRuleIds = [...new Set(entries.filter((entry) => !entry.existing)
    .flatMap((entry) => entry.invoice.appliedRuleIds))];
  if (usedRuleIds.length) {
    // Keep the same finite-then-unlimited lock order as invoice cancellation.
    // Unlimited counters are locked only for the final write, not for calculation.
    await client.query(`SELECT id FROM discount_rules WHERE id = ANY($1::bigint[])
      ORDER BY (usage_limit IS NULL), id FOR NO KEY UPDATE`, [usedRuleIds]);
  }
  const result = await client.query<{ id: string }>(`
    WITH input AS MATERIALIZED (SELECT value AS doc FROM jsonb_array_elements($1::jsonb)),
    inserted AS (
      INSERT INTO invoices (customer_id, subscription_id, period_start, period_end, subtotal,
        discount_total, tax_amount, total, issued_date, due_date, status, trace)
      SELECT (doc->>'customerId')::bigint, (doc->>'subscriptionId')::bigint,
        (doc->'invoice'->>'periodStart')::date, (doc->'invoice'->>'periodEnd')::date,
        (doc->'invoice'->>'subtotal')::numeric, (doc->'invoice'->>'discountTotal')::numeric,
        (doc->'invoice'->>'taxAmount')::numeric, (doc->'invoice'->>'total')::numeric,
        (doc->'invoice'->>'issuedDate')::date, (doc->'invoice'->>'dueDate')::date, 'Draft', doc->'invoice'->'trace'
      FROM input WHERE NOT (doc->>'existing')::boolean
      ON CONFLICT (subscription_id, period_start) DO NOTHING
      RETURNING id, subscription_id
    ), lines AS (
      INSERT INTO invoice_line_items (invoice_id, product_id, product_variant_id, description,
        quantity, unit_price, line_total, tax_rate, tax_amount, discount_amount, tax_ids, discount_rule_ids, line_number)
      SELECT i.id, (l->>'productId')::bigint, (l->>'variantId')::bigint, l->>'description',
        (l->>'quantity')::numeric, (l->>'unitPrice')::numeric, (l->>'lineTotal')::numeric,
        (l->>'taxRate')::numeric, (l->>'taxAmount')::numeric, (l->>'discountAmount')::numeric,
        ARRAY(SELECT jsonb_array_elements_text(l->'taxIds'))::bigint[],
        ARRAY(SELECT jsonb_array_elements_text(l->'discountRuleIds'))::bigint[], ordinal
      FROM inserted i JOIN input ON i.subscription_id = (doc->>'subscriptionId')::bigint
      CROSS JOIN LATERAL jsonb_array_elements(doc->'invoice'->'lines') WITH ORDINALITY AS line(l, ordinal)
    ), usage AS (
      INSERT INTO discount_usage (discount_rule_id, invoice_id, amount)
      SELECT (u->>'ruleId')::bigint, i.id, (u->>'amount')::numeric
      FROM inserted i JOIN input ON i.subscription_id = (doc->>'subscriptionId')::bigint
      CROSS JOIN LATERAL jsonb_array_elements(doc->'invoice'->'trace'->'considered') AS u
      WHERE (u->>'applied')::boolean RETURNING discount_rule_id
    ), counters AS (
      UPDATE discount_rules r SET times_used = r.times_used + counted.total
      FROM (SELECT discount_rule_id, COUNT(*)::int AS total FROM usage GROUP BY discount_rule_id) counted
      WHERE r.id = counted.discount_rule_id
    ), history AS (
      INSERT INTO invoice_status_history (invoice_id, from_status, to_status, action, actor_user_id)
      SELECT id, NULL, 'Draft', 'generated', $2 FROM inserted
    ), advanced AS (
      UPDATE subscriptions s SET next_billing_date = (doc->>'nextDate')::date, updated_at = NOW()
      FROM input WHERE s.id = (doc->>'subscriptionId')::bigint
    )
    SELECT id::text,
      pg_notify('invoice_created', json_build_object('invoiceId', id, 'subscriptionId', subscription_id)::text),
      pg_notify('invoice_status_changed', json_build_object('invoiceId', id, 'from', NULL, 'to', 'Draft', 'action', 'generated')::text)
    FROM inserted`, [JSON.stringify(entries), actorId]);
  return result.rows.map((row) => Number(row.id));
}
