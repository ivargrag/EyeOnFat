'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@eof/api-client';
import { useApi, useCurrency } from '@/lib/store';
import { GateBar } from '@/components/bits';

interface Node {
  id: string; name: string; amountUsdK: number; volumeShare: number; priceShare: number;
  lensFlags: Array<{ label: string; severity: string }>; insight: string | null; recordCount: number;
}
interface Line {
  id: string; invoiceRef: string | null; date: string; volume: number | null;
  unitPrice: number | null; amountUsd: number; lineage: { documentId: string | null } | null; source: string;
}

export default function TreePage() {
  const { data, error, loading } = useApi<{ nodes: Node[] }>('/tree');
  const { fK, fU } = useCurrency();
  const router = useRouter();
  const [drill, setDrill] = useState<{ parent: Node; children: Node[] } | null>(null);
  const [lines, setLines] = useState<{ supplier: string; lines: Line[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.nodes.length && !drill) void openDrill(data.nodes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const openDrill = async (node: Node) => {
    setBusy(true); setLines(null);
    try {
      const r = await api.get<{ parent: Node; children: Node[] }>(`/tree/${node.id}/children`);
      setDrill(r);
    } finally { setBusy(false); }
  };

  const openLines = async (supplier: string) => {
    const r = await api.get<{ lines: Line[] }>(`/tree/supplier/${encodeURIComponent(supplier)}/lines`, { limit: 12 });
    setLines({ supplier, lines: r.lines });
  };

  const toOpportunity = async (node: Node) => {
    const r = await api.get<{ prefill: Record<string, unknown> }>(`/tree/${node.id}/opportunity-prefill`);
    sessionStorage.setItem('eof-prefill', JSON.stringify(r.prefill));
    router.push('/projects/add');
  };

  if (loading) return <div><span className="spin" /> Building the cube…</div>;
  if (error) return <div className="err">{error}</div>;
  if (!data) return null;

  const max = Math.max(...data.nodes.map((n) => n.amountUsdK), 1);

  return (
    <section className="pg on">
      <div className="eyebrow">Stage 01 · Agents CUBE + LENS</div>
      <h1>Spend tree — Volume × Price</h1>
      <p className="sub">
        The entire spend of the company as a cube, every block split Volume × Price. Block size ∝ annual spend.
        Click a block to drill into suppliers; click a supplier for invoice-line lineage. LENS flags anomalies and ranks opportunity.
      </p>
      <div className="tmap">
        {data.nodes.map((n) => (
          <div key={n.id} className="tnode" tabIndex={0}
            style={{ width: Math.round(130 + (n.amountUsdK / max) * 230) }}
            onClick={() => void openDrill(n)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void openDrill(n); } }}>
            {n.lensFlags.length > 0 && <span className="tflag">⚑</span>}
            <div className="nm">{n.name}</div>
            <div className="amt">{fK(n.amountUsdK)} / yr</div>
            <div className="vp">
              <i style={{ width: `${n.volumeShare}%`, background: 'var(--steel)' }} />
              <i style={{ width: `${n.priceShare}%`, background: 'var(--fat)' }} />
            </div>
            <div className="hint" style={{ marginTop: 4 }}>Vol {Math.round(n.volumeShare)}% × Price {Math.round(n.priceShare)}%</div>
          </div>
        ))}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: 'var(--steel)' }} />Volume share</span>
        <span><i style={{ background: 'var(--fat)' }} />Price share</span>
        <span>⚑ = LENS opportunity flag</span>
      </div>
      {drill && (
        <div className="drillcard card">
          <h2>{drill.parent.name} — supplier drill-down {busy && <span className="spin" />}</h2>
          <table className="tb">
            <thead><tr><th>Supplier</th><th style={{ textAlign: 'right' }}>Spend / yr</th><th>LENS insight</th><th /></tr></thead>
            <tbody>
              {drill.children.map((s) => (
                <tr key={s.id}>
                  <td><a href="#" onClick={(e) => { e.preventDefault(); void openLines(s.name); }}>{s.name}</a></td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fK(s.amountUsdK)}</td>
                  <td className="hint">{s.insight || '—'}</td>
                  <td>{s.lensFlags.length > 0 && (
                    <button className="btn sm" type="button" onClick={() => void toOpportunity(s)}>→ Opportunity</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {lines && (
            <div style={{ marginTop: 12 }}>
              <h3>{lines.supplier} — invoice lines (document lineage)</h3>
              <table className="mini">
                <thead><tr><th>Invoice</th><th>Date</th><th>Volume</th><th>Unit price</th><th>Amount</th><th>Lineage</th></tr></thead>
                <tbody>
                  {lines.lines.map((l) => (
                    <tr key={l.id}>
                      <td>{l.invoiceRef ?? '—'}</td><td>{l.date}</td>
                      <td>{l.volume?.toLocaleString() ?? '—'}</td>
                      <td>{l.unitPrice != null ? fU(l.unitPrice) : '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{fU(l.amountUsd)}</td>
                      <td className="hint">{l.lineage?.documentId ?? l.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>
            Click a supplier name for invoice-level lines with document lineage back to source.
          </div>
        </div>
      )}
      <GateBar title="Gate G1 — Opportunity shortlist">
        Leadership approves the LENS-ranked shortlist (spend × volatility × savings potential) that proceeds to Should-Cost.
      </GateBar>
    </section>
  );
}
