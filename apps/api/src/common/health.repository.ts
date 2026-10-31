import { pool } from './db.js';

export async function readDatabaseTimestamp(): Promise<Date | undefined> {
  const result = await pool.query<{ now: Date }>('SELECT NOW() AS now');
  return result.rows[0]?.now;
}
