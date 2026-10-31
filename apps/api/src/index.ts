import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorHandler, notFoundHandler } from './common/error-middleware.js';
import { readDatabaseTimestamp } from './common/health.repository.js';
import { pool } from './common/db.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import renewalRoutes from './modules/renewals/routes.js';
import outboxRoutes from './modules/outbox/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import planRoutes from './modules/plans/routes.js';
import templateRoutes from './modules/templates/routes.js';
import subscriptionRoutes from './modules/subscriptions/routes.js';

export const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.get('/health', async (_request, response) => {
  try {
    const databaseTimestamp = await readDatabaseTimestamp();
    response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: { connected: Boolean(databaseTimestamp), timestamp: databaseTimestamp },
    });
  } catch {
    response.status(503).json({
      status: 'error',
      error: 'Database connection failed',
      database: { connected: false },
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/renewals', renewalRoutes);
app.use('/api/admin/outbox', outboxRoutes);
app.use('/api', catalogRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === currentFile) {
  const port = Number(process.env.API_PORT || 3000);
  const server = app.listen(port, process.env.API_HOST || '0.0.0.0', () => {
    console.log(`Brightloop API listening on http://localhost:${port}`);
  });
  const shutdown = () => server.close(() => { void pool.end(); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export default app;
