import { Pool, PoolClient, QueryResultRow } from 'pg';

import { AppConfig, config } from './config.js';

export function createPool(appConfig: AppConfig = config): Pool {
  const pool = new Pool({ connectionString: appConfig.DATABASE_URL });

  pool.on('error', (error) => {
    console.error('Unexpected idle PostgreSQL client error', error);
  });

  return pool;
}

export const db = createPool();

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
  pool: Pool = db,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function query<Row extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await db.query<Row>(text, values as unknown[]);
  return result.rows;
}
