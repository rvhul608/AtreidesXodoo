#!/usr/bin/env node
/**
 * Migration runner: applies all SQL migration files in db/migrations/ sequentially.
 * Idempotent—safe to rerun multiple times. Tracks applied migrations in migrations_applied table.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations_applied (
      id BIGSERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations() {
  const result = await client.query('SELECT migration_name FROM migrations_applied');
  return new Set(result.rows.map(r => r.migration_name));
}

async function applyMigration(filename, sql) {
  const client2 = new pg.Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
  });

  await client2.connect();
  try {
    // Execute migration with transaction
    await client2.query('BEGIN');
    try {
      await client2.query(sql);
      await client2.query('INSERT INTO migrations_applied (migration_name) VALUES ($1)', [filename]);
      await client2.query('COMMIT');
      console.log(`✓ Applied: ${filename}`);
    } catch (err) {
      await client2.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client2.end();
  }
}

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to database');

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    // Get all migration files
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found. Creating schema from db/schema.sql');
      const schemaPath = path.join(__dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await applyMigration('0000-schema.sql', schemaSql);
      }
    } else {
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of files) {
        if (applied.has(file)) {
          console.log(`⊘ Skipped (already applied): ${file}`);
          continue;
        }

        const filepath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filepath, 'utf-8');
        await applyMigration(file, sql);
      }
    }

    console.log('✓ Migrations complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
