'use client';
/**
 * App providers: auth session (token in memory, refresh via httpOnly cookie)
 * and currency (F1.3 — client-side conversion so a switch re-renders every
 * figure < 300 ms with no refetch; stored values stay base USD).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@eof/api-client';

export interface SessionUser {
  userId: string; name: string; email: string; roles: string[]; awardAuthority: boolean;
}
export interface Tenant { slug: string; name: string; settings: Record<string, unknown> }

interface AuthState {
  user: SessionUser | null;
  tenant: Tenant | null;
  ready: boolean;
  setSession: (u: SessionUser | null, t: Tenant | null) => void;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthCtx = createContext<AuthState>(null as never);
export const useAuth = () => useContext(AuthCtx);

const CUR_SYMBOL: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SAR: 'SAR ', INR: '₹' };

interface CurrencyState {
  currency: string;
  setCurrency: (c: string) => void;
  rates: Record<string, number>;
  asOf: string;
  /** k-USD figure → display string (e.g. 175 → "$175k" / "$2.1M"). */
  fK: (usdK: number) => string;
  /** k-USD figure → millions string ("$1.2M"). */
  fM: (usdK: number) => string;
  /** unit USD figure → display string. */
  fU: (usd: number) => string;
}

const CurrencyCtx = createContext<CurrencyState>(null as never);
export const useCurrency = () => useContext(CurrencyCtx);

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [ready, setReady] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [asOf, setAsOf] = useState('');

  useEffect(() => {
    api.onUnauthorized = () => { setUser(null); };
    (async () => {
      // FX table is public; session restore via refresh cookie.
      void api.get<{ asOf: string; rates: Record<string, number> }>('/fx/rates')
        .then((fx) => { setRates(fx.rates); setAsOf(fx.asOf); }).catch(() => {});
      const ok = await api.tryRefresh();
      if (ok) {
        try {
          const me = await api.me();
          setUser({
            userId: me.user.userId, name: me.user.name, email: me.user.email,
            roles: me.user.roles, awardAuthority: me.user.awardAuthority,
          });
          setTenant(me.tenant);
        } catch { /* stay logged out */ }
      }
      setReady(true);
    })();
  }, []);

  const setSession = useCallback((u: SessionUser | null, t: Tenant | null) => { setUser(u); setTenant(t); }, []);
  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* best effort */ }
    api.setToken(null); setUser(null); setTenant(null);
  }, []);
  const hasRole = useCallback((...roles: string[]) => Boolean(user && roles.some((r) => user.roles.includes(r))), [user]);

  const currencyValue = useMemo<CurrencyState>(() => {
    const r = rates[currency] ?? 1;
    const s = CUR_SYMBOL[currency] ?? `${currency} `;
    const fK = (usdK: number) => {
      const v = usdK * r;
      return v >= 1000 ? `${s}${(v / 1000).toFixed(2)}M` : `${s}${Math.round(v)}k`;
    };
    const fM = (usdK: number) => `${s}${(usdK * r / 1000).toFixed(1)}M`;
    const fU = (usd: number) => {
      const v = usd * r;
      return `${s}${v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)}`;
    };
    return { currency, setCurrency, rates, asOf, fK, fM, fU };
  }, [currency, rates, asOf]);

  const authValue = useMemo<AuthState>(() => ({ user, tenant, ready, setSession, logout, hasRole }),
    [user, tenant, ready, setSession, logout, hasRole]);

  return (
    <AuthCtx.Provider value={authValue}>
      <CurrencyCtx.Provider value={currencyValue}>{children}</CurrencyCtx.Provider>
    </AuthCtx.Provider>
  );
}

/** Minimal data hook: fetch on mount + manual reload. */
export function useApi<T>(path: string | null, deps: unknown[] = []): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api.get<T>(path)
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
