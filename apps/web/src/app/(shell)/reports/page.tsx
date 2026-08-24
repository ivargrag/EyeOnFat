'use client';
import { api } from '@eof/api-client';
import { useApi, useCurrency } from '@/lib/store';
import { MonthlyBars, Pie, type MonthDatum } from '@/components/bits';

interface Summary {
  byBu: Array<{ name: string; usdK: number }>;
  byCountry: Array<{ name: string; usdK: number }>;
  byPnl: Array<{ name: string; pipeline: number; forecast: number; committed: number; total: number }>;
  monthly: MonthDatum[];
}

export default function ReportsPage() {
  const { data, error, loading } = useApi<Summary>('/reports/summary');
  const { fK } = useCurrency();

  if (loading) return <div><span className="spin" /> Building reports…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 05 · Agent SCRIBE — SteerCo reporting</div>
      <h1>Reports</h1>
      <p className="sub">
        Standard reports by BU, Country, P&amp;L element and month, plus the custom query tool. Excel download of any view.
      </p>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card"><h2>Savings by BU</h2><Pie pairs={data.byBu} /></div>
        <div className="card"><h2>Savings by Country</h2><Pie pairs={data.byCountry} /></div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>By P&amp;L element</h2>
        <table className="tb">
          <thead><tr>
            <th>P&amp;L element</th><th style={{ textAlign: 'right' }}>Pipeline</th>
            <th style={{ textAlign: 'right' }}>Forecast</th><th style={{ textAlign: 'right' }}>Committed</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr></thead>
          <tbody>
            {data.byPnl.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(r.pipeline)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(r.forecast)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(r.committed)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}><b>{fK(r.total)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Monthly phasing — Pipeline · Forecast · Committed</h2>
        <MonthlyBars data={data.monthly} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button className="btn" type="button" onClick={() => void api.download('/reports/projects.xlsx', 'eyeonfat-projects.xlsx')}>⬇ Excel download</button>
        <button className="btn" type="button" onClick={() => window.open('/api/reports/steerco-pack', '_blank')}>SteerCo pack (print/PDF)</button>
      </div>
    </section>
  );
}
