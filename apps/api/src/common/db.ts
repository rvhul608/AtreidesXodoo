import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});
