'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApi, useCurrency } from '@/lib/store';
import { Chip, GateBar } from '@/components/bits';

interface LeverCard {
  key: string; label: string; index: number; group: 'mult' | 'add'; groupLabel: string;
  blurb: string; tools: string[]; projectCount: number; totalUsdK: number;
  projects: Array<{ id: string; name: string; annualSavingsUsdK: number; procura: boolean }>;
}

export default function LeversPage() {
  const { data, error, loading } = useApi<{ levers: LeverCard[] }>('/levers');
  const { fK } = useCurrency();
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <div><span className="spin" /> Loading levers…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 04 · The opportunity engine — agent LEVER</div>
      <h1>Seven levers, one pipeline</h1>
      <p className="sub">
        LEVER tags every Fuel-for-Growth-cleared idea to a primary lever and sizes it with calculators.
        Click a lever to expand its linked projects — clicking a project jumps straight into Manage Projects.
        Price, Specifications and Right-Source ideas can convert into full Procura procurement events from within the project.
      </p>
      <div className="lv-grid">
        {data.levers.map((l) => (
          <div key={l.key} className={`lv ${l.group} ${open === l.key ? 'open' : ''}`} tabIndex={0}
            onClick={() => setOpen(open === l.key ? null : l.key)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === l.key ? null : l.key); }}>
            <div className="k">Lever {l.index} · {l.groupLabel}</div>
            <h3>{l.label}</h3>
            <p>{l.blurb}</p>
            <div className="stats">{l.projectCount} project{l.projectCount === 1 ? '' : 's'} · {fK(l.totalUsdK)} / yr</div>
            <div className="lpj">
              <ul style={{ fontSize: 12, color: 'var(--steel)', paddingLeft: 16 }}>
                {l.tools.map((t) => <li key={t}>{t}</li>)}
              </ul>
              <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--steel)' }}>
                Linked projects
              </div>
              {l.projects.length ? l.projects.map((p) => (
                <Link key={p.id} href={`/projects?open=${p.id}`} onClick={(e) => e.stopPropagation()}>
                  → {p.name} · {fK(p.annualSavingsUsdK)}{p.procura && <> · <Chip tone="proc">PROCURA</Chip></>}
                </Link>
              )) : <span className="hint">No linked projects yet</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="handoff">
        <h3>⇢ Procurement hand-off · Procura Crew</h3>
        <p>
          When a project takes the <b>Price</b> or <b>Specifications</b> lever, needs a <b>new supplier</b>, or is tagged{' '}
          <b>Right Source</b>, it can be converted into a Procurement project from inside the project itself. COACH opens
          a Procura sourcing event with the should-cost target pre-loaded into the RFQ, and the Crew runs research → RFP →
          bids → evaluation → recommendation. You keep the award decision at every gate.
        </p>
        <div className="pc-agents">
          <span className="pc-ag">RESEARCHER</span><span className="pc-ag">RFP ARCHITECT</span>
          <span className="pc-ag">BID HANDLER</span><span className="pc-ag">RECOMMENDER</span>
        </div>
      </div>
      <GateBar title="Gate G4 — Ideas sized & committed">
        Category teams select, size and commit ideas into the pipeline. An idea without an owner and a date does not enter.
      </GateBar>
    </section>
  );
}
