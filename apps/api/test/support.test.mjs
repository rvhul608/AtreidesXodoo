import assert from 'node:assert/strict';
import test from 'node:test';

import { answerSupportRequest } from '../dist/modules/support/support.js';

test('every support query is scoped to the authenticated customer', async () => {
  const calls = [];
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: [] };
  } };
  for (const input of [
    { topic: 'subscriptions' },
    { topic: 'unpaid_invoices' },
    { topic: 'invoice_details', invoiceId: 123 },
  ]) {
    await answerSupportRequest(42, input, pool);
  }
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.match(call.sql, /customer_id\s*=\s*\$1/);
    assert.equal(call.values[0], 42);
  }
  assert.equal(calls[2].values[1], 123);
});

test('missing or inaccessible invoices have the same empty response', async () => {
  const result = await answerSupportRequest(42, { topic: 'invoice_details', invoiceId: 123 }, {
    query: async () => ({ rows: [] }),
  });
  assert.deepEqual(result, { message: 'Invoice not found.', items: [] });
});
