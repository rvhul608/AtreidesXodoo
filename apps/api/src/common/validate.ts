import type { RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { AppError } from './errors.js';

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Must be a real calendar date');

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Request body is invalid', parsed.error.issues));
      return;
    }
    request.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny): RequestHandler {
  return (request, response, next) => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Request query is invalid', parsed.error.issues));
      return;
    }
    response.locals.validatedQuery = parsed.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (request, response, next) => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      next(new AppError(400, 'VALIDATION_ERROR', 'Request path is invalid', parsed.error.issues));
      return;
    }
    response.locals.validatedParams = parsed.data;
    next();
  };
}
