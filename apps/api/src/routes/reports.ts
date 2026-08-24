/**
 * M9 — Dashboard, reports, Excel export, SteerCo pack.
 * All figures are base-USD (000s); conversion is client-side at render.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { monthsRemainingInFy } from '@eof/domain';
import { route } from '../lib/route.js';
import { db, type AppCtx } from '../lib/ctx.js';
import { mapProject } from '../lib/mappers.js';
import { completeness } from '../services/ingest.js';

const FY_MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

interface Row {
  stage: string; bu: string; country: string; pnl_element: string;
  tp_adjusted_usd_k: string; annual_savings_usd_k: string; savings_start: Date | string;
}

/** Cumulative monthly phasing: each project ramps in from its savings-start month. */
function monthlyPhasing(rows: Row[]): Array<{ month: string; pipeline: number; forecast: number; committed: number }> {
  const out = FY_MONTHS.map((m) => ({ month: m, pipeline: 0, forecast: 0, committed: 0 }));
  for (const r of rows) {
    const startIso = r.savings_start instanceof Date ? r.savings_start.toISOString().slice(0, 10) : String(r.savings_start).slice(0, 10);
    const rem = monthsRemainingInFy(startIso); // months active within FY
    const startIdx = 12 - rem;
    const monthly = Number(r.tp_adjusted_usd_k) / Math.max(1, rem);
    const key = r.stage === 'Committed' ? 'committed' : r.stage === 'Forecast' ? 'forecast' : 'pipeline';
    let cum = 0;
    for (let i = 0; i < 12; i++) {
      if (i >= startIdx) cum += monthly;
      const bucket = out[i] as unknown as Record<string, number>;
      bucket[key] = Number(bucket[key]) + cum;
    }
  }
  return out.map((m) => ({
    month: m.month,
    pipeline: Math.round(m.pipeline), forecast: Math.round(m.forecast), committed: Math.round(m.committed),
  }));
}

export function reportRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/dashboard', summary: 'KPI row, monthly bars, needs-attention, Procura panel', tags: ['reports'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const rows = (await c.query(`SELECT * FROM projects WHERE deleted_at IS NULL`)).rows;
      const sum = (stage: string) => rows.filter((r) => r.stage === stage).reduce((a, r) => a + Number(r.annual_savings_usd_k), 0);
      const totalSpend = (await c.query(`SELECT coalesce(sum(amount_usd_k),0) AS s FROM spend_nodes WHERE level='category'`)).rows[0].s;
      // Addressed spend = spend in categories a live project is working (by P&L element).
      const pnls = [...new Set(rows.map((r) => r.pnl_element))];
      const addressedSpend = pnls.length
        ? Number((await c.query(
            `SELECT coalesce(sum(amount_usd_k),0) AS s FROM spend_nodes WHERE level='category' AND name = ANY($1)`,
            [pnls])).rows[0].s)
        : 0;
      const pct = await completeness(c);
      const openGates = (await c.query(`SELECT * FROM gates WHERE status='open' ORDER BY created_at DESC LIMIT 12`)).rows;
      const procura = (await c.query(
        `SELECT pe.id, pe.stage, p.id AS project_id, p.name FROM procura_events pe JOIN projects p ON p.id=pe.project_ref
         WHERE pe.stage <> 'complete' ORDER BY pe.created_at DESC`)).rows;

      const attention: Array<{ label: string; kind: string }> = [];
      for (const pe of procura) {
        attention.push({ label: `${pe.name} — Procura event at ${pe.stage.replace(/_/g, ' ')}`, kind: 'procura' });
      }
      if (pct < 95) attention.push({ label: `G0 completeness at ${pct}% — unmapped feeds below the 95% target`, kind: 'action' });
      for (const g of openGates.slice(0, 4)) {
        attention.push({ label: `Gate ${g.gate_id} open (${g.object_type})${(g.signatures ?? []).length ? ` — ${(g.signatures).length}/${g.required_distinct} signatures` : ''}`, kind: 'watch' });
      }

      return {
        kpis: {
          pipelineUsdK: sum('Pipeline'), forecastUsdK: sum('Forecast'), committedUsdK: sum('Committed'),
          activeProjects: rows.length,
          procuraEvents: rows.filter((r) => r.procura_event_id).length,
          addressedSpendPct: Number(totalSpend) > 0 ? Math.round((addressedSpend / Number(totalSpend)) * 100) : 0,
        },
        monthly: monthlyPhasing(rows as never),
        attention: attention.slice(0, 8),
        procuraProjects: procura.map((pe) => ({ eventId: pe.id, projectId: pe.project_id, name: pe.name, stage: pe.stage })),
        completenessPct: pct,
      };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/reports/summary', summary: 'Savings by BU / Country / P&L element + monthly phasing', tags: ['reports'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const rows = (await c.query(`SELECT * FROM projects WHERE deleted_at IS NULL`)).rows;
      const by = (key: (r: Record<string, never>) => string) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(key(r as never), (m.get(key(r as never)) ?? 0) + Number((r as Record<string, never>).annual_savings_usd_k));
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, usdK]) => ({ name, usdK }));
      };
      const pnl = new Map<string, { pipeline: number; forecast: number; committed: number }>();
      for (const r of rows) {
        const e = pnl.get(r.pnl_element) ?? { pipeline: 0, forecast: 0, committed: 0 };
        const k = r.stage === 'Committed' ? 'committed' : r.stage === 'Forecast' ? 'forecast' : 'pipeline';
        e[k as 'pipeline'] += Number(r.annual_savings_usd_k);
        pnl.set(r.pnl_element, e);
      }
      return {
        byBu: by((r) => r['bu']), byCountry: by((r) => r['country']),
        byPnl: [...pnl.entries()].map(([name, v]) => ({ name, ...v, total: v.pipeline + v.forecast + v.committed })),
        monthly: monthlyPhasing(rows as never),
      };
    }),
  });

  // Excel export (F7.1/F9.2) — real .xlsx via exceljs.
  app.get('/api/reports/projects.xlsx', async (req, reply) => {
    const principal = req.principal;
    if (!principal) return reply.status(401).send({ error: 'Unauthorized' });
    const rows = await db(ctx, principal, async (c) =>
      (await c.query(`SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at`)).rows);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Projects');
    ws.columns = [
      { header: 'Project', key: 'name', width: 44 }, { header: 'BU', key: 'bu', width: 14 },
      { header: 'Country', key: 'country', width: 10 }, { header: 'P&L element', key: 'pnl', width: 20 },
      { header: 'Lever', key: 'lever', width: 16 }, { header: 'Lead', key: 'lead', width: 16 },
      { header: 'Stage', key: 'stage', width: 12 }, { header: 'Annual (000s USD)', key: 'annual', width: 18 },
      { header: 'Probability %', key: 'prob', width: 14 }, { header: 'T&P adj (000s USD)', key: 'tp', width: 18 },
      { header: 'Carry-forward (000s USD)', key: 'cf', width: 22 }, { header: 'Savings start', key: 'start', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        name: r.name, bu: r.bu, country: r.country, pnl: r.pnl_element, lever: r.lever,
        lead: r.lead_name, stage: r.stage, annual: Number(r.annual_savings_usd_k),
        prob: Number(r.probability_pct), tp: Number(r.tp_adjusted_usd_k), cf: Number(r.carry_forward_usd_k),
        start: String(r.savings_start).slice(0, 10),
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', 'attachment; filename="eyeonfat-projects.xlsx"');
    return reply.send(Buffer.from(buf as ArrayBuffer));
  });

  /** SteerCo pack — print-ready HTML (render to PDF via browser print / CI). */
  app.get('/api/reports/steerco-pack', async (req, reply) => {
    const principal = req.principal;
    if (!principal) return reply.status(401).send({ error: 'Unauthorized' });
    const data = await db(ctx, principal, async (c) => {
      const rows = (await c.query(`SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY annual_savings_usd_k DESC`)).rows;
      return rows.map(mapProject);
    });
    const sum = (s: string) => data.filter((p) => p.stage === s).reduce((a, p) => a + p.annualSavingsUsdK, 0);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>SteerCo pack — Eye on Fat</title>
<style>body{font-family:Georgia,serif;margin:40px;color:#16211E}h1{border-bottom:3px solid #FFC526;padding-bottom:8px}
table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
th{background:#F4F6F1}@media print{button{display:none}}</style></head><body>
<h1>Eye on Fat — SteerCo pack</h1>
<p>Pipeline $${sum('Pipeline')}k · Forecast $${sum('Forecast')}k · Committed $${sum('Committed')}k · ${data.length} projects · generated ${new Date().toISOString().slice(0, 10)}</p>
<table><tr><th>Project</th><th>BU</th><th>Lever</th><th>Stage</th><th>Annual (000s)</th><th>T&amp;P adj</th></tr>
${data.map((p) => `<tr><td>${p.name}</td><td>${p.bu}</td><td>${p.lever}</td><td>${p.stage}</td><td>${p.annualSavingsUsdK}</td><td>${p.timeProbabilityAdjustedUsdK}</td></tr>`).join('')}
</table><script>window.print&&setTimeout(()=>window.print(),300)</script></body></html>`;
    reply.header('content-type', 'text/html');
    return reply.send(html);
  });

  route(app, {
    method: 'GET', url: '/api/fx/rates', summary: 'Latest daily FX table (base USD, as-of stamped)', tags: ['fx'], access: 'public',
    handler: async () => {
      const { latestRates } = await import('../services/fx.js');
      return latestRates(ctx);
    },
  });
}
