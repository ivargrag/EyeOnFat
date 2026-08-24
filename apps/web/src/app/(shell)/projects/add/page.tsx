'use client';
/** Add project (F7.3) — four sections; T&P auto-computed; Procura eligibility flag. */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@eof/api-client';
import { carryForward, timeProbabilityAdjusted } from '@eof/domain';
import { useAuth, useCurrency } from '@/lib/store';
import { LEVER_LABEL } from '@/components/bits';

const BUS = ['Retail', 'Hospitality', 'Corporate', 'Manufacturing', 'E-commerce'];
const COUNTRIES = ['UAE', 'KSA', 'India', 'USA', 'UK'];
const FUNCTIONS = ['Procurement', 'Supply chain', 'Marketing', 'IT', 'Finance', 'Operations'];
const PNL = ['Packaging', 'Raw materials', 'Logistics & freight', 'Rent & utilities', 'Marketing', 'IT & telecom', 'Travel & admin', 'Manpower services'];
const LEVERS = ['Price', 'Specifications', 'Demand', 'Eliminate', 'Automate', 'Consolidate', 'RightSource'];

export default function AddProjectPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { fK } = useCurrency();
  const [open, setOpen] = useState<Record<number, boolean>>({ 1: true });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: '', bu: 'Retail', country: 'UAE', fn: 'Procurement', pnlElement: 'Packaging',
    lever: 'Price', needsNewSupplier: false, description: '',
    annualSavingsUsdK: 120, probabilityPct: 75, savingsStart: '2026-10-01', savingsEnd: '',
    oneTime: 0, recurring: 0, costNotes: '',
    team: '',
    milestones: [{ name: 'Baseline validated', owner: '', due: '2026-09-15', pct: 0 }],
    meetings: [{ name: 'Kick-off', date: '2026-08-20' }],
  });

  // → Opportunity pre-fill from the Spend Tree (AC F3.3).
  useEffect(() => {
    const raw = sessionStorage.getItem('eof-prefill');
    if (raw) {
      sessionStorage.removeItem('eof-prefill');
      try {
        const p = JSON.parse(raw);
        setForm((f) => ({
          ...f, name: p.name ?? f.name, bu: p.bu ?? f.bu, country: p.country ?? f.country,
          pnlElement: PNL.includes(p.pnlElement) ? p.pnlElement : f.pnlElement,
          lever: p.lever ?? f.lever, annualSavingsUsdK: p.annualSavingsUsdK ?? f.annualSavingsUsdK,
          probabilityPct: p.probabilityPct ?? f.probabilityPct, description: p.description ?? f.description,
        }));
      } catch { /* ignore */ }
    }
  }, []);

  const tp = useMemo(() => timeProbabilityAdjusted({
    annualUsdK: Number(form.annualSavingsUsdK) || 0,
    probabilityPct: Number(form.probabilityPct) || 0,
    savingsStart: form.savingsStart || '2026-10-01',
  }), [form.annualSavingsUsdK, form.probabilityPct, form.savingsStart]);
  const cf = useMemo(() => carryForward({
    annualUsdK: Number(form.annualSavingsUsdK) || 0,
    probabilityPct: Number(form.probabilityPct) || 0,
    savingsStart: form.savingsStart || '2026-10-01',
  }), [form.annualSavingsUsdK, form.probabilityPct, form.savingsStart]);

  const eligible = ['Price', 'Specifications', 'RightSource'].includes(form.lever) || form.needsNewSupplier;

  const save = async () => {
    if (!form.name.trim()) { setMsg('✕ Project name is required'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ project: { id: string } }>('/projects', {
        name: form.name.trim(), description: form.description, bu: form.bu, country: form.country,
        fn: form.fn, pnlElement: form.pnlElement, lever: form.lever,
        team: form.team.split(',').map((s) => s.trim()).filter(Boolean),
        annualSavingsUsdK: Number(form.annualSavingsUsdK), probabilityPct: Number(form.probabilityPct),
        savingsStart: form.savingsStart, savingsEnd: form.savingsEnd || null,
        costToAchieve: { oneTimeUsdK: Number(form.oneTime), recurringUsdK: Number(form.recurring), notes: form.costNotes || null },
        milestones: form.milestones.filter((m) => m.name.trim()).map((m) => ({ name: m.name, owner: m.owner, due: m.due || null, pct: Number(m.pct) })),
        meetings: form.meetings.filter((m) => m.name.trim()).map((m) => ({ name: m.name, date: m.date || null, momAttachment: null })),
        needsNewSupplier: form.needsNewSupplier,
      });
      router.push(`/projects?open=${r.project.id}`);
    } catch (e) { setMsg(`✕ ${(e as Error).message}`); setBusy(false); }
  };

  const acc = (n: number, title: string, body: React.ReactNode) => (
    <div className={`acc ${open[n] ? 'open' : ''}`}>
      <button type="button" onClick={() => setOpen({ ...open, [n]: !open[n] })}>{n} · {title} <span>▾</span></button>
      <div className="bd">{body}</div>
    </div>
  );
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v } as never);

  return (
    <section className="pg on">
      <div className="eyebrow">Add new project — four sections, per the Eye on Fat tool</div>
      <h1>Add project</h1>
      <p className="sub">
        Mandatory fields marked <span style={{ color: 'var(--fat)' }}>*</span>. Save as an IDEA — no need to prove
        feasibility yet; Finance commits to Forecast later. If the project takes the Price or Specifications lever, or
        needs a new supplier, it qualifies to convert into a Procurement project and launch the Procura Crew from the
        project detail.
      </p>

      {acc(1, 'Project details', (
        <>
          <div className="f2">
            <div>
              <label className="fl">Project name <span className="req">*</span></label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Corrugate box weight optimisation" />
              <label className="fl">BU (Business Unit) <span className="req">*</span></label>
              <select value={form.bu} onChange={(e) => set('bu', e.target.value)}>{BUS.map((b) => <option key={b}>{b}</option>)}</select>
              <label className="fl">Country <span className="req">*</span></label>
              <select value={form.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
              <label className="fl">Function</label>
              <select value={form.fn} onChange={(e) => set('fn', e.target.value)}>{FUNCTIONS.map((c) => <option key={c}>{c}</option>)}</select>
            </div>
            <div>
              <label className="fl">P&amp;L element <span className="req">*</span></label>
              <select value={form.pnlElement} onChange={(e) => set('pnlElement', e.target.value)}>{PNL.map((c) => <option key={c}>{c}</option>)}</select>
              <label className="fl">Primary lever <span className="req">*</span></label>
              <select value={form.lever} onChange={(e) => set('lever', e.target.value)}>
                {LEVERS.map((l) => <option key={l} value={l}>{LEVER_LABEL[l]}</option>)}
              </select>
              <label className="fl">Requires a new supplier?</label>
              <select value={form.needsNewSupplier ? 'Yes' : 'No'} onChange={(e) => set('needsNewSupplier', e.target.value === 'Yes')}>
                <option>No</option><option>Yes</option>
              </select>
              <label className="fl">Project lead <span className="req">*</span></label>
              <input value={user?.name ?? ''} readOnly />
              <label className="fl">Team <span className="opt">optional</span></label>
              <input value={form.team} onChange={(e) => set('team', e.target.value)} placeholder="Comma-separated names" />
            </div>
          </div>
          {eligible && (
            <div className="eligib">
              ⇢ <b>Procura-eligible.</b> This lever / supplier need qualifies the project to convert into a Procurement
              project. After saving, open the project detail and press <b>Convert to Procurement project</b> — the Procura
              Crew (Researcher, RFP Architect, Bid Handler, Recommender) will start with your should-cost target pre-loaded.
            </div>
          )}
          <label className="fl">Description</label>
          <textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What is the idea, and why now?" />
        </>
      ))}

      {acc(2, 'Savings — time & probability adjusted', (
        <>
          <div className="f2">
            <div>
              <label className="fl">Total annual savings (000s, base $) <span className="req">*</span></label>
              <input type="number" value={form.annualSavingsUsdK} onChange={(e) => set('annualSavingsUsdK', e.target.value)} />
              <label className="fl">Probability % <span className="req">*</span></label>
              <input type="number" min={0} max={100} value={form.probabilityPct} onChange={(e) => set('probabilityPct', e.target.value)} />
              <label className="fl">Savings start date <span className="req">*</span></label>
              <input type="date" value={form.savingsStart} onChange={(e) => set('savingsStart', e.target.value)} />
            </div>
            <div>
              <label className="fl">Savings end date <span className="opt">blank = recurring</span></label>
              <input type="date" value={form.savingsEnd} onChange={(e) => set('savingsEnd', e.target.value)} />
              <label className="fl">Current-FY savings (auto)</label>
              <input readOnly value={`${fK(tp)} (T&P adjusted)`} />
              <label className="fl">Carry-forward to next FY (auto)</label>
              <input readOnly value={fK(cf)} />
            </div>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Time adjustment: months remaining in FY (Apr–Mar) from savings start ÷ 12 × annual × probability.
          </div>
        </>
      ))}

      {acc(3, 'Cost to achieve', (
        <>
          <div className="f2">
            <div><label className="fl">One-time cost (000s)</label>
              <input type="number" value={form.oneTime} onChange={(e) => set('oneTime', e.target.value)} /></div>
            <div><label className="fl">Recurring cost (000s / yr)</label>
              <input type="number" value={form.recurring} onChange={(e) => set('recurring', e.target.value)} /></div>
          </div>
          <label className="fl">Cost notes</label>
          <input value={form.costNotes} onChange={(e) => set('costNotes', e.target.value)} placeholder="Tooling, consulting, licence, severance…" />
        </>
      ))}

      {acc(4, 'Milestones & meetings', (
        <>
          <table className="mini">
            <thead><tr><th>Milestone</th><th>Owner</th><th>Due</th><th>%</th><th /></tr></thead>
            <tbody>
              {form.milestones.map((m, i) => (
                <tr key={i}>
                  <td><input value={m.name} onChange={(e) => { const ms = [...form.milestones]; ms[i] = { ...m, name: e.target.value }; set('milestones', ms); }} /></td>
                  <td><input value={m.owner} onChange={(e) => { const ms = [...form.milestones]; ms[i] = { ...m, owner: e.target.value }; set('milestones', ms); }} /></td>
                  <td><input type="date" value={m.due} onChange={(e) => { const ms = [...form.milestones]; ms[i] = { ...m, due: e.target.value }; set('milestones', ms); }} /></td>
                  <td><input type="number" style={{ width: 60 }} value={m.pct} onChange={(e) => { const ms = [...form.milestones]; ms[i] = { ...m, pct: Number(e.target.value) }; set('milestones', ms); }} /></td>
                  <td><button className="addrem rem" type="button" onClick={() => set('milestones', form.milestones.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="addrem add" type="button" onClick={() => set('milestones', [...form.milestones, { name: '', owner: '', due: '', pct: 0 }])}>＋ Add milestone</button>
          <table className="mini">
            <thead><tr><th>Meeting</th><th>Date</th><th>MoM attachment</th><th /></tr></thead>
            <tbody>
              {form.meetings.map((m, i) => (
                <tr key={i}>
                  <td><input value={m.name} onChange={(e) => { const ms = [...form.meetings]; ms[i] = { ...m, name: e.target.value }; set('meetings', ms); }} /></td>
                  <td><input type="date" value={m.date} onChange={(e) => { const ms = [...form.meetings]; ms[i] = { ...m, date: e.target.value }; set('meetings', ms); }} /></td>
                  <td><button className="btn sm" type="button">📎 Attach / 📷 Camera</button></td>
                  <td><button className="addrem rem" type="button" onClick={() => set('meetings', form.meetings.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="addrem add" type="button" onClick={() => set('meetings', [...form.meetings, { name: '', date: '' }])}>＋ Add meeting</button>
          <div className="finlock">🔒 <b>Forecast commitment is Finance-only.</b> Save as Pipeline now; your Finance Lead vets and commits to Forecast.</div>
        </>
      ))}

      {msg && <div className="err">{msg}</div>}
      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <button className="btn pri" type="button" disabled={busy} onClick={() => void save()}>
          {busy ? <span className="spin" /> : 'Save project → Pipeline'}
        </button>
        <button className="btn" type="button" onClick={() => router.push('/projects')}>Cancel</button>
      </div>
    </section>
  );
}
