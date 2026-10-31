#!/usr/bin/env node
/**
 * Database reset: drops all tables and migrations_applied table.
 * WARNING: Destructive. Only use in dev environments.
 */

import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

async function reset() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Drop all tables in reverse order of creation (respect FKs)
    const tables = [
      'support_knowledge',
      'discount_usage',
      'renewal_chase_log',
      'discount_scopes',
      'discount_rules',
      'payments',
      'invoice_line_items',
      'invoices',
      'subscription_items',
      'subscription_history',
      'subscriptions',
      'quotation_template_lines',
      'quotation_templates',
      'plan_pricing',
      'plans',
      'attachments',
      'product_taxes',
      'tax_rules',
      'product_variants',
      'products',
      'email_outbox',
      'audit_log',
      'outbox_emails',
      'reset_tokens',
      'users',
      'customers',
      'migrations_applied'
    ];

    for (const table of tables) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✓ Dropped: ${table}`);
      } catch (err) {
        console.warn(`⚠ Could not drop ${table}: ${err.message}`);
      }
    }

    console.log('✓ Database reset complete');
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

reset();
