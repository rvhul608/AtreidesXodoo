import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';

function bcryptInput(password: string): string {
  const digest = createHash('sha256').update(password, 'utf8').digest('base64');
  return `brightloop-v1:${digest}`;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(bcryptInput(password), 12);
}

export function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(bcryptInput(password), passwordHash);
}
