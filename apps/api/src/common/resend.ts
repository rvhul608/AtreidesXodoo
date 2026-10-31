import { z } from 'zod';

import { config } from './config.js';

// Resend REST client using native fetch, mirroring the support module's
// hosted-service call pattern (no vendor SDK, AbortSignal timeout).
// Docs: https://resend.com/docs/api-reference/emails/send-email

const sendResponseSchema = z.object({
  id: z.string().min(1),
});

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  text: string;
}

export interface ResendClient {
  sendEmail(input: SendEmailInput): Promise<{ id: string }>;
}

export class ResendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly resendCode: string,
    message: string,
  ) {
    super(message);
    this.name = 'ResendApiError';
  }
}

export function createResendClient(apiKey: string, baseUrl = 'https://api.resend.com'): ResendClient {
  return {
    async sendEmail(input: SendEmailInput): Promise<{ id: string }> {
      const response = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: input.from,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const failure = sendFailureSchema.safeParse(payload);
        const resendCode = failure.success ? failure.data.name : 'unknown_error';
        const message = failure.success ? failure.data.message : `Resend API returned ${response.status}`;
        throw new ResendApiError(response.status, resendCode, message);
      }

      const parsed = sendResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ResendApiError(response.status, 'invalid_response', 'Resend API response did not match the expected shape');
      }
      return { id: parsed.data.id };
    },
  };
}

const sendFailureSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
});

/** Returns a client, or null when RESEND_API_KEY is not configured. */
export function getResendClient(): ResendClient | null {
  return config.RESEND_API_KEY ? createResendClient(config.RESEND_API_KEY) : null;
}

/** Compact one-line description of a send failure, stored as last_error. */
export function fromResendError(error: unknown): string {
  if (error instanceof ResendApiError) {
    return `${error.resendCode} (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
