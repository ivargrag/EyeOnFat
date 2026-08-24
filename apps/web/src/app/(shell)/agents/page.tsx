'use client';
import { useState } from 'react';
import { useApi } from '@/lib/store';

interface AgentCard {
  name: string; family: string; stage: string; role: string; mandate: string;
  consumes: string; produces: string;
  lastActivity: { note: string; at: string } | null;
}

export default function AgentsPage() {
  const { data, error, loading } = useApi<{ roster: AgentCard[] }>('/agents/roster');
  const [open, setOpen] = useState<string | null>(null);

  if (loading) return <div><span className="spin" /> Loading the crew…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  return (
    <section className="pg on">
      <div className="eyebrow">The crew — COACH + specialists + Procura Crew</div>
      <h1>Agent crew</h1>
      <p className="sub">
        Each agent writes only to its own layer of the record. Grounding · Refusal · Human-in-the-loop — no side-effect
        with commercial consequence without a signed human acceptance. Click a card for consumes / produces / last activity.
      </p>
      <div className="ag-grid">
        {data.roster.map((a) => (
          <div key={a.name} className={`ag ${a.family === 'orchestrator' ? 'orchc' : ''} ${open === a.name ? 'open' : ''}`}
            tabIndex={0}
            onClick={() => setOpen(open === a.name ? null : a.name)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === a.name ? null : a.name); }}>
            {a.family !== 'orchestrator' && (
              <span className={`fam ${a.family === 'procura' ? 'pc' : 'eof'}`}>{a.stage}</span>
            )}
            <div className="role">{a.role}</div>
            <div className="nm">{a.name}</div>
            <p>{a.mandate}</p>
            <div className="io">
              <b>Consumes</b> {a.consumes} · <b>Produces</b> {a.produces}<br />
              <span className="hint">Last activity: {a.lastActivity?.note ?? '—'}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
