import type { AuthPrincipal } from '../common/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}

export {};
