'use client';
/**
 * Embedded Procura event UI (F8.2): stage stepper with human-gate diamonds,
 * crew output sections, bids (sealed until deadline), award controls, log.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@eof/api-client';
import { useAuth, useCurrency } from '@/lib/store';
import { Chip } from './bits';
import { PSTAGES, type GateVM, type ProcuraVM, type ProjectVM } from './types';

export function ProcuraPanel({ project, onChange }: { project: ProjectVM; onChange: () => void }) {
  const { hasRole, user } = useAuth();
  const { fU } = useCurrency();
  const [ev, setEv] = useState<ProcuraVM | null>(null);
  const [gates, setGates] = useState<GateVM[]>([]);
  const [selStage, setSelStage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [awardText, setAwardText] = useState('');

  const load = useCallback(async () => {
    if (!project.procuraEventId) return;
    const r = await api.get<{ event: ProcuraVM; gates: GateVM[] }>(`/procura/${project.procuraEventId}`);
    setEv(r.event); setGates(r.gates);
  }, [project.procuraEventId]);

  useEffect(() => { void load(); }, [load]);

  // Live refresh while the crew is working (stages advance server-side).
  useEffect(() => {
    if (!project.procuraEventId) return;
    const t = setInterval(() => { void load(); }, 2500);
    return () => clearInterval(t);
  }, [project.procuraEventId, load]);

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (okMsg) setMsg(okMsg); await load(); onChange(); }
    catch (e) { setMsg(`✕ ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  if (!project.procuraEventId) {
    if (!project.procuraEligible) return null;
    const why = project.needsNewSupplier ? 'it needs a new supplier' : `it takes the ${project.lever} lever`;
    return (
      <div className="procura-box">
        <h3>⇢ Convert to Procurement project</h3>
        <p>
          This project qualifies because {why}. Converting launches the full Procura process inside this project —
          COACH hands the brief and the should-cost target to the Procura Crew
          (<b>Researcher · RFP Architect · Bid Handler · Recommender</b>), who run research → RFP → bids → evaluation →
          recommendation. Every commercially consequential step waits for your signature; the award decision is always yours.
        </p>
        <div style={{ marginTop: 10 }}>
          <button className="btn proc pri" type="button" disabled={busy}
            onClick={() => void act(() => api.post(`/projects/${project.id}/convert-procura`), '✓ Converted — P-INTAKE gate awaits your signature')}>
            Convert &amp; launch Procura Crew
          </button>
        </div>
        {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}
      </div>
    );
  }

  if (!ev) return <div className="procura-box"><span className="spin" /> Loading Procura event…</div>;

  const stageIdx = PSTAGES.findIndex((s) => s.key === ev.stage);
  const viewStage = selStage ?? ev.stage;
  const viewDef = PSTAGES.find((s) => s.key === viewStage)!;
  const openGate = (id: string) => gates.find((g) => g.gateId === id && g.status === 'open');
  const canSignGate = hasRole('procurement', 'manager', 'pm');

  const crewSection = (slot: string, label: string) => {
    const items = ev.crewOutputs[slot] ?? [];
    if (!items.length) return null;
    return (
      <div key={slot} style={{ marginTop: 10 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--proc)' }}>{label}</div>
        {items.map((o, i) => (
          <div key={i} className="pstage-det" style={{ marginTop: 6 }}>
            <b style={{ fontSize: 12.5 }}>{o.title}</b>
            <p style={{ marginTop: 3 }}>{o.body}</p>
            {o.provenance.length > 0 && (
              <div className="hint" style={{ marginTop: 4 }}>
                Provenance: {o.provenance.map((p) => `${p.source} (as-of ${p.asOf})`).join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="procura-box">
      <h3>Procura procurement event — {ev.stage === 'complete' ? 'complete' : 'live'}</h3>
      <p>
        {ev.shouldCostTargetUsd != null && <>Should-cost target <b>{fU(ev.shouldCostTargetUsd)}</b> pre-loaded from Stage 02 (frozen G2 version). </>}
        Current stage: <b>{PSTAGES[stageIdx]?.n}</b> · {PSTAGES[stageIdx]?.ag}
      </p>
      <div className="psteps">
        {PSTAGES.slice(0, 7).map((s, i) => (
          <div key={s.key} className={`pstep ${i < stageIdx ? 'done' : i === stageIdx ? 'now' : ''}`}
            onClick={() => setSelStage(s.key)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelStage(s.key); }}>
            <div className="dot">{i < stageIdx ? '✓' : i + 1}</div>
            <div className="pl">{s.n}{s.gate ? ' ◆' : ''}</div>
          </div>
        ))}
      </div>
      <div className="pstage-det">
        <span className="ag">{viewDef.ag}{viewDef.gate ? ' · human gate ◆' : ''}</span>
        <p style={{ marginTop: 4 }}>{viewDef.d}</p>

        {/* Stage-appropriate human actions — gates are signatures, never automation. */}
        {ev.stage === 'intake' && openGate('P-INTAKE') && canSignGate && (
          <button className="btn sm proc pri" style={{ marginTop: 9 }} disabled={busy} type="button"
            onClick={() => void act(() => api.post(`/gates/${openGate('P-INTAKE')!.id}/sign`, { decision: 'approve', note: 'Scope, incumbent set and timeline confirmed' }), '✓ P-INTAKE signed — crew launched')}>
            ◆ Sign P-INTAKE — confirm scope &amp; launch crew
          </button>
        )}
        {ev.stage === 'rfp_build' && openGate('P-RFP') && canSignGate && (
          <button className="btn sm proc pri" style={{ marginTop: 9 }} disabled={busy} type="button"
            onClick={() => void act(() => api.post(`/gates/${openGate('P-RFP')!.id}/sign`, { decision: 'approve', note: 'RFP approved for distribution' }), '✓ P-RFP signed — matrix locked, RFP distributed')}>
            ◆ Sign P-RFP — lock matrix &amp; distribute
          </button>
        )}
        {ev.stage === 'distribute_bids' && hasRole('procurement', 'manager') && (
          <button className="btn sm proc pri" style={{ marginTop: 9 }} disabled={busy} type="button"
            onClick={() => void act(() => api.post(`/procura/${ev.id}/advance`), '✓ Bidding closed — unsealing at deadline, evaluation running')}>
            Close bidding — unseal &amp; evaluate
          </button>
        )}
        {ev.stage === 'evaluation' && (
          <button className="btn sm proc" style={{ marginTop: 9 }} disabled={busy} type="button"
            onClick={() => void act(() => api.post(`/procura/${ev.id}/run-crew`))}>
            Refresh evaluation
          </button>
        )}
        {ev.stage === 'recommendation' && (
          hasRole('procurement', 'manager') && user?.awardAuthority ? (
            <div style={{ marginTop: 9 }}>
              <input placeholder='Award decision, e.g. "Two-carrier 60/40: Desert Bridge + Falcon Freight"'
                value={awardText} onChange={(e) => setAwardText(e.target.value)} style={{ marginBottom: 6 }} />
              <button className="btn sm proc pri" disabled={busy || !awardText.trim()} type="button"
                onClick={() => void act(() => api.post(`/procura/${ev.id}/award`, { decision: awardText.trim(), note: null }), '✓ Award signed — savings written back, SCRIBE funnel updated')}>
                ◆ Sign P-AWARD — the decision is yours
              </button>
            </div>
          ) : (
            <div className="eligib" style={{ marginTop: 9 }}>
              ◆ Award gate open — requires a procurement/manager principal with award authority. The Crew never awards.
            </div>
          )
        )}
        {ev.stage === 'complete' && (
          <span className="chip ok" style={{ marginTop: 9, display: 'inline-block' }}>
            Event complete — savings written back to this project{ev.award ? ` · awarded by ${ev.award.signerName}` : ''}
          </span>
        )}
      </div>

      {crewSection('researcher', 'Agent · 01 The Researcher')}
      {crewSection('rfp_architect', 'Agent · 02 The RFP Architect')}
      {crewSection('bid_handler', 'Agent · 03 The Bid Handler')}
      {crewSection('recommender', 'Agent · 04 The Recommender')}

      {ev.evaluationMatrix.criteria.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--proc)' }}>
            Evaluation matrix {ev.evaluationMatrix.lockedAt ? `· locked ${String(ev.evaluationMatrix.lockedAt).slice(0, 10)} — immutable` : '· draft (locks at P-RFP)'}
          </div>
          <table className="mini">
            <thead><tr><th>Criterion</th><th>Weight</th></tr></thead>
            <tbody>
              {ev.evaluationMatrix.criteria.map((cr) => (
                <tr key={cr.name}><td>{cr.name}</td><td>{cr.weightPct}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ev.bids.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--proc)' }}>
            Bids ({ev.bids.filter((b) => b.receivedAt).length}/{ev.bids.length} received{ev.bids.some((b) => b.sealed) ? ' · sealed until deadline' : ' · unsealed'})
          </div>
          <table className="mini">
            <thead><tr><th>Supplier</th><th>Received</th><th>Amount</th><th>TCO</th><th>Margin</th><th /></tr></thead>
            <tbody>
              {ev.bids.map((b) => (
                <tr key={b.id}>
                  <td>{b.supplier}</td>
                  <td className="hint">{b.receivedAt ? String(b.receivedAt).slice(0, 10) : 'outstanding'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{b.sealed ? '🔒 sealed' : b.amountUsd != null ? fU(b.amountUsd) : '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)' }}>{!b.sealed && b.tcoUsd != null ? fU(b.tcoUsd) : '—'}</td>
                  <td className="hint">{!b.sealed && b.supplierMarginPct != null ? `${b.supplierMarginPct.toFixed(1)}%` : '—'}</td>
                  <td>{b.subFloor && <Chip tone="red">SENTINEL: sub-floor</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="plog">
        {ev.log.map((l, i) => <div key={i}>› {l.line}</div>)}
      </div>
      {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}
    </div>
  );
}
