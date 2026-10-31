import { z } from 'zod';

const environmentSchema = z.object({
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().default('postgresql://brightloop:password@localhost:5432/brightloop_dev'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Resend integration (optional; the outbox stays database-backed when absent).
  MAIL_FROM: z.string().min(3).default('noreply@brightloop.local'),
  RESEND_API_KEY: z.string().min(1).optional(),
  OUTBOX_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(1000).default(30000),
});

export type AppConfig = z.infer<typeof environmentSchema>;

/** Parses only the configuration the API owns and uses. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = environmentSchema.safeParse(environment);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid API configuration: ${details}`);
  }

  return result.data;
}

export const config = loadConfig();
