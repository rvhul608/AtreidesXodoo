#!/usr/bin/env node
/** Applies the schema baseline once, then numbered SQL migrations in order. */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(root, 'schema.sql');
const migrationsDir = path.join(root, 'migrations');
const connectionString = process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev';
const client = new pg.Client({ connectionString });

async function applyMigration(name, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO migrations_applied (migration_name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`✓ Applied: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function migrate() {
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_applied (
        id BIGSERIAL PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const appliedResult = await client.query('SELECT migration_name FROM migrations_applied');
    const applied = new Set(appliedResult.rows.map((row) => row.migration_name));

    if (!applied.has('0000-schema.sql')) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await applyMigration('0000-schema.sql', schema);
    }

    const files = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir)
        .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(file))
        .sort()
      : [];

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⊘ Skipped (already applied): ${file}`);
        continue;
      }
      await applyMigration(file, fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
      applied.add(file);
    }

    console.log('✓ Migrations complete');
  } catch (error) {
    console.error('Migration failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await migrate();
