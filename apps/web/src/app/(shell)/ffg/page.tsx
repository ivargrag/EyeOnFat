'use client';
import { useState } from 'react';
import { api } from '@eof/api-client';
import { useApi, useAuth, useCurrency } from '@/lib/store';
import { GateBar, LEVER_LABEL } from '@/components/bits';

interface FfgTest { test: string; score: number; tone: 'lean' | 'amber' | 'fat'; evidence: string }
interface Case {
  project: {
    id: string; name: string; lever: string; annualSavingsUsdK: number; classification: string | null;
    ffgDecision: { verdict: string; tests: FfgTest[]; redesignProposal: string | null; decision: string | null } | null;
    leadName: string;
  };
  gate: {
    id: string; status: string;
    signatures: Array<{ userName: string; role: string; decision: string; ts: string }>;
  } | null;
}

const TESTS_TABLE: Array<[string, string]> = [
  ['Customer experience', 'Will the customer notice, and will it change purchase or repeat behaviour?'],
  ['Quality & spec integrity', 'Does the product still meet its functional spec (e.g. bag carry-capacity, failure rate) after the change?'],
  ['Growth capacity', 'Does this remove capacity, capability or investment the growth plan depends on?'],
  ['Supply continuity', 'Does the saving push a supplier below the fair-margin floor or concentrate risk?'],
  ['Brand, safety & compliance', 'Any regulatory, safety or brand-promise exposure?'],
];

const toneColor = (t: string) => t === 'lean' ? 'var(--lean)' : t === 'amber' ? 'var(--amber)' : 'var(--fat)';
const clsClass = (c: string | null) => c === 'FAT' ? 't-fat' : c === 'MUSCLE' ? 't-mus' : 't-bone';

export default function FfgPage() {
  const { data, error, loading, reload } = useApi<{ cases: Case[] }>('/ffg/cases');
  const { fK } = useCurrency();
  const { hasRole } = useAuth();
  const [openTests, setOpenTests] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});

  const decide = async (projectId: string, decision: 'proceed' | 'hold' | 'reject') => {
    try {
      const r = await api.post<{ satisfied: boolean; pendingSecondSignature: boolean }>(
        `/ffg/${projectId}/decide`, { decision, note: null });
      setMsg({
        ...msg,
        [projectId]: r.satisfied
          ? `✓ ${decision.toUpperCase()} — dual-signed to the audit log`
          : `✎ First signature recorded (${decision}) — awaiting the second qualified signer`,
      });
      reload();
    } catch (e) { setMsg({ ...msg, [projectId]: `✕ ${(e as Error).message}` }); }
  };

  if (loading) return <div><span className="spin" /> Loading FFG cases…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 03 · Agent FUEL FOR GROWTH · Gate G3</div>
      <h1>Fuel for growth</h1>
      <p className="sub">
        Before any idea enters the savings pipeline, the FUEL FOR GROWTH agent stress-tests it with evidence:
        is this genuinely <b>fat</b> (waste), or is it <b>muscle</b> (growth-enabling capability) or <b>bone</b> (structural
        necessity) wearing a savings disguise? The agent only testifies — the Project Manager and the accountable
        business Manager make the call, every decision dual-signed into the audit log.
      </p>
      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>The five tests</h2>
        <table className="tb">
          <thead><tr><th>Test</th><th>Question the FUEL FOR GROWTH agent answers with evidence</th></tr></thead>
          <tbody>{TESTS_TABLE.map(([t, q]) => <tr key={t}><td><b>{t}</b></td><td>{q}</td></tr>)}</tbody>
        </table>
      </div>
      {data.cases.map(({ project: p, gate }) => {
        const d = p.ffgDecision;
        if (!d) return null;
        const signed = gate?.status !== 'open';
        return (
          <div className="ffg-item" key={p.id}>
            <div className="ffg-h">
              <span className={`cls ${clsClass(d ? p.classification : null)}`}>{p.classification ?? '—'}</span>
              <span className="nm">{p.name}</span>
              <span className="amt">{fK(p.annualSavingsUsdK)} / yr · Lever: {LEVER_LABEL[p.lever] ?? p.lever}</span>
            </div>
            <div className="tests">
              {d.tests.map((t) => {
                const key = `${p.id}:${t.test}`;
                return (
                  <div key={key} className={`test ${openTests[key] ? 'open' : ''}`} tabIndex={0}
                    onClick={() => setOpenTests({ ...openTests, [key]: !openTests[key] })}
                    onKeyDown={(e) => { if (e.key === 'Enter') setOpenTests({ ...openTests, [key]: !openTests[key] }); }}>
                    <div className="tl">{t.test}</div>
                    <div className="tbarr"><i style={{ width: `${t.score}%`, background: toneColor(t.tone) }} /></div>
                    <div className="ts2" style={{ color: toneColor(t.tone) }}>{t.score}/100 · click for evidence</div>
                    <div className="ev">{t.evidence}</div>
                  </div>
                );
              })}
            </div>
            <div className="ffg-verdict">{d.verdict}{d.redesignProposal ? ` Redesign: ${d.redesignProposal}` : ''}</div>
            <div className="decide">
              {!signed && hasRole('pm', 'manager') ? (
                <>
                  <button className="db go" type="button" onClick={() => void decide(p.id, 'proceed')}>Proceed</button>
                  <button className="db hold" type="button" onClick={() => void decide(p.id, 'hold')}>Hold — redesign</button>
                  <button className="db stop" type="button" onClick={() => void decide(p.id, 'reject')}>Reject</button>
                </>
              ) : signed && (
                <span className="signed">
                  ✔ {String(d.decision ?? gate?.signatures[0]?.decision ?? '').toUpperCase()} — dual-signed to audit log
                </span>
              )}
              <span className="signers">
                Dual-sign required · pm + manager
                {(gate?.signatures ?? []).length > 0 && ` · signed: ${gate!.signatures.map((s) => `${s.userName} (${s.role})`).join(' · ')}`}
              </span>
            </div>
            {msg[p.id] && <div className={msg[p.id].startsWith('✕') ? 'err' : 'okmsg'}>{msg[p.id]}</div>}
          </div>
        );
      })}
      <GateBar title="Gate G3 — Fuel-for-Growth decision">
        Proceed / Hold / Reject requires two signatures: the Project Manager and the accountable business Manager.
        A HOLD returns the idea to redesign; a REJECT archives it with the reasoning. No idea reaches the 7-Lever
        pipeline without a green decision here.
      </GateBar>
    </section>
  );
}
