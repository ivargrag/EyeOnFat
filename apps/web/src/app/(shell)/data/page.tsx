'use client';
import { useRef, useState } from 'react';
import { api } from '@eof/api-client';
import { useApi } from '@/lib/store';
import { Chip, GateBar } from '@/components/bits';

interface ConnData {
  connectors: Array<{ id: string; key: string; name: string; status: string; statusLine: string; detail: string }>;
  intake: Array<{ id: string; name: string; rows: number; status: string; mappedPct: number }>;
  completenessPct: number;
  completenessTargetPct: number;
}

export default function DataPage() {
  const { data, error, loading, reload } = useApi<ConnData>('/connectors');
  const [open, setOpen] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setUploadMsg('Uploading & classifying (SCALE)…');
    try {
      const r = await api.uploadSpendFile(file);
      setUploadMsg(`✓ ${file.name}: ${r.inserted.toLocaleString()} rows ingested, ${r.deduped} deduped, ${r.classifiedPct}% auto-classified`);
      reload();
    } catch (e) { setUploadMsg(`✕ ${(e as Error).message}`); }
  };

  if (loading) return <div><span className="spin" /> Loading connectors…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 00 · Intake &amp; weigh-in — agent SCALE</div>
      <h1>Connectors &amp; data</h1>
      <p className="sub">
        Connect the SME stack; SCALE ingests, deduplicates, classifies to a common taxonomy and reconciles
        to the trial balance. Gate G0: the CFO signs off scope &amp; completeness. Click a connector for sync &amp; mapping detail.
      </p>
      <div className="conn-grid">
        {data.connectors.map((c) => (
          <div key={c.id} className={`conn ${open === c.id ? 'open' : ''}`} tabIndex={0}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(open === c.id ? null : c.id); }}>
            <div className="nm">{c.name}</div>
            <div className="st"><Chip tone={c.status as never}>{c.statusLine}</Chip></div>
            <div className="det">{c.detail}<br /><button className="btn sm" style={{ marginTop: 7 }} type="button">Open field mapping</button></div>
          </div>
        ))}
      </div>
      <div className="dropzone" tabIndex={0} role="button"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
        ⬆ Drop or click to upload — CSV GL/AP extracts (XLSX: export as CSV · scanned invoices arrive via the e-mail OCR drop)
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      {uploadMsg && <div className={uploadMsg.startsWith('✕') ? 'err' : 'okmsg'}>{uploadMsg}</div>}
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Intake queue</h2>
        <table className="tb">
          <thead><tr><th>File / feed</th><th>Rows</th><th>Status</th><th>Mapped to taxonomy</th></tr></thead>
          <tbody>
            {data.intake.map((f) => (
              <tr key={f.id}>
                <td>{f.name}</td><td>{f.rows.toLocaleString()}</td>
                <td><Chip tone="ok">{f.status}</Chip></td><td>{f.mappedPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 style={{ marginTop: 14 }}>Cost losing its anonymity — completeness</h3>
        <div className="meter"><i style={{ width: `${data.completenessPct}%` }} /></div>
        <div className="hint" style={{ marginTop: 5 }}>
          {data.completenessPct}% of P&amp;L spend classified to supplier × category × invoice line · target ≥ {data.completenessTargetPct}% before G0 sign-off
        </div>
      </div>
      <GateBar title="Gate G0 — Scope & completeness">
        The owner/CFO confirms the spend base is complete and correctly classified before any analysis begins. No analysis on data nobody trusts.
      </GateBar>
    </section>
  );
}
