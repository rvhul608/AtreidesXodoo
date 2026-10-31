import { z } from 'zod';

import { AppError } from './errors.js';

export function parseOrThrow<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);

  if (result.success) {
    return result.data;
  }

  throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', {
    fields: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}
