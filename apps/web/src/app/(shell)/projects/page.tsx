'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@eof/api-client';
import { useApi, useAuth, useCurrency } from '@/lib/store';
import { Chip, GateBar, LEVER_LABEL, StagePill } from '@/components/bits';
import { ProjectDetail } from '@/components/ProjectDetail';
import type { ProjectVM } from '@/components/types';

function ProjectsInner() {
  const search = useSearchParams();
  const { fK } = useCurrency();
  const { user } = useAuth();
  const [showMy, setShowMy] = useState(false);
  const [f, setF] = useState({ bu: '', country: '', pnlElement: '', stage: '', lever: '' });
  const [openId, setOpenId] = useState<string | null>(search.get('open'));
  const { data, error, loading, reload } = useApi<{ projects: ProjectVM[] }>('/projects');

  const rows = useMemo(() => (data?.projects ?? []).filter((p) =>
    (!showMy || p.leadName === user?.name) &&
    (!f.bu || p.bu === f.bu) && (!f.country || p.country === f.country) &&
    (!f.pnlElement || p.pnlElement === f.pnlElement) && (!f.stage || p.stage === f.stage) &&
    (!f.lever || p.lever === f.lever)),
  [data, f, showMy, user]);

  const uni = (k: keyof ProjectVM) => [...new Set((data?.projects ?? []).map((p) => String(p[k])))];
  const tot = (s: string) => rows.filter((p) => p.stage === s).reduce((a, p) => a + p.timeProbabilityAdjustedUsdK, 0);

  const duplicate = async (id: string) => {
    const r = await api.post<{ project: ProjectVM }>(`/projects/${id}/duplicate`, {});
    reload(); setOpenId(r.project.id);
  };

  if (loading) return <div><span className="spin" /> Loading projects…</div>;
  if (error) return <div className="err">{error}</div>;

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 05 · Deliver — the Eye on Fat tool</div>
      <h1>Manage projects</h1>
      <p className="sub">
        One place to create, manage and track every cost-savings project — by BU, Country, Function and P&amp;L element.
        Ideas welcome: commit to finance later. Only Finance can commit to Forecast. Duplicate any project to{' '}
        <b>steal with pride</b>. Projects marked <Chip tone="proc">PROCURA</Chip> run a live procurement event inside the project.
      </p>
      <div className="pj-tools">
        <div className="seg2">
          <button className={showMy ? 'on' : ''} type="button" onClick={() => setShowMy(true)}>My Projects</button>
          <button className={!showMy ? 'on' : ''} type="button" onClick={() => setShowMy(false)}>All Projects</button>
        </div>
        {([['bu', 'BU'], ['country', 'Country'], ['pnlElement', 'P&L element'], ['stage', 'Stage'], ['lever', 'Lever']] as const).map(([k, label]) => (
          <select key={k} className="flt" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
            <option value="">{label}: All</option>
            {(k === 'stage' ? ['Pipeline', 'Forecast', 'Committed', 'Delivered'] : uni(k)).map((v) => <option key={v} value={v}>{k === 'lever' ? LEVER_LABEL[v] ?? v : v}</option>)}
          </select>
        ))}
        <button className="btn sm" type="button" onClick={() => void api.download('/reports/projects.xlsx', 'eyeonfat-projects.xlsx')}>⬇ Excel download</button>
        <Link href="/projects/add" style={{ marginLeft: 'auto' }}><button className="btn pri sm" type="button">＋ Add project</button></Link>
      </div>
      <div className="pj-sum">
        <span>{rows.length} projects</span>
        <span>Pipeline (T&amp;P) {fK(tot('Pipeline'))}</span>
        <span>Forecast (T&amp;P) {fK(tot('Forecast'))}</span>
        <span>Committed (T&amp;P) {fK(tot('Committed'))}</span>
      </div>
      <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
        <table className="tb">
          <thead><tr>
            <th>Project</th><th>BU</th><th>Country</th><th>P&amp;L element</th><th>Lever</th><th>Lead</th>
            <th>Stage</th><th style={{ textAlign: 'right' }}>Annual (000s)</th><th style={{ textAlign: 'right' }}>T&amp;P adj.</th><th />
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href="#" style={{ color: 'var(--ink)', fontWeight: 600 }}
                    onClick={(e) => { e.preventDefault(); setOpenId(p.id); }}>{p.name}</a>
                  {p.procuraEventId ? <> <Chip tone="proc">PROCURA</Chip></>
                    : p.procuraEligible ? <> <Chip>⇢ eligible</Chip></> : null}
                </td>
                <td>{p.bu}</td><td>{p.country}</td><td>{p.pnlElement}</td>
                <td>{LEVER_LABEL[p.lever] ?? p.lever}</td><td>{p.leadName}</td>
                <td><StagePill stage={p.stage} /></td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(p.annualSavingsUsdK)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(p.timeProbabilityAdjustedUsdK)}</td>
                <td><button className="btn sm" title="Duplicate — steal with pride" type="button" onClick={() => void duplicate(p.id)}>⧉</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="hint" style={{ marginTop: 8 }}>
          T&amp;P adj. = annual savings × time factor (savings-start within FY) × probability. ⧉ duplicates the project —
          steal with pride: change BU, country, amounts &amp; timing. Also duplicates from previous year.
        </div>
      </div>
      {openId && <ProjectDetail projectId={openId} onChanged={reload} />}
      <GateBar title="Gates G5 & G6 — Finance governance & SteerCo">
        Only the named Finance Lead can commit a project to Forecast; SteerCo signs delivered savings into actuals and
        next cycle&apos;s zero-based budgets.
      </GateBar>
    </section>
  );
}

export default function ProjectsPage() {
  return <Suspense fallback={<div><span className="spin" /> Loading…</div>}><ProjectsInner /></Suspense>;
}
