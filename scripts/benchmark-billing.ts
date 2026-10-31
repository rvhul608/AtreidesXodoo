import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { randomBytes } from 'node:crypto';

// A dedicated database is mandatory: this script resets only this benchmark database.
const databaseName = 'brightloop_billing_benchmark';
const databaseUrl = process.env.BENCHMARK_DATABASE_URL ?? `postgresql://brightloop:password@localhost:5432/${databaseName}`;
assert.equal(new URL(databaseUrl).pathname, `/${databaseName}`, 'Use the isolated brightloop_billing_benchmark database');
const count = Number(process.env.BENCHMARK_INVOICES ?? 5527);
const totalSubscriptions = Math.max(10000, count);
assert.ok(Number.isInteger(count) && count > 0 && count <= 20000);
const admin = new pg.Client({ connectionString: process.env.BENCHMARK_ADMIN_URL ?? 'postgresql://postgres@localhost:5432/postgres' });
await admin.connect();
try {
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
  if (!exists.rowCount) await admin.query('CREATE DATABASE brightloop_billing_benchmark OWNER brightloop');
} finally { await admin.end(); }

const env = { ...process.env, DATABASE_URL: databaseUrl };
for (const script of ['db/reset.js', 'db/migrate.js', 'db/seed.js']) {
  execFileSync(process.execPath, [script], { env, stdio: 'pipe' });
}
process.env.DATABASE_URL = databaseUrl;
process.env.JWT_SECRET ??= randomBytes(32).toString('hex');
const { pool } = await import('../apps/api/src/common/db.js');
const { runBilling } = await import('../apps/api/src/modules/billing/service.js');
const { app } = await import('../apps/api/src/index.js');
const { createSessionToken } = await import('../apps/api/src/common/session.js');

try {
  await pool.query("UPDATE subscriptions SET status='Closed', next_billing_date=NULL");
  const customer = await pool.query<{ id: string }>("INSERT INTO customers (legal_name) VALUES ('Billing Benchmark') RETURNING id");
  const plan = await pool.query<{ id: string }>("SELECT id FROM plans WHERE plan_number='MONTHLY-FLEX'");
  await pool.query(`INSERT INTO subscriptions (customer_id, plan_id, period, quantity, unit_price,
    start_date, expiry_date, payment_terms, status, next_billing_date)
    SELECT $1, $2, 'monthly', 2, 1000, '2026-01-01', NULL, 'Net 30',
      CASE WHEN n <= $3 THEN 'Active' ELSE 'Paused' END,
      CASE WHEN n <= $3 THEN '2026-01-01'::date ELSE NULL END
    FROM generate_series(1, $4::integer) n`, [customer.rows[0].id, plan.rows[0].id, count, totalSubscriptions]);
  await pool.query(`INSERT INTO subscription_items (subscription_id, product_id, description, quantity, unit_price, amount, tax_amount, tax_ids)
    SELECT s.id, p.id, p.name, 2, p.sales_price, 2*p.sales_price, 2*p.sales_price*0.18,
      ARRAY(SELECT id FROM tax_rules WHERE name='GST 18%')
    FROM subscriptions s CROSS JOIN products p
    WHERE s.customer_id=$1 AND p.sku IN ('ERP-LICENSE','SUPPORT-HOURS')`, [customer.rows[0].id]);
  await pool.query('ANALYZE subscriptions; ANALYZE subscription_items; ANALYZE invoices;');
  const user = (await pool.query("SELECT id, email, name FROM users WHERE role='admin' LIMIT 1")).rows[0];
  const token = createSessionToken({ id: Number(user.id), email: user.email, name: user.name, role: 'admin', customerId: null });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let result: Awaited<ReturnType<typeof runBilling>>;
  let elapsedMs: number;
  try {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/billing/run?asOf=2026-01-01`,
      { method: 'POST', headers: { Cookie: `session=${token}` } });
    assert.equal(response.status, 200);
    result = (await response.json() as { data: Awaited<ReturnType<typeof runBilling>> }).data;
    elapsedMs = Math.round(performance.now() - started);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  assert.equal(result.failed.length, 0, JSON.stringify(result.failed));
  assert.equal(result.created, count);
  const discounted = Math.min(100, count);
  const actual = await pool.query(`SELECT count(*)::int AS count,
    COUNT(*) FILTER (WHERE total=2655.00)::int AS discounted,
    COUNT(*) FILTER (WHERE total=2950.00)::int AS full_price
    FROM invoices WHERE customer_id=$1`, [customer.rows[0].id]);
  assert.equal(actual.rows[0].count, count);
  assert.equal(actual.rows[0].discounted, discounted, 'Only the first 100 invoices may consume the demo discount');
  assert.equal(actual.rows[0].full_price, count - discounted);
  const lines = await pool.query(`SELECT count(*)::int AS count FROM invoice_line_items`);
  assert.equal(lines.rows[0].count, count * 2);
  const usage = await pool.query(`SELECT count(*)::int AS count FROM discount_usage`);
  assert.equal(usage.rows[0].count, discounted);
  const rerun = await runBilling('2026-01-01', { id: null });
  assert.equal(rerun.created, 0);
  console.log(JSON.stringify({ subscriptions: totalSubscriptions + 10, created: result.created, lines: lines.rows[0].count,
    elapsedMs, concurrency: result.concurrency, batchSize: result.batchSize, targetMs: 2000,
    targetMet: elapsedMs < 2000, rerunCreated: rerun.created, financialTotalsCorrect: true }));
  assert.ok(elapsedMs < 2000, `Billing exceeded the two-second target: ${elapsedMs} ms`);
  console.log('BILLING BENCHMARK VERIFIED');
} finally { await pool.end(); }
