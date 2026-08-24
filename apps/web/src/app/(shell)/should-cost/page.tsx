'use client';
import { useEffect, useState } from 'react';
import { api } from '@eof/api-client';
import { useApi, useAuth, useCurrency } from '@/lib/store';
import { Chip, GateBar } from '@/components/bits';

interface Element {
  name: string; agentValue: number | null;
  agentProvenance: Array<{ source: string; asOf: string }>;
  analystValue: number | null; formula: string | null;
}
interface Model {
  id: string; item: string; unit: string; status: string; frozenVersion: number | null;
  structure: Element[]; currentPriceUsd: number; fairMarginFloorPct: number;
  sentinelChecks: Array<{ check: string; model: string; benchmark: string; status: string }>;
  zbcChallenge: { question: string; outcome: string; rationale: string | null };
}

export default function ShouldCostPage() {
  const { data, error, loading, reload } = useApi<{ models: Model[] }>('/should-cost');
  const { fU, currency, rates } = useCurrency();
  const { hasRole } = useAuth();
  const [selId, setSelId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const model = data?.models.find((m) => m.id === selId) ?? data?.models[0] ?? null;
  useEffect(() => { setEdits({}); }, [selId]);

  if (loading) return <div><span className="spin" /> Loading clean-sheets…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data || !model) return <div className="hint">No should-cost models yet.</div>;

  const rate = rates[currency] ?? 1;
  const effective = (el: Element) => {
    const local = edits[el.name];
    if (local !== undefined && local !== '') return Number(local) / rate;
    return el.analystValue ?? el.agentValue ?? 0;
  };
  const total = model.structure.reduce((a, el) => a + effective(el), 0);
  const gap = model.currentPriceUsd - total;

  const saveEdits = async () => {
    const payload = Object.entries(edits)
      .filter(([, v]) => v !== '')
      .map(([elementName, v]) => ({ elementName, analystValue: Number(v) / rate }));
    if (!payload.length) return;
    try {
      await api.patch(`/should-cost/${model.id}/analyst-layer`, { edits: payload });
      setMsg('✓ Analyst layer saved — agent layer preserved as provenance'); setEdits({}); reload();
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); }
  };

  const signG2 = async () => {
    try {
      await api.post(`/should-cost/${model.id}/sign-g2`, { note: 'Clean-sheet accepted' });
      setMsg('✓ G2 signed — version frozen; this fact-base can now anchor negotiations & Procura'); reload();
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); }
  };

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 02 · Agents SCOPE → PULSE → FORGE → SENTINEL</div>
      <h1>Should-cost / zero-based costing</h1>
      <p className="sub">
        The zero-based question first — should this spend exist at all? Then the clean-sheet: SCOPE structures the cost,
        PULSE prices the market, FORGE builds the formula-driven stack, SENTINEL benchmarks and holds the fair-margin floor.
        Your edits are never overwritten.
      </p>
      {data.models.length > 1 && (
        <div className="pj-tools">
          {data.models.map((m) => (
            <button key={m.id} className={`btn sm ${m.id === model.id ? 'pri' : ''}`} type="button" onClick={() => setSelId(m.id)}>
              {m.item.slice(0, 40)} {m.status === 'g2_signed' ? '· G2 ✓' : ''}
            </button>
          ))}
        </div>
      )}
      <div className="sc-wrap">
        <div className="card">
          <h2>Clean-sheet — {model.item}</h2>
          <div className="hint">
            {model.unit} · edit any line — the stack and gap recompute; agent values stay visible as provenance.
            ZBC: <b>{model.zbcChallenge.outcome.replace(/_/g, ' ')}</b>{model.zbcChallenge.rationale ? ` — ${model.zbcChallenge.rationale}` : ''}
          </div>
          <div style={{ marginTop: 10 }}>
            {model.structure.map((el) => {
              const v = effective(el);
              return (
                <div className="stackrow" key={el.name}>
                  <span title={el.agentProvenance.map((p) => `${p.source} (as-of ${p.asOf})`).join(' · ')}>
                    {el.name}
                    {el.analystValue != null && <span className="hint"> · analyst layer</span>}
                  </span>
                  <input type="number" step="0.1" disabled={model.status === 'g2_signed'}
                    value={edits[el.name] ?? (v * rate).toFixed(2)}
                    onChange={(e) => setEdits({ ...edits, [el.name]: e.target.value })} />
                  <span className="pct">{total > 0 ? ((v / total) * 100).toFixed(0) : 0}%</span>
                </div>
              );
            })}
          </div>
          <div className="sc-total"><span>Should-cost total</span><span>{fU(total)}</span></div>
          <div className="sc-total" style={{ fontSize: 15, color: 'var(--steel)' }}>
            <span>Current supplier price</span><span>{fU(model.currentPriceUsd)}</span>
          </div>
          <div className="sc-total" style={{ color: 'var(--fat)' }}>
            <span>Gap — the fat</span>
            <span>{fU(gap)} ({model.currentPriceUsd > 0 ? ((gap / model.currentPriceUsd) * 100).toFixed(1) : 0}%)</span>
          </div>
          {model.status !== 'g2_signed' && hasRole('analyst', 'pm') && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="btn" type="button" onClick={() => void saveEdits()}>Save analyst layer</button>
              <button className="btn pri" type="button" onClick={() => void signG2()}>Sign G2 — freeze version</button>
            </div>
          )}
          {model.status === 'g2_signed' && (
            <div className="okmsg">G2-signed · frozen v{model.frozenVersion} — the only version referencable by negotiations &amp; Procura.</div>
          )}
          {msg && <div className={msg.startsWith('✕') ? 'err' : 'okmsg'}>{msg}</div>}
        </div>
        <div>
          <div className="card">
            <h2>Agent status</h2>
            {[
              ['SCOPE', 'Cost structure locked — element stack with spec pack attached.', 'ok', 'Done'],
              ['PULSE', 'Elements priced off indices with as-of dates; provenance on hover of each line.', 'ok', 'Done'],
              ['FORGE', 'Formula-driven stack assembled; your edits preserved as analyst layer.', 'ok', 'Done'],
              ['SENTINEL', `Checks below — fair-margin floor holding at ${model.fairMarginFloorPct}%.`, 'amb', 'Review'],
            ].map(([nm, p, tone, st]) => (
              <div className="agstat" key={nm as string}>
                <span className="nm">{nm}</span><p>{p}</p><Chip tone={tone as never}>{st}</Chip>
              </div>
            ))}
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <h2>SENTINEL — benchmark checks</h2>
            <table className="tb">
              <thead><tr><th>Check</th><th>Model</th><th>Benchmark</th><th>Status</th></tr></thead>
              <tbody>
                {model.sentinelChecks.map((s) => (
                  <tr key={s.check}>
                    <td>{s.check}</td><td className="hint">{s.model}</td><td className="hint">{s.benchmark}</td>
                    <td><Chip tone={s.status === 'ok' ? 'ok' : s.status === 'red' ? 'red' : 'amb'}>{s.status.toUpperCase()}</Chip></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 7 }}>
              Fair-margin floor enforced — sub-floor &quot;savings&quot; are flagged as supply risk, not wins.
            </div>
          </div>
        </div>
      </div>
      <GateBar title="Gate G2 — Analyst acceptance">
        The analyst signs the clean-sheet before it becomes a negotiation fact-base or RFQ target. Agents assemble in the open; humans accept.
      </GateBar>
    </section>
  );
}
