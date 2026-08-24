'use client';
/**
 * COACH semi-autonomous run panel (F7.5): live step tracker + streaming log,
 * pauses ◆ at every human gate with "Sign & resume". Killing the browser
 * mid-run resumes from persisted state; no gate is ever auto-signed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@eof/api-client';
import { useAuth } from '@/lib/store';
import type { CouncilVM, GateVM, ProjectVM, RunVM } from './types';

const ICON: Record<string, string> = {
  pending: '·', running: '◌', gate_hold: '◆', done: '✓', skipped: '−', refused: '⊘', failed: '✕',
};

export function CoachPanel({ project, gates, councils, initialRunId, onChange }: {
  project: ProjectVM;
  gates: GateVM[];
  councils: CouncilVM[];
  initialRunId: string | null;
  onChange: () => void;
}) {
  const { hasRole } = useAuth();
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [run, setRun] = useState<RunVM | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async (id: string) => {
    try {
      const r = await api.get<{ run: RunVM }>(`/agent-runs/${id}`);
      setRun(r.run);
      if (['complete', 'failed', 'cancelled'].includes(r.run.status)) {
        if (timer.current) clearInterval(timer.current);
        onChange();
      }
    } catch { /* transient */ }
  }, [onChange]);

  useEffect(() => {
    if (!runId) return;
    void poll(runId);
    timer.current = setInterval(() => void poll(runId), 1200);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [runId, poll]);

  const start = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ runId: string }>(`/projects/${project.id}/coach`);
      setRunId(r.runId);
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const signAndResume = async (gateId: string) => {
    // Fetch fresh gates — the hold gate may have been created after this panel loaded.
    const fresh = await api.get<{ gates: GateVM[] }>('/gates', { objectRef: project.id, status: 'open' }).catch(() => ({ gates } as { gates: GateVM[] }));
    const gate = fresh.gates.find((g) => g.gateId === gateId && g.status === 'open')
      ?? gates.find((g) => g.gateId === gateId && g.status === 'open');
    setBusy(true); setMsg(null);
    try {
      if (gate) {
        const res = await api.post<{ satisfied: boolean }>(`/gates/${gate.id}/sign`, { decision: gateId === 'G3' ? 'proceed' : 'approve', note: 'Signed from COACH panel' });
        if (!res.satisfied) setMsg(`✎ Signature recorded — ${gateId} still needs another qualified signer before COACH resumes.`);
      }
      if (runId) await api.post(`/agent-runs/${runId}/resume`);
      onChange();
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); }
    finally { setBusy(false); }
  };

  const holdStep = run?.steps.find((s) => s.status === 'gate_hold');

  return (
    <div className="card" style={{ marginTop: 10, background: '#FFFDF4', border: '1.5px solid var(--ink)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>COACH — semi-autonomous run</h3>
        <span className="hint">Runs the crew end-to-end between gates; pauses ◆ at every human gate. COACH never signs.</span>
        <span style={{ marginLeft: 'auto' }}>
          {!runId || (run && ['complete', 'failed', 'cancelled'].includes(run.status)) ? (
            <button className="btn sm pri" type="button" disabled={busy} onClick={() => void start()}>
              {run?.status === 'complete' ? 'Run again' : 'Hand to COACH'}
            </button>
          ) : <span className="chip amb">{run?.status ?? 'starting…'}</span>}
        </span>
      </div>
      {run && (
        <div className="coach-steps">
          {run.steps.map((s) => (
            <div key={s.idx} className={`cstep ${s.status === 'gate_hold' ? 'hold' : ''}`}>
              <span className="st-ic">{ICON[s.status] ?? '·'}</span>
              <span className="st-agent">{s.agent}</span>
              <span className="st-detail">
                <b style={{ color: 'var(--ink)' }}>{s.title}</b>
                {s.detail ? <> — {s.detail}</> : null}
                {s.status === 'gate_hold' && s.gateId && (
                  <div style={{ marginTop: 5 }}>
                    {hasRole('pm', 'manager', 'analyst', 'finance', 'owner') ? (
                      <button className="btn sm pri" type="button" disabled={busy} onClick={() => void signAndResume(s.gateId!)}>
                        ◆ Sign {s.gateId} &amp; resume
                      </button>
                    ) : <span className="hint">◆ Waiting for a qualified human signature on {s.gateId}</span>}
                  </div>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {holdStep && <div className="hint" style={{ marginTop: 8 }}>Paused at {holdStep.gateId} — the run resumes only after the gate collects its human signature(s).</div>}
      {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}

      {councils.length > 0 && (
        <div className="council">
          <b style={{ fontFamily: 'var(--disp)', textTransform: 'uppercase', fontSize: 14 }}>Lever Council — latest session</b>
          {councils[0].transcript.map((s, i) => (
            <div className="stance" key={i}>
              <span className="who">{s.agent}</span>
              <span>{s.stance} <span className="hint">[{s.levers.join(', ')}]</span></span>
            </div>
          ))}
          <div style={{ marginTop: 8, fontSize: 12.5 }}>
            <b>Consensus:</b> {councils[0].consensus ?? '—'}
            {councils[0].dissent && <> · <b>Dissent:</b> {councils[0].dissent}</>}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            Recorded by {councils[0].recordedBy} · {councils[0].humanDecision
              ? `Human decision: ${councils[0].humanDecision.lever} (${councils[0].humanDecision.userName})`
              : 'Awaiting the human lever decision — the council only advises.'}
          </div>
        </div>
      )}
    </div>
  );
}
