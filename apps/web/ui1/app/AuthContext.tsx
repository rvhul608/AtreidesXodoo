import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi, type ApiUser } from '../live/api';

export type Role = ApiUser['role'];
export type SessionUser = Pick<ApiUser, 'id' | 'name' | 'email' | 'role' | 'customer_id'>;
interface AuthApi { user: SessionUser | null; ready: boolean; login: (email: string, password: string) => Promise<void>; signup: (name: string, email: string, password: string) => Promise<void>; logout: () => Promise<void> }
const AuthContext = createContext<AuthApi>({} as AuthApi);
export function useAuth() { return useContext(AuthContext); }
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { let active = true; authApi.me().then((u) => { if (active) setUser(u); }).catch(() => { if (active) setUser(null); }).finally(() => { if (active) setReady(true); }); return () => { active = false; }; }, []);
  const login = useCallback(async (email: string, password: string) => { setUser(await authApi.login(email, password)); }, []);
  const signup = useCallback(async (name: string, email: string, password: string) => { setUser(await authApi.signup(name, email, password)); }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { setUser(null); } }, []);
  const value = useMemo(() => ({ user, ready, login, signup, logout }), [user, ready, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function homeFor(role: Role): string { return role === 'customer' ? '/portal' : '/dashboard'; }
