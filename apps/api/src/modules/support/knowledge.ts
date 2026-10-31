import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';

import { requireAuth, requireRole } from '../../common/auth-middleware.js';
import { parseOrThrow } from '../../common/validation.js';

const documentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(12000),
  published: z.boolean().default(false),
}).strict();
const idSchema = z.coerce.number().int().positive().safe();
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20) });

export function createKnowledgeRouter(pool: Pool): Router {
  const router = Router();
  router.use(requireAuth, requireRole('admin', 'staff'));
  router.get('/', async (request, response, next) => {
    try {
      const { page, pageSize } = parseOrThrow(pageSchema, request.query);
      const result = await pool.query('SELECT id::text, title, body, published, updated_at FROM support_knowledge ORDER BY id DESC LIMIT $1 OFFSET $2', [pageSize, (page - 1) * pageSize]);
      const count = await pool.query<{ total: string }>('SELECT count(*)::text AS total FROM support_knowledge');
      response.json({ data: result.rows, meta: { page, pageSize, total: Number(count.rows[0].total) } });
    } catch (error) { next(error); }
  });
  router.post('/', async (request, response, next) => {
    try {
      const doc = parseOrThrow(documentSchema, request.body);
      const result = await pool.query('INSERT INTO support_knowledge (title, body, published) VALUES ($1, $2, $3) RETURNING id::text, title, body, published, updated_at', [doc.title, doc.body, doc.published]);
      response.status(201).json({ data: result.rows[0] });
    } catch (error) { next(error); }
  });
  router.put('/:id', async (request, response, next) => {
    try {
      const id = parseOrThrow(idSchema, request.params.id);
      const doc = parseOrThrow(documentSchema, request.body);
      const result = await pool.query('UPDATE support_knowledge SET title = $1, body = $2, published = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING id::text, title, body, published, updated_at', [doc.title, doc.body, doc.published, id]);
      if (!result.rows[0]) { response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } }); return; }
      response.json({ data: result.rows[0] });
    } catch (error) { next(error); }
  });
  return router;
}
