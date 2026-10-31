#!/usr/bin/env node
/**
 * Seed script: populates database with demo data (~5000 customers, ~10000 subscriptions/invoices/payments).
 * Idempotent: uses ON CONFLICT DO NOTHING for re-entrancy.
 */

import pg from 'pg';
import crypto from 'crypto';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

async function seed() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Insert demo customers
    const customerIds = [];
    for (let i = 0; i < 5000; i++) {
      const result = await client.query(
        `INSERT INTO customers (legal_name) VALUES ($1)
         ON CONFLICT (legal_name) DO NOTHING
         RETURNING id`,
        [`Demo Company ${i + 1}`]
      );
      if (result.rows.length > 0) {
        customerIds.push(result.rows[0].id);
      }
    }
    console.log(`✓ Created ${customerIds.length} customers`);

    if (customerIds.length === 0) {
      console.log('⊘ Customers already exist, skipping seed');
      return;
    }

    // Insert demo users
    for (const customerId of customerIds.slice(0, 100)) {
      const hashedPassword = crypto.createHash('sha256').update('password').digest('hex');
      await client.query(
        `INSERT INTO users (customer_id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (customer_id, email) DO NOTHING`,
        [customerId, `admin@company${customerId}.local`, hashedPassword, 'admin']
      );
    }
    console.log('✓ Created demo users');

    // Insert demo products and variants
    const productIds = [];
    for (const customerId of customerIds.slice(0, 500)) {
      const result = await client.query(
        `INSERT INTO products (customer_id, sku, name, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (customer_id, sku) DO NOTHING
         RETURNING id`,
        [customerId, `PROD-${customerId}`, `Product ${customerId}`, 'Demo product']
      );
      if (result.rows.length > 0) {
        const productId = result.rows[0].id;
        productIds.push(productId);
        // Create variants
        for (let v = 0; v < 2; v++) {
          await client.query(
            `INSERT INTO product_variants (product_id, variant_key, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (product_id, variant_key) DO NOTHING`,
            [productId, `v${v + 1}`, `Variant ${v + 1}`]
          );
        }
      }
    }
    console.log(`✓ Created products and variants`);

    // Insert demo tax rules
    for (const customerId of customerIds.slice(0, 500)) {
      await client.query(
        `INSERT INTO tax_rules (customer_id, jurisdiction, tax_code, rate)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (customer_id, jurisdiction) DO NOTHING`,
        [customerId, 'US-CA', 'TAX-001', 0.0825]
      );
    }
    console.log('✓ Created tax rules');

    // Insert demo plans
    const planIds = [];
    for (const customerId of customerIds.slice(0, 1000)) {
      const result = await client.query(
        `INSERT INTO plans (customer_id, plan_number, name, description, min_quantity, auto_renew_allowed)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (customer_id, plan_number) DO NOTHING
         RETURNING id`,
        [customerId, `PLAN-${customerId}`, `Demo Plan`, 'Monthly subscription', 1, true]
      );
      if (result.rows.length > 0) {
        const planId = result.rows[0].id;
        planIds.push(planId);
        // Create pricing
        await client.query(
          `INSERT INTO plan_pricing (plan_id, period, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (plan_id, period) DO NOTHING`,
          [planId, 'monthly', '99.99']
        );
      }
    }
    console.log(`✓ Created plans and pricing`);

    // Insert demo subscriptions (2 per plan)
    let subscriptionCount = 0;
    for (let i = 0; i < planIds.length; i++) {
      const planId = planIds[i];
      for (let s = 0; s < 2; s++) {
        const result = await client.query(
          `INSERT INTO subscriptions
           (customer_id, subscription_number, plan_id, period, quantity, unit_price, start_date, next_billing_date, auto_renew, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (customer_id, subscription_number) DO NOTHING
           RETURNING id`,
          [
            customerIds[i % customerIds.length],
            `SUB-${i}-${s}`,
            planId,
            'monthly',
            '1.00',
            '99.99',
            new Date('2024-01-01'),
            new Date('2024-11-01'),
            true,
            'Active'
          ]
        );
        if (result.rows.length > 0) {
          subscriptionCount++;
          const subscriptionId = result.rows[0].id;

          // Create invoices for each subscription
          for (let inv = 0; inv < 5; inv++) {
            const invoiceResult = await client.query(
              `INSERT INTO invoices
               (customer_id, subscription_id, invoice_number, period_start, period_end,
                subtotal, tax_amount, discount_total, total, issued_date, due_date, status, trace)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
               ON CONFLICT (subscription_id, period_start) DO NOTHING
               RETURNING id`,
              [
                customerIds[i % customerIds.length],
                subscriptionId,
                `INV-${subscriptionId}-${inv}`,
                new Date(2024, 0 + inv, 1),
                new Date(2024, 1 + inv, 1),
                '99.99',
                '8.25',
                '0.00',
                '108.24',
                new Date(2024, 0 + inv, 1),
                new Date(2024, 1 + inv, 15),
                inv < 3 ? 'Paid' : 'Confirmed',
                JSON.stringify({ applied_rules: [], trace: [] })
              ]
            );

            if (invoiceResult.rows.length > 0) {
              const invoiceId = invoiceResult.rows[0].id;

              // Add line items
              await client.query(
                `INSERT INTO invoice_line_items
                 (invoice_id, description, quantity, unit_price, line_total, tax_rate, tax_amount, discount_percent, discount_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [invoiceId, 'Monthly Service', '1.00', '99.99', '99.99', 0.0825, '8.25', 0, '0.00']
              );

              // Add payment if invoice is paid
              if (inv < 3) {
                await client.query(
                  `INSERT INTO payments (invoice_id, customer_id, amount, payment_method, status)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [invoiceId, customerIds[i % customerIds.length], '108.24', 'card', 'Received']
                );
              }
            }
          }
        }
      }
    }
    console.log(`✓ Created ${subscriptionCount} subscriptions with invoices and payments`);

    // Insert demo discount rules
    for (const customerId of customerIds.slice(0, 100)) {
      const result = await client.query(
        `INSERT INTO discount_rules (customer_id, name, discount_percent, description, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [customerId, 'Demo 10% Discount', 10, 'Early bird discount', true]
      );
    }
    console.log('✓ Created discount rules');

    console.log('✓ Seed complete');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
