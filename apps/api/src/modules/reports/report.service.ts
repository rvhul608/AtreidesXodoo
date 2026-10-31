import { Pool, QueryResultRow } from 'pg';

import { db } from '../../common/db.js';
import { Pagination, PaginationMeta } from '../../common/pagination.js';

export interface ReportFilters {
  customerId: number;
  startDate?: string;
  endDate?: string;
}

export interface DashboardSummary extends QueryResultRow {
  active_subscriptions: string;
  revenue_collected: string;
  amount_outstanding: string;
  overdue_invoices: string;
  mrr: string;
  arr: string;
  net_new_mrr: string;
  churned_subscriptions: string;
  expected_billing_next_30_days: string;
}

export interface RevenueByMonth extends QueryResultRow {
  month: string;
  revenue_collected: string;
  payments_received: string;
}

export interface OutstandingInvoice extends QueryResultRow {
  id: number;
  invoice_number: string;
  due_date: string;
  total: string;
  paid_amount: string;
  outstanding_amount: string;
  status: string;
}

const customerDateValues = (filters: ReportFilters): [number, string | null, string | null] => [
  filters.customerId,
  filters.startDate ?? null,
  filters.endDate ?? null,
];

/**
 * All dashboard values are calculated in PostgreSQL so report endpoints never
 * pull invoice or subscription rows into application memory to aggregate them.
 */
export async function getDashboardSummary(
  filters: ReportFilters,
  pool: Pool = db,
): Promise<DashboardSummary> {
  const result = await pool.query<DashboardSummary>(`
    WITH payments_in_range AS (
      SELECT COALESCE(SUM(payments.amount), 0) AS revenue_collected
      FROM payments
      WHERE payments.customer_id = $1
        AND payments.status = 'Received'
        AND ($2::date IS NULL OR payments.transaction_date::date >= $2::date)
        AND ($3::date IS NULL OR payments.transaction_date::date <= $3::date)
    ), invoice_balances AS (
      SELECT invoices.id, invoices.total, invoices.due_date, invoices.status,
        COALESCE(SUM(payments.amount) FILTER (WHERE payments.status = 'Received'), 0) AS paid_amount
      FROM invoices
      LEFT JOIN payments ON payments.invoice_id = invoices.id
      WHERE invoices.customer_id = $1
        AND invoices.status IN ('Confirmed', 'Paid')
        AND ($2::date IS NULL OR invoices.issued_date >= $2::date)
        AND ($3::date IS NULL OR invoices.issued_date <= $3::date)
      GROUP BY invoices.id
    ), subscription_mrr AS (
      SELECT subscriptions.id,
        CASE subscriptions.period
          WHEN 'monthly' THEN subscriptions.quantity * subscriptions.unit_price
          WHEN 'quarterly' THEN subscriptions.quantity * subscriptions.unit_price / 3
          WHEN 'annual' THEN subscriptions.quantity * subscriptions.unit_price / 12
        END AS monthly_value
      FROM subscriptions
      WHERE subscriptions.customer_id = $1
        AND subscriptions.status = 'Active'
    ), net_new AS (
      SELECT COALESCE(SUM(
        CASE subscriptions.period
          WHEN 'monthly' THEN subscriptions.quantity * subscriptions.unit_price
          WHEN 'quarterly' THEN subscriptions.quantity * subscriptions.unit_price / 3
          WHEN 'annual' THEN subscriptions.quantity * subscriptions.unit_price / 12
        END
      ), 0) AS net_new_mrr
      FROM subscriptions
      WHERE subscriptions.customer_id = $1
        AND ($2::date IS NULL OR subscriptions.created_at::date >= $2::date)
        AND ($3::date IS NULL OR subscriptions.created_at::date <= $3::date)
    ), churn AS (
      SELECT count(*) AS churned_subscriptions
      FROM subscription_history
      JOIN subscriptions ON subscriptions.id = subscription_history.subscription_id
      WHERE subscriptions.customer_id = $1
        AND subscription_history.status = 'Cancelled'
        AND ($2::date IS NULL OR subscription_history.changed_at::date >= $2::date)
        AND ($3::date IS NULL OR subscription_history.changed_at::date <= $3::date)
    )
    SELECT
      (SELECT count(*) FROM subscriptions WHERE customer_id = $1 AND status = 'Active')::text AS active_subscriptions,
      (SELECT revenue_collected FROM payments_in_range)::text AS revenue_collected,
      COALESCE((SELECT SUM(total - paid_amount) FROM invoice_balances), 0)::text AS amount_outstanding,
      (SELECT count(*) FROM invoice_balances WHERE due_date < CURRENT_DATE AND total > paid_amount)::text AS overdue_invoices,
      COALESCE((SELECT SUM(monthly_value) FROM subscription_mrr), 0)::text AS mrr,
      (COALESCE((SELECT SUM(monthly_value) FROM subscription_mrr), 0) * 12)::text AS arr,
      (SELECT net_new_mrr FROM net_new)::text AS net_new_mrr,
      (SELECT churned_subscriptions FROM churn)::text AS churned_subscriptions,
      COALESCE((
        SELECT SUM(subscriptions.quantity * subscriptions.unit_price)
        FROM subscriptions
        WHERE subscriptions.customer_id = $1
          AND subscriptions.status = 'Active'
          AND subscriptions.next_billing_date >= CURRENT_DATE
          AND subscriptions.next_billing_date < CURRENT_DATE + INTERVAL '30 days'
      ), 0)::text AS expected_billing_next_30_days
  `, customerDateValues(filters));

  return result.rows[0];
}

export async function getRevenueByMonth(
  filters: ReportFilters,
  pool: Pool = db,
): Promise<RevenueByMonth[]> {
  const result = await pool.query<RevenueByMonth>(`
    SELECT
      to_char(date_trunc('month', payments.transaction_date), 'YYYY-MM') AS month,
      SUM(payments.amount)::text AS revenue_collected,
      count(*)::text AS payments_received
    FROM payments
    WHERE payments.customer_id = $1
      AND payments.status = 'Received'
      AND ($2::date IS NULL OR payments.transaction_date::date >= $2::date)
      AND ($3::date IS NULL OR payments.transaction_date::date <= $3::date)
    GROUP BY date_trunc('month', payments.transaction_date)
    ORDER BY date_trunc('month', payments.transaction_date) DESC
  `, customerDateValues(filters));

  return result.rows;
}

export async function getOutstandingInvoices(
  filters: ReportFilters,
  pagination: Pagination,
  pool: Pool = db,
): Promise<{ data: OutstandingInvoice[]; meta: PaginationMeta }> {
  const values = [...customerDateValues(filters), pagination.limit, pagination.offset];
  const result = await pool.query<OutstandingInvoice & { total_count: string }>(`
    WITH balances AS (
      SELECT invoices.id, invoices.invoice_number, invoices.due_date, invoices.total, invoices.status,
        COALESCE(SUM(payments.amount) FILTER (WHERE payments.status = 'Received'), 0) AS paid_amount
      FROM invoices
      LEFT JOIN payments ON payments.invoice_id = invoices.id
      WHERE invoices.customer_id = $1
        AND invoices.status IN ('Confirmed', 'Paid')
        AND ($2::date IS NULL OR invoices.issued_date >= $2::date)
        AND ($3::date IS NULL OR invoices.issued_date <= $3::date)
      GROUP BY invoices.id
      HAVING invoices.total > COALESCE(SUM(payments.amount) FILTER (WHERE payments.status = 'Received'), 0)
    )
    SELECT
      balances.id,
      balances.invoice_number,
      balances.due_date::text,
      balances.total::text,
      balances.paid_amount::text,
      (balances.total - balances.paid_amount)::text AS outstanding_amount,
      balances.status,
      count(*) OVER ()::text AS total_count
    FROM balances
    ORDER BY balances.due_date ASC, balances.id ASC
    LIMIT $4 OFFSET $5
  `, values);

  const total = Number(result.rows[0]?.total_count ?? 0);
  return {
    data: result.rows.map(({ total_count: _totalCount, ...invoice }) => invoice),
    meta: { page: pagination.page, pageSize: pagination.pageSize, total },
  };
}
