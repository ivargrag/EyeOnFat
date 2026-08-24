'use client';
/** Project detail — four accordions per prototype + Procura panel + COACH panel. */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@eof/api-client';
import { useAuth, useCurrency } from '@/lib/store';
import { Chip, LEVER_LABEL, StagePill } from './bits';
import { ProcuraPanel } from './ProcuraPanel';
import { CoachPanel } from './CoachPanel';
import type { CouncilVM, GateVM, ProjectVM } from './types';

interface DetailData {
  project: ProjectVM;
  gates: GateVM[];
  councilSessions: CouncilVM[];
  coachRuns: Array<{ id: string; status: string }>;
}

export function ProjectDetail({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const { fK } = useCurrency();
  const { hasRole, user } = useAuth();
  const [data, setData] = useState<DetailData | null>(null);
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true });
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<DetailData>(`/projects/${projectId}`);
    setData(r);
  }, [projectId]);

  useEffect(() => { setOpen({ 1: true }); setMsg(null); void load(); }, [load]);

  if (!data) return <div className="pdetail"><span className="spin" /> Loading project…</div>;
  const p = data.project;
  const activeRun = data.coachRuns.find((r) => ['queued', 'running', 'gate_hold'].includes(r.status)) ?? data.coachRuns[0] ?? null;

  const commitForecast = async () => {
    setMsg(null);
    try {
      await api.post(`/projects/${p.id}/commit-forecast`, { note: 'Vetted and committed by Finance' });
      setMsg('✓ G5 signed — committed to Forecast'); await load(); onChanged();
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); }
  };

  const acc = (n: number, title: string, body: React.ReactNode) => (
    <div className={`acc ${open[n] ? 'open' : ''}`}>
      <button type="button" onClick={() => setOpen({ ...open, [n]: !open[n] })}>{n} · {title} <span>▾</span></button>
      <div className="bd">{body}</div>
    </div>
  );

  return (
    <div className="pdetail">
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <StagePill stage={p.stage} />
          {p.procuraEventId && <Chip tone="proc">PROCURA</Chip>}
          {p.classification && <Chip tone={p.classification === 'FAT' ? 'ok' : p.classification === 'MUSCLE' ? 'amb' : 'red'}>{p.classification}</Chip>}
          <span className="hint" style={{ marginLeft: 'auto' }}>
            Lead {p.leadName} · Finance {p.financeLeadName} · Savings start {p.savingsStart ?? '—'}
          </span>
        </div>

        {acc(1, 'Details', (
          <>
            <p style={{ marginTop: 10, fontSize: 13, whiteSpace: 'pre-line' }}>{p.description}</p>
            <div className="hint" style={{ marginTop: 6 }}>
              BU {p.bu} · Country {p.country} · P&amp;L {p.pnlElement} · Lever {LEVER_LABEL[p.lever] ?? p.lever} ·
              Team: {p.team.join(', ') || '—'}{p.needsNewSupplier ? ' · Requires new supplier' : ''}
              {p.duplicatedFrom ? ' · ⧉ stolen with pride' : ''}
            </div>
            <ProcuraPanel project={p} onChange={() => { void load(); onChanged(); }} />
            <CoachPanel project={p} gates={data.gates} councils={data.councilSessions}
              initialRunId={activeRun?.id ?? null} onChange={() => { void load(); onChanged(); }} />
          </>
        ))}

        {acc(2, 'Savings', (
          <>
            <div className="pj-sum" style={{ marginTop: 10 }}>
              <span>Annual {fK(p.annualSavingsUsdK)}</span>
              <span>Probability {p.probabilityPct}%</span>
              <span>Time &amp; probability adjusted {fK(p.timeProbabilityAdjustedUsdK)}</span>
              <span>Carry-forward {fK(p.carryForwardUsdK)}</span>
            </div>
            <div className="finlock">
              🔒 Only Finance ({p.financeLeadName}) can commit this project to Forecast.
              {p.stage === 'Pipeline' && hasRole('finance') && (
                <button className="btn sm" style={{ marginLeft: 8 }} type="button" onClick={() => void commitForecast()}>
                  Commit to Forecast (G5, as {user?.name})
                </button>
              )}
              {p.stage === 'Pipeline' && !hasRole('finance') && (
                <span className="hint" style={{ marginLeft: 8 }}>Signed in as a non-finance role — the API will refuse a commit from you.</span>
              )}
            </div>
            {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}
          </>
        ))}

        {acc(3, 'Cost to achieve', (
          <p className="hint" style={{ marginTop: 10 }}>
            One-time {fK(p.costToAchieve.oneTimeUsdK)} · Recurring {fK(p.costToAchieve.recurringUsdK)}
            {p.costToAchieve.notes ? ` · ${p.costToAchieve.notes}` : ''}
          </p>
        ))}

        {acc(4, 'Milestones & meetings', (
          <>
            <table className="mini">
              <thead><tr><th>Milestone</th><th>Owner</th><th>%</th></tr></thead>
              <tbody>
                {p.milestones.length ? p.milestones.map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td>{m.owner}</td><td>{m.pct}%</td></tr>
                )) : <tr><td className="hint" colSpan={3}>No milestones yet</td></tr>}
              </tbody>
            </table>
            <table className="mini">
              <thead><tr><th>Meeting</th><th>Date</th><th>MoM</th></tr></thead>
              <tbody>
                {p.meetings.length ? p.meetings.map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td>{m.date ?? '—'}</td><td className="hint">{m.momAttachment ?? '—'}</td></tr>
                )) : <tr><td className="hint" colSpan={3}>No meetings yet</td></tr>}
              </tbody>
            </table>
          </>
        ))}

        <div className="sig-list">
          {data.gates.filter((g) => g.status !== 'open').map((g) => (
            <div key={g.id}>✔ {g.gateId} {g.status} — {g.signatures.map((s) => `${s.userName} (${s.role}, ${String(s.ts).slice(0, 10)})`).join(' + ')}</div>
          ))}
          {data.gates.filter((g) => g.status === 'open').map((g) => (
            <div key={g.id} className="gate-open">◆ {g.gateId} open — {g.signatures.length}/{g.requiredDistinctSignatures} signatures · requires {g.requiredRoles.join(' / ')}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
