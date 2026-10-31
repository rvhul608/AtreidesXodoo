/**
 * Brightloop Subscription API
 * Phase 1 skeleton: routes/services/repositories scaffold with DB health checks.
 * No feature implementation yet—only structure and health endpoints.
 */

import express, { Express, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { Pool } from 'pg';

const app: Express = express();
const port = parseInt(process.env.API_PORT || '3000', 10);

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://brightloop:password@localhost:5432/brightloop_dev',
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.WEB_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW()');
    const dbHealth = result.rows.length > 0;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        connected: dbHealth,
        timestamp: result.rows[0]?.now,
      },
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
      database: {
        connected: false,
      },
    });
  }
});

// Placeholder routes (Agent A/B/C will implement features)
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Brightloop Subscription API - Phase 1 Skeleton',
    version: '0.1.0',
    endpoints: {
      health: 'GET /health',
      auth: 'Pending implementation by Agent A',
      billing: 'Pending implementation by Agent B',
      catalog: 'Pending implementation by Agent C',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
});

// Error handler
app.use((err: any, req: Request, res: Response) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
pool.connect().then(() => {
  console.log('✓ Database connected');
  app.listen(port, () => {
    console.log(`✓ API listening on http://localhost:${port}`);
    console.log(`✓ Health check: http://localhost:${port}/health`);
  });
}).catch((err) => {
  console.error('✗ Failed to connect to database:', err);
  process.exit(1);
});

export default app;
