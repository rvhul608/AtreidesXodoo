import 'dotenv/config';
import { fileURLToPath } from 'node:url';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express, Request, Response } from 'express';
import { Pool } from 'pg';

import { config } from './common/config.js';
import { db } from './common/db.js';
import { errorHandler, notFoundHandler } from './common/error-middleware.js';
import authRoutes from './modules/auth/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import outboxRoutes from './modules/outbox/routes.js';
import planRoutes from './modules/plans/routes.js';
import portalRoutes from './modules/portal/routes.js';
import renewalRoutes from './modules/renewals/routes.js';
import subscriptionRoutes from './modules/subscriptions/routes.js';
import templateRoutes from './modules/templates/routes.js';
import userRoutes from './modules/users/routes.js';
import { createSupportRouter } from './modules/support/support.js';
import { createKnowledgeRouter } from './modules/support/knowledge.js';

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

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/renewals', renewalRoutes);
  app.use('/api/admin/outbox', outboxRoutes);
  app.use('/api/plans', planRoutes);
  app.use('/api/templates', templateRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/portal', portalRoutes);
  app.use('/api/support', createSupportRouter(pool));
  app.use('/api/support-knowledge', createKnowledgeRouter(pool));
  // Catalog owns /api/products and /api/taxes; mounted last so its auth guard never shadows others.
  app.use('/api', catalogRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Shared instance used by the integration tests. */
export const app = createApp();

export async function startServer(): Promise<void> {
  await db.query('SELECT 1');
  const server = app.listen(config.API_PORT, () => {
    console.log(`Brightloop API listening on http://localhost:${config.API_PORT}`);
  });
  const shutdown = () => server.close(() => {
    void db.end();
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const isEntrypoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (isEntrypoint) {
  startServer().catch((error: unknown) => {
    console.error('Failed to start Brightloop API', error);
    process.exitCode = 1;
  });
}

export default createApp;
