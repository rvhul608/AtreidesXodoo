import { fileURLToPath } from 'node:url';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import { Pool } from 'pg';

import { config } from './common/config.js';
import { db } from './common/db.js';
import { errorHandler, notFoundHandler } from './common/errors.js';

export function createApp(pool: Pool = db): Express {
  const app = express();

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());
  app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));

  app.get('/health', async (_request: Request, response: Response) => {
    try {
      const result = await pool.query<{ now: Date }>('SELECT NOW()');
      response.json({
        data: {
          status: 'ok',
          timestamp: new Date().toISOString(),
          database: {
            connected: true,
            timestamp: result.rows[0]?.now,
          },
        },
      });
    } catch {
      response.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Database connection failed',
        },
      });
    }
  });

  app.get('/api', (_request: Request, response: Response) => {
    response.json({
      data: {
        name: 'Brightloop Subscription API',
        version: '0.1.0',
        documentation: '/docs/api-contract.md',
      },
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export async function startServer(): Promise<void> {
  await db.query('SELECT 1');
  const app = createApp();

  app.listen(config.API_PORT, () => {
    console.log(`Brightloop API listening on http://localhost:${config.API_PORT}`);
  });
}

const isEntrypoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer().catch((error: unknown) => {
    console.error('Failed to start Brightloop API', error);
    process.exitCode = 1;
  });
}

export default createApp;
