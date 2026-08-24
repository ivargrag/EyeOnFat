'use client';
/** MFA enrolment for roles where the tenant enforces TOTP (finance/admin). */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@eof/api-client';
import { LogoBlock } from '@/components/Logo';

export default function MfaSetupPage() {
  const router = useRouter();
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    try {
      const r = await api.post<{ secret: string; otpauthUrl: string }>('/auth/mfa/setup');
      setSecret(r.secret); setOtpauthUrl(r.otpauthUrl);
    } catch (e) { setError((e as Error).message); }
  };

  const verify = async () => {
    try {
      const r = await api.post<{ accessToken: string }>('/auth/mfa/verify', { totp: code });
      api.setToken(r.accessToken);
      router.replace('/dashboard');
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div id="login">
      <div className="lg-card">
        <LogoBlock />
        <h3 style={{ marginTop: 18 }}>MFA enrolment required</h3>
        <p className="note">Your role requires TOTP multi-factor authentication before full access.</p>
        {!secret ? (
          <button className="btn pri" type="button" onClick={() => void begin()}>Generate TOTP secret</button>
        ) : (
          <>
            <p className="note" style={{ wordBreak: 'break-all' }}>
              Add this secret to your authenticator app:<br /><b style={{ fontFamily: 'var(--mono)' }}>{secret}</b>
            </p>
            <p className="note" style={{ wordBreak: 'break-all' }}>{otpauthUrl}</p>
            <label className="fl">6-digit code</label>
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn pri" type="button" onClick={() => void verify()}>Verify &amp; continue</button>
          </>
        )}
        {error && <div className="err">{error}</div>}
      </div>
    </div>
  );
}
