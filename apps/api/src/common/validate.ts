import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from './errors.js';

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
