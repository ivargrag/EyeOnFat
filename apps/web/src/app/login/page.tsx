'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@eof/api-client';
import { useAuth } from '@/lib/store';
import { LogoBlock } from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState('k.menon@meridiangroup.com');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.login({ email, password, totp: totp || undefined });
      if (res.mfaRequired) { setNeedTotp(true); setBusy(false); return; }
      api.setToken(res.accessToken ?? null);
      setSession(
        res.user ? { userId: res.user.id, name: res.user.name, email: res.user.email, roles: res.user.roles, awardAuthority: res.user.awardAuthority } : null,
        res.tenant ?? null,
      );
      router.replace(res.mfaSetupRequired ? '/mfa-setup' : '/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div id="login">
      <form className="lg-card" onSubmit={submit}>
        <LogoBlock />
        <label className="fl" style={{ marginTop: 20 }}>Work email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <label className="fl">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {needTotp && (<>
          <label className="fl">TOTP code</label>
          <input inputMode="numeric" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="6-digit code" />
        </>)}
        <p className="note">
          First login? Enter your Meridian Group ID and a new password — you&apos;ll receive an activation link by email (check spam/clutter).
        </p>
        {error && <div className="err">{error}</div>}
        <button className="btn pri" type="submit" disabled={busy}>
          {busy ? <span className="spin" /> : 'Sign in'}
        </button>
        <div className="lg-links"><a href="#">Forgot password</a><a href="#">meridiangroup.eyeonfat.com</a></div>
      </form>
    </div>
  );
}
