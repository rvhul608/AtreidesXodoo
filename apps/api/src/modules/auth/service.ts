import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../common/errors.js';
import type { AuthPrincipal } from '../../common/auth.types.js';
import { comparePassword, hashPassword } from '../../common/password.js';
import { meetsPasswordRules, PASSWORD_RULES_MESSAGE } from '../../common/password-policy.js';
import { createSessionToken } from '../../common/session.js';
import {
  applyPasswordReset,
  createCustomerAccount,
  createResetEmail,
  findLoginUser,
} from './repository.js';

function assertPassword(password: string): void {
  if (!meetsPasswordRules(password)) {
    throw new AppError(400, 'PASSWORD_POLICY', PASSWORD_RULES_MESSAGE);
  }
}

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: AuthPrincipal) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    customer_id: user.customerId,
    role: user.role,
  };
}

export async function signup(input: { email: string; password: string; name?: string }): Promise<{ user: ReturnType<typeof publicUser>; token: string }> {
  assertPassword(input.password);
  const email = normalizedEmail(input.email);
  try {
    const user = await createCustomerAccount(email, await hashPassword(input.password), input.name?.trim() || null);
    return { user: publicUser(user), token: createSessionToken(user) };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with that email already exists');
    }
    throw error;
  }
}

export async function login(input: { email: string; password: string }): Promise<{ user: ReturnType<typeof publicUser>; token: string }> {
  const user = await findLoginUser(normalizedEmail(input.email));
  const passwordMatches = user ? await comparePassword(input.password, user.passwordHash) : false;
  if (!user || !user.isActive || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  const principal: AuthPrincipal = {
    id: user.id,
    email: user.email,
    name: user.name,
    customerId: user.customerId,
    role: user.role,
  };
  return { user: publicUser(principal), token: createSessionToken(principal) };
}

export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normalizedEmail(emailInput);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const origin = process.env.WEB_ORIGIN || 'http://localhost:5173';
  const resetLink = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  await createResetEmail(email, tokenHash, expiresAt, resetLink);
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  assertPassword(input.password);
  const tokenHash = createHash('sha256').update(input.token).digest('hex');
  const consumed = await applyPasswordReset(tokenHash, await hashPassword(input.password));
  if (!consumed) {
    throw new AppError(400, 'RESET_TOKEN_INVALID', 'Reset token is invalid or expired');
  }
}

export function currentUser(user: AuthPrincipal) {
  return publicUser(user);
}
