'use client';
import Link from 'next/link';
import { useApi, useCurrency } from '@/lib/store';
import { Chip, GateBar, MonthlyBars, type MonthDatum } from '@/components/bits';

interface Dash {
  kpis: { pipelineUsdK: number; forecastUsdK: number; committedUsdK: number; activeProjects: number; procuraEvents: number; addressedSpendPct: number };
  monthly: MonthDatum[];
  attention: Array<{ label: string; kind: string }>;
  procuraProjects: Array<{ eventId: string; projectId: string; name: string; stage: string }>;
  completenessPct: number;
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<Dash>('/dashboard');
  const { fK } = useCurrency();

  if (loading) return <div><span className="spin" /> Loading dashboard…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  const k = data.kpis;
  const kpis: Array<[string, string | number, string]> = [
    ['Pipeline', fK(k.pipelineUsdK), ''], ['Forecast', fK(k.forecastUsdK), ''],
    ['Committed', fK(k.committedUsdK), 'hot'], ['Active projects', k.activeProjects, ''],
    ['Procura events', k.procuraEvents, ''], ['Addressed spend', `${k.addressedSpendPct}%`, ''],
  ];

  return (
    <section className="pg on">
      <div className="eyebrow">Programme overview · FY 2026–27</div>
      <h1>Cost transformation dashboard</h1>
      <p className="sub">
        Systematic, sustainable squeezing of costs — cut the fat, never the bone or muscle.
        Every figure converts live with the currency selector.
      </p>
      <div className="kpis">
        {kpis.map(([l, v, cls]) => (
          <div key={l} className={`kpi ${cls}`}><div className="v">{v}</div><div className="l">{l}</div></div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Monthly savings — Pipeline · Forecast · Committed</h2>
        <div className="hint">Totals shown above each month in millions. Cumulative T&amp;P-adjusted phasing.</div>
        <MonthlyBars data={data.monthly} />
      </div>
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Needs attention</h2>
          <table className="tb"><tbody>
            {data.attention.map((a, i) => (
              <tr key={i}>
                <td style={{ width: 26 }}>⚑</td><td>{a.label}</td>
                <td><Chip tone={a.kind === 'procura' ? 'proc' : a.kind === 'action' ? 'red' : 'amb'}>
                  {a.kind === 'procura' ? 'PROCURA' : a.kind === 'action' ? 'ACTION' : 'WATCH'}
                </Chip></td>
              </tr>
            ))}
          </tbody></table>
        </div>
        <div className="card">
          <h2>Procura-linked projects</h2>
          <p className="hint" style={{ marginBottom: 6 }}>
            Projects converted to procurement events — the Procura Crew runs the sourcing; you keep the award decision.
          </p>
          <table className="tb"><tbody>
            {data.procuraProjects.length ? data.procuraProjects.map((p) => (
              <tr key={p.eventId}>
                <td>{p.name}</td>
                <td className="hint">{p.stage.replace(/_/g, ' ')}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link href={`/projects?open=${p.projectId}`}><button className="btn sm proc" type="button">Open</button></Link>
                </td>
              </tr>
            )) : <tr><td className="hint">No projects converted yet — eligible projects show a Convert button in their detail.</td></tr>}
          </tbody></table>
        </div>
      </div>
      <GateBar title="Gate G0 — Scope & completeness">
        Spend base {data.completenessPct}% classified. The owner/CFO confirms the spend base is complete and correctly classified before any analysis begins.
      </GateBar>
    </section>
  );
}
