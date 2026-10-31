export const PASSWORD_RULES_MESSAGE = 'Password must be at least 9 characters and include uppercase, lowercase, and special characters';

export function meetsPasswordRules(password: string): boolean {
  return password.length >= 9
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
