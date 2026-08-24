'use client';
/** Small shared UI bits matching the prototype. */
import { useCurrency } from '@/lib/store';

export function GateBar({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="gatebar">
      <span className="diamond" />
      <div><b>{title}</b><p>{children}</p></div>
    </div>
  );
}

export interface MonthDatum { month: string; pipeline: number; forecast: number; committed: number }

/** Monthly stacked bars with $M totals above each column (F9.1). */
export function MonthlyBars({ data }: { data: MonthDatum[] }) {
  const { fM } = useCurrency();
  const max = Math.max(1, ...data.map((m) => m.pipeline + m.forecast + m.committed));
  const h = (v: number) => Math.round((v / max) * 130);
  const tC = data.reduce((s, m) => s + m.committed, 0) / 12;
  const tF = data.reduce((s, m) => s + m.forecast, 0) / 12;
  const tP = data.reduce((s, m) => s + m.pipeline, 0) / 12;
  return (
    <>
      <div className="barwrap">
        {data.map((m) => {
          const tot = m.pipeline + m.forecast + m.committed;
          return (
            <div key={m.month} style={{ flex: 1 }}>
              <div className="mtot">{fM(tot)}</div>
              <div className="mcol" style={{ height: 130 }}>
                <div className="mseg" style={{ background: 'var(--lean)', height: h(m.committed) }} />
                <div className="mseg" style={{ background: 'var(--amber)', height: h(m.forecast) }} />
                <div className="mseg" style={{ background: 'var(--steel)', height: h(m.pipeline) }} />
              </div>
              <div className="mlab">{m.month}</div>
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--lean)' }} />Committed (avg {fM(tC)})</span>
        <span><i style={{ background: 'var(--amber)' }} />Forecast (avg {fM(tF)})</span>
        <span><i style={{ background: 'var(--steel)' }} />Pipeline (avg {fM(tP)})</span>
      </div>
    </>
  );
}

const PCOL = ['#E4572E', '#1E8A5A', '#D9930D', '#5A6B66', '#2F5D8A', '#7A6A55'];

export function Pie({ pairs }: { pairs: Array<{ name: string; usdK: number }> }) {
  const { fK } = useCurrency();
  const tot = Math.max(1, pairs.reduce((a, p) => a + p.usdK, 0));
  let acc = 0;
  const stops = pairs.map((p, i) => {
    const a0 = (acc / tot) * 360; acc += p.usdK; const a1 = (acc / tot) * 360;
    return `${PCOL[i % 6]} ${a0}deg ${a1}deg`;
  }).join(',');
  return (
    <div className="pierow">
      <div className="pie" style={{ background: `conic-gradient(${stops})` }} />
      <div className="pkeys">
        {pairs.map((p, i) => (
          <div key={p.name}>
            <i style={{ background: PCOL[i % 6] }} />{p.name} · {fK(p.usdK)} ({Math.round((p.usdK / tot) * 100)}%)
          </div>
        ))}
      </div>
    </div>
  );
}

export function Chip({ tone, children }: { tone?: 'ok' | 'amb' | 'red' | 'proc'; children: React.ReactNode }) {
  return <span className={`chip ${tone ?? ''}`}>{children}</span>;
}

export function StagePill({ stage }: { stage: string }) {
  return <span className={`stgpill stg-${stage.charAt(0)}`}>{stage}</span>;
}

export const LEVER_LABEL: Record<string, string> = {
  Price: 'Price', Specifications: 'Specifications', Demand: 'Demand', Eliminate: 'Eliminate',
  Automate: 'Automate (Digitise)', Consolidate: 'Consolidate', RightSource: 'Right Source',
};
