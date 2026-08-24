/**
 * Stage 00 ingest (SCALE) — CSV/XLSX-as-CSV upload → SpendRecords with
 * lineage, deterministic taxonomy classification, dedupe, and Spend Tree
 * re-materialisation. Live-model classification refinement can be layered on
 * via the gateway; the deterministic mapper keeps the 150k-row AC fast.
 */
import { parse } from 'csv-parse/sync';
import type { PoolClient } from '@eof/db';
import { audit } from '../lib/ctx.js';
import { badRequest } from '../lib/http-error.js';

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ['Raw materials', ['resin', 'polymer', 'steel', 'chemical', 'raw material', 'aluminium', 'timber']],
  ['Packaging', ['bag', 'carton', 'corrugate', 'packag', 'box', 'void-fill', 'label']],
  ['Logistics & freight', ['freight', 'carrier', 'shipping', 'logistics', 'line-haul', 'transport', 'courier']],
  ['Rent & utilities', ['rent', 'lease', 'electric', 'water', 'utility', 'dewa', 'sewa', 'tariff']],
  ['Marketing', ['media', 'marketing', 'agency', 'campaign', 'advert', 'sponsor']],
  ['IT & telecom', ['saas', 'licence', 'license', 'software', 'telecom', 'cloud', 'subscription', 'etisalat']],
  ['Travel & admin', ['travel', 'hotel', 'airfare', 'office suppl', 'stationery', 'admin']],
  ['Manpower services', ['staff', 'manpower', 'outsourc', 'labour', 'labor', 'merchandis', 'security service', 'cleaning']],
];

export function classify(description: string, supplier: string): string {
  const hay = `${description} ${supplier}`.toLowerCase();
  for (const [cat, kws] of CATEGORY_KEYWORDS) {
    if (kws.some((k) => hay.includes(k))) return cat;
  }
  return 'Unclassified';
}

export interface IngestResult {
  fileId: string;
  rows: number;
  inserted: number;
  deduped: number;
  classifiedPct: number;
}

export async function ingestCsv(
  c: PoolClient,
  args: { tenantId: string; actorId: string; actorName: string; filename: string; content: Buffer },
): Promise<IngestResult> {
  let records: Array<Record<string, string>>;
  try {
    records = parse(args.content, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  } catch (e) {
    throw badRequest(`Could not parse CSV: ${(e as Error).message}`, 'PARSE_ERROR');
  }
  if (!records.length) throw badRequest('File contains no data rows', 'EMPTY_FILE');

  const fileRow = await c.query(
    `INSERT INTO intake_files (tenant_id, name, rows, status, mapped_pct) VALUES ($1,$2,$3,'parsing',0) RETURNING id`,
    [args.tenantId, args.filename, records.length]);
  const fileId = fileRow.rows[0].id as string;

  const col = (r: Record<string, string>, ...names: string[]) => {
    for (const n of names) {
      const k = Object.keys(r).find((key) => key.toLowerCase().replace(/[_\s]/g, '') === n);
      if (k && r[k] !== '') return r[k];
    }
    return '';
  };

  const seen = new Set<string>();
  let inserted = 0, deduped = 0, classified = 0;
  const BATCH = 500;
  let batch: unknown[][] = [];

  const flush = async () => {
    if (!batch.length) return;
    const values: string[] = [];
    const params: unknown[] = [];
    batch.forEach((row, i) => {
      const base = i * 12;
      values.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12})`);
      params.push(...row);
    });
    await c.query(
      `INSERT INTO spend_records (tenant_id, source, supplier, category, bu, country, invoice_ref, date, volume, unit_price, amount_usd, lineage)
       VALUES ${values.join(',')}`, params);
    batch = [];
  };

  for (const r of records) {
    const supplier = col(r, 'supplier', 'vendor', 'payee') || 'Unknown supplier';
    const desc = col(r, 'description', 'memo', 'narrative', 'item');
    const amount = Number(col(r, 'amount', 'amountusd', 'value', 'total') || 0);
    const invoiceRef = col(r, 'invoiceref', 'invoice', 'ref', 'docno') || null;
    const date = col(r, 'date', 'postingdate', 'invoicedate') || new Date().toISOString().slice(0, 10);
    const key = `${supplier}|${invoiceRef}|${amount}|${date}`;
    if (invoiceRef && seen.has(key)) { deduped += 1; continue; }
    seen.add(key);

    const category = classify(desc, supplier);
    if (category !== 'Unclassified') classified += 1;
    const volume = Number(col(r, 'volume', 'qty', 'quantity') || 0) || null;
    const unitPrice = volume && amount ? Math.round((amount / volume) * 1e6) / 1e6 : null;

    batch.push([
      args.tenantId, args.filename, supplier, `{"${category.replace(/"/g, '')}","${supplier.replace(/"/g, '')}"}`,
      col(r, 'bu', 'businessunit') || 'Corporate', col(r, 'country') || 'UAE',
      invoiceRef, date, volume, unitPrice, amount,
      JSON.stringify({ documentId: `${args.filename}#row`, page: null }),
    ]);
    inserted += 1;
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  const classifiedPct = Math.round((classified / Math.max(1, inserted)) * 100);
  await c.query(`UPDATE intake_files SET status='classified', mapped_pct=$2 WHERE id=$1`, [fileId, classifiedPct]);
  await audit(c, {
    tenantId: args.tenantId, actorId: args.actorId, actorName: args.actorName,
    action: 'spend.ingest', objectType: 'spend_base', objectRef: fileId,
    payload: { filename: args.filename, rows: records.length, inserted, deduped, classifiedPct },
  });

  await rematerialiseTree(c, args.tenantId);
  return { fileId, rows: records.length, inserted, deduped, classifiedPct };
}

/** Rebuild category/supplier aggregates from spend_records (CUBE). */
export async function rematerialiseTree(c: PoolClient, tenantId: string): Promise<void> {
  // Preserve curated driver splits & LENS flags for existing nodes; refresh amounts, add new nodes.
  const agg = await c.query(
    `SELECT category[1] AS cat, supplier, sum(amount_usd)/1000.0 AS amt_k, count(*) AS n
     FROM spend_records WHERE deleted_at IS NULL AND category[1] IS NOT NULL
     GROUP BY category[1], supplier`);
  const byCat = new Map<string, { amtK: number; n: number; suppliers: Array<{ supplier: string; amtK: number; n: number }> }>();
  for (const row of agg.rows) {
    const cat = byCat.get(row.cat) ?? { amtK: 0, n: 0, suppliers: [] };
    cat.amtK += Number(row.amt_k); cat.n += Number(row.n);
    cat.suppliers.push({ supplier: row.supplier, amtK: Number(row.amt_k), n: Number(row.n) });
    byCat.set(row.cat, cat);
  }
  for (const [cat, data] of byCat) {
    const existing = await c.query(
      `SELECT id FROM spend_nodes WHERE level='category' AND name=$1`, [cat]);
    let catId: string;
    if (existing.rows.length) {
      catId = existing.rows[0].id;
      await c.query(`UPDATE spend_nodes SET amount_usd_k=$2, record_count=$3 WHERE id=$1`,
        [catId, Math.round(data.amtK * 10) / 10, data.n]);
    } else {
      const r = await c.query(
        `INSERT INTO spend_nodes (tenant_id, parent_id, level, name, amount_usd_k, volume_share, price_share, record_count)
         VALUES ($1,NULL,'category',$2,$3,50,50,$4) RETURNING id`,
        [tenantId, cat, Math.round(data.amtK * 10) / 10, data.n]);
      catId = r.rows[0].id;
    }
    for (const s of data.suppliers) {
      const es = await c.query(
        `SELECT id FROM spend_nodes WHERE level='supplier' AND parent_id=$1 AND name=$2`, [catId, s.supplier]);
      if (es.rows.length) {
        await c.query(`UPDATE spend_nodes SET amount_usd_k=$2, record_count=$3 WHERE id=$1`,
          [es.rows[0].id, Math.round(s.amtK * 10) / 10, s.n]);
      } else {
        await c.query(
          `INSERT INTO spend_nodes (tenant_id, parent_id, level, name, amount_usd_k, volume_share, price_share, record_count)
           VALUES ($1,$2,'supplier',$3,$4,50,50,$5)`,
          [tenantId, catId, s.supplier, Math.round(s.amtK * 10) / 10, s.n]);
      }
    }
  }
}

/** G0 completeness: % of spend classified below 'Unclassified'. */
export async function completeness(c: PoolClient): Promise<number> {
  const r = await c.query(
    `SELECT coalesce(sum(amount_usd) FILTER (WHERE category[1] IS DISTINCT FROM 'Unclassified'),0) AS classified,
            coalesce(sum(amount_usd),0) AS total
     FROM spend_records WHERE deleted_at IS NULL`);
  const { classified, total } = r.rows[0];
  if (Number(total) === 0) return 0;
  return Math.round((Number(classified) / Number(total)) * 1000) / 10;
}
