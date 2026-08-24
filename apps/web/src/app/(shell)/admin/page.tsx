'use client';
import { useState } from 'react';
import { api } from '@eof/api-client';
import { useApi, useAuth } from '@/lib/store';
import { Chip } from '@/components/bits';

interface Users { users: Array<{ id: string; email: string; name: string; roles: string[]; mfaEnabled: boolean; awardAuthority: boolean; active: boolean }> }
interface Audit { entries: Array<{ id: number; ts: string; actorName: string; channel: string; action: string; objectType: string | null; hash: string }> }
interface Registry { models: Array<{ modelId: string; provider: string; status: string; costInPerM: number; costOutPerM: number }> }
interface Settings { tenant: { slug: string; name: string; settings: Record<string, unknown> } }

export default function AdminPage() {
  const { hasRole } = useAuth();
  const canAdmin = hasRole('admin', 'owner');
  const { data: users } = useApi<Users>(canAdmin ? '/admin/users' : null);
  const { data: auditLog } = useApi<Audit>(hasRole('admin', 'owner', 'finance') ? '/admin/audit?limit=40' : null);
  const { data: registry } = useApi<Registry>(canAdmin ? '/admin/model-registry' : null);
  const { data: settings, reload: reloadSettings } = useApi<Settings>(canAdmin ? '/admin/settings' : null);
  const [msg, setMsg] = useState<string | null>(null);

  if (!hasRole('admin', 'owner', 'finance')) {
    return <section className="pg on"><h1>Admin</h1><div className="err">Requires admin, owner or finance role.</div></section>;
  }
  const s = settings?.tenant.settings ?? {};

  const saveFloor = async (v: number) => {
    try { await api.patch('/admin/settings', { fairMarginFloorPct: v }); setMsg('✓ Fair-margin floor updated'); reloadSettings(); }
    catch (e) { setMsg(`✕ ${(e as Error).message}`); }
  };

  return (
    <section className="pg on">
      <div className="eyebrow">M10 · Tenant administration</div>
      <h1>Admin</h1>
      <p className="sub">Tenant settings, users &amp; roles, model registry (P5), and the hash-chained audit log.</p>

      {canAdmin && settings && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Tenant settings — {settings.tenant.name}</h2>
          <div className="pj-sum" style={{ marginTop: 8 }}>
            <span>FY start month: {String(s.fyStartMonth ?? 4)} (Apr–Mar)</span>
            <span>Base currency: USD</span>
            <span>Currencies: {(s.enabledCurrencies as string[] | undefined)?.join(', ') ?? '—'}</span>
            <span>G0 target: {String(s.g0CompletenessTargetPct ?? 95)}%</span>
            <span>MFA enforced for: {((s.mfaRequiredForRoles as string[] | undefined) ?? []).join(', ') || 'none (demo)'}</span>
          </div>
          <label className="fl">Fair-margin floor % (SENTINEL guardrail)</label>
          <div style={{ display: 'flex', gap: 8, maxWidth: 260 }}>
            <input type="number" step="0.5" defaultValue={Number(s.fairMarginFloorPct ?? 8)} id="floorInput" />
            <button className="btn sm" type="button"
              onClick={() => void saveFloor(Number((document.getElementById('floorInput') as HTMLInputElement).value))}>Save</button>
          </div>
          {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}
        </div>
      )}

      {canAdmin && users && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Users &amp; roles</h2>
          <table className="tb">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>MFA</th><th>Award authority</th><th>Status</th></tr></thead>
            <tbody>
              {users.users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td><td className="hint">{u.email}</td>
                  <td>{u.roles.map((r) => <Chip key={r}>{r}</Chip>)}</td>
                  <td>{u.mfaEnabled ? <Chip tone="ok">TOTP</Chip> : <span className="hint">—</span>}</td>
                  <td>{u.awardAuthority ? '✓' : '—'}</td>
                  <td>{u.active ? <Chip tone="ok">active</Chip> : <Chip tone="red">disabled</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canAdmin && registry && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Model registry — Model Gateway (P5)</h2>
          <p className="hint">Adding a model = adding a registry row (+ a provider adapter if the provider is new). No product-code change.</p>
          <table className="tb">
            <thead><tr><th>Model</th><th>Provider</th><th>Status</th><th>Cost in/out per M tokens</th></tr></thead>
            <tbody>
              {registry.models.map((m) => (
                <tr key={m.modelId}>
                  <td style={{ fontFamily: 'var(--mono)' }}>{m.modelId}</td><td>{m.provider}</td>
                  <td><Chip tone={m.status === 'active' ? 'ok' : m.status === 'canary' ? 'amb' : 'red'}>{m.status}</Chip></td>
                  <td className="hint">${m.costInPerM} / ${m.costOutPerM}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {auditLog && (
        <div className="card" style={{ marginTop: 14 }}>
          <h2>Audit log — append-only, hash-chained</h2>
          <table className="tb">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Object</th><th>Hash</th></tr></thead>
            <tbody>
              {auditLog.entries.map((e) => (
                <tr key={e.id}>
                  <td className="hint">{String(e.ts).slice(0, 19).replace('T', ' ')}</td>
                  <td>{e.actorName}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.action}</td>
                  <td className="hint">{e.objectType ?? '—'}</td>
                  <td className="hint" style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{e.hash.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
