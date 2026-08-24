/**
 * M3 — Spend Tree (CUBE + LENS). Colored-block treemap data, drill to
 * suppliers and invoice lines with lineage, → Opportunity pre-fill (AC F3.3).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { route } from '../lib/route.js';
import { db, type AppCtx } from '../lib/ctx.js';
import { mapNode } from '../lib/mappers.js';
import { notFound } from '../lib/http-error.js';

export function treeRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/tree', summary: 'Spend tree — category nodes (Volume × Price split)', tags: ['tree'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `SELECT * FROM spend_nodes WHERE level='category' ORDER BY amount_usd_k DESC`);
      return { nodes: r.rows.map(mapNode) };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/tree/:nodeId/children', summary: 'Drill: suppliers under a category (or invoices under a supplier)', tags: ['tree'],
    params: z.object({ nodeId: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const parent = await c.query(`SELECT * FROM spend_nodes WHERE id=$1`, [params.nodeId]);
      if (!parent.rows.length) throw notFound('Node not found');
      const children = await c.query(
        `SELECT * FROM spend_nodes WHERE parent_id=$1 ORDER BY amount_usd_k DESC`, [params.nodeId]);
      return { parent: mapNode(parent.rows[0]), children: children.rows.map(mapNode) };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/tree/supplier/:name/lines', summary: 'Invoice lines with document lineage for a supplier', tags: ['tree'],
    params: z.object({ name: z.string() }),
    querystring: z.object({ limit: z.coerce.number().min(1).max(500).default(50) }),
    handler: async ({ principal, params, query }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `SELECT id, source, supplier, category, bu, country, invoice_ref, date, volume, unit_price, amount_usd, currency, lineage
         FROM spend_records WHERE supplier=$1 AND deleted_at IS NULL ORDER BY date DESC LIMIT $2`,
        [decodeURIComponent(params.name), query.limit]);
      return {
        lines: r.rows.map((x) => ({
          id: x.id, source: x.source, supplier: x.supplier, category: x.category,
          bu: x.bu, country: x.country, invoiceRef: x.invoice_ref,
          date: x.date instanceof Date ? x.date.toISOString().slice(0, 10) : x.date,
          volume: x.volume == null ? null : Number(x.volume),
          unitPrice: x.unit_price == null ? null : Number(x.unit_price),
          amountUsd: Number(x.amount_usd), currency: x.currency, lineage: x.lineage,
        })),
      };
    }),
  });

  /** → Opportunity: pre-fill an Idea from a flagged node (AC F3.3). */
  route(app, {
    method: 'GET', url: '/api/tree/:nodeId/opportunity-prefill', summary: 'Pre-fill an Idea from a node with dims + evidence attached', tags: ['tree'],
    params: z.object({ nodeId: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const node = await c.query(`SELECT * FROM spend_nodes WHERE id=$1`, [params.nodeId]);
      if (!node.rows.length) throw notFound('Node not found');
      const n = node.rows[0];
      const parent = n.parent_id ? (await c.query(`SELECT name FROM spend_nodes WHERE id=$1`, [n.parent_id])).rows[0] : null;
      const sample = await c.query(
        `SELECT bu, country FROM spend_records WHERE supplier=$1 AND deleted_at IS NULL LIMIT 1`, [n.name]);
      return {
        prefill: {
          name: `${n.name} — ${((n.lens_flags ?? [])[0]?.label as string) ?? 'opportunity'}`,
          bu: sample.rows[0]?.bu ?? 'Corporate',
          country: sample.rows[0]?.country ?? 'UAE',
          pnlElement: parent?.name ?? n.name,
          lever: 'Price',
          annualSavingsUsdK: Math.round(Number(n.amount_usd_k) * 0.08),
          probabilityPct: 60,
          description: `LENS evidence: ${n.insight ?? 'flagged opportunity'} · node ${n.name} at $${Number(n.amount_usd_k).toFixed(0)}k/yr (volume ${n.volume_share}% × price ${n.price_share}%).`,
          evidence: { nodeId: n.id, lensFlags: n.lens_flags, insight: n.insight },
        },
      };
    }),
  });
}
