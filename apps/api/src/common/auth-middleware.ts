import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from './auth.types.js';
import { AppError } from './errors.js';
import { findActivePrincipal } from '../modules/auth/repository.js';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, 'AUTH_CONFIGURATION_ERROR', 'JWT_SECRET is not configured');
  return secret;
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const token = request.cookies?.session;
  if (typeof token !== 'string') {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    return;
  }

  let subject: string | undefined;
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload !== 'string') subject = payload.sub;
  } catch (error) {
    next(error instanceof AppError ? error : new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    return;
  }

  if (!subject || !/^\d+$/.test(subject)) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    return;
  }

  try {
    const principal = await findActivePrincipal(Number(subject));
    if (!principal) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }
    request.auth = principal;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }
    if (!roles.includes(request.auth.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }
    next();
  };
}
