'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role, UserDto } from '@cognicare/shared';
import { api, tokenStore } from './api';

interface AuthCtx {
  user: UserDto | null;
  loading: boolean;
  /** Logs in; if the account's role is not in `allowed`, the session is revoked and an Error is thrown. */
  login(email: string, password: string, allowed?: Role[]): Promise<UserDto>;
  logout(): Promise<void>;
  setUser(u: UserDto | null): void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    api.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  // large-text setting drives the global font scale (HTML render())
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', user?.settings?.largeText ? '1.15' : '1');
  }, [user]);

  // glass bars thicken once the page scrolls (HTML syncScrolled)
  useEffect(() => {
    const sync = () => document.documentElement.setAttribute('data-scrolled', window.scrollY > 8 ? 'true' : 'false');
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, []);

  const login = useCallback(async (email: string, password: string, allowed?: Role[]) => {
    const r = await api.login({ email, password });
    tokenStore.set(r.accessToken);
    if (allowed && !allowed.includes(r.user.role)) {
      await api.logout().catch(() => undefined);
      tokenStore.clear();
      throw new Error('บทบาทของบัญชีไม่ตรงกับที่เลือก');
    }
    setUser(r.user);
    return r.user;
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, loading, login, logout, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export const homeFor = (role: Role) => (role === 'patient' ? '/patient' : '/doctor');
