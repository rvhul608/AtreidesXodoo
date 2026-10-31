import type { RequestHandler } from 'express';
import { AppError } from './errors.js';

interface WindowCounter {
  count: number;
  resetAt: number;
}

export function createRateLimiter(maximum: number, windowMs: number): RequestHandler {
  const counters = new Map<string, WindowCounter>();

  return (request, _response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = counters.get(key);
    const counter = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

    if (counters.size > 10_000) {
      for (const [counterKey, value] of counters) {
        if (value.resetAt <= now) counters.delete(counterKey);
      }
    }
    counter.count += 1;
    counters.set(key, counter);

    if (counter.count > maximum) {
      next(new AppError(429, 'RATE_LIMITED', 'Too many requests; try again later'));
      return;
    }

    next();
  };
}
