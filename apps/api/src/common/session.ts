import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import type { AuthPrincipal } from './auth.types.js';
import { AppError } from './errors.js';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new AppError(500, 'AUTH_CONFIGURATION_ERROR', 'JWT_SECRET is not configured');
  return secret;
}

export function createSessionToken(user: AuthPrincipal): string {
  return jwt.sign(
    { role: user.role, customerId: user.customerId },
    jwtSecret(),
    { subject: String(user.id), expiresIn: '8h' },
  );
}

export function sessionCookieOptions(): CookieOptions {
  const sameSite = process.env.COOKIE_SAME_SITE;
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: sameSite === 'strict' || sameSite === 'none' ? sameSite : 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}
