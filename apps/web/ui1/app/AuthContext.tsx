import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { auth } from '../mock/api';
import type { SessionUser } from '../mock/api';
import type { Role } from '../mock/data';

interface AuthApi {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string) => Promise<void>;
  loginDemo: (role: Role) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthApi>({} as AuthApi);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);

  // Session cookie, never localStorage (03-UI.md rule 4) — the mock keeps
  // the session object in memory and (in production) an httpOnly cookie.
  const login = useCallback(async (email: string, password: string) => {
    const u = await auth.login(email, password);
    setUser(u);
  }, []);

  const signup = useCallback(async (name: string, email: string) => {
    const u = await auth.signup(name, email);
    setUser(u);
  }, []);

  const loginDemo = useCallback(async (role: Role) => {
    const demo: Record<Role, SessionUser> = {
      admin: { name: 'Leto Atreides', email: 'admin@brightloop.local', role: 'admin' },
      staff: { name: 'Gurney Halleck', email: 'staff@brightloop.local', role: 'staff' },
      customer: { name: 'Ana della Corte', email: 'ana@acme.works', role: 'customer' },
      viewer: { name: 'Ravi Menon', email: 'viewer@brightloop.local', role: 'viewer' },
    };
    setUser(demo[role]);
  }, []);

  const logout = useCallback(() => {
    void auth.logout();
    setUser(null);
  }, []);

  const api = useMemo(
    () => ({ user, login, signup, loginDemo, logout }),
    [user, login, signup, loginDemo, logout],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function homeFor(role: Role): string {
  return role === 'customer' ? '/portal' : '/dashboard';
}
