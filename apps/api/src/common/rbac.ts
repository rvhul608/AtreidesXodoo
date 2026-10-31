import { NextFunction, Request, Response } from 'express';

import { AppError } from './errors.js';

/** Roles currently enforced by the canonical users.role database constraint. */
export const roles = ['admin', 'user', 'viewer'] as const;
export type Role = (typeof roles)[number];

export interface AuthenticatedUser {
  id: number;
  customerId: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  if (request.user === undefined) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    return;
  }

  next();
}

export function requireRole(...allowedRoles: readonly Role[]) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (request.user === undefined) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required'));
      return;
    }

    if (!allowedRoles.includes(request.user.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

/** The only customer id feature queries may use for an authenticated request. */
export function customerScope(request: Request): number {
  if (request.user === undefined) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required');
  }

  return request.user.customerId;
}
