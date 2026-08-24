/**
 * M2 — Connectors & data intake (Stage 00, SCALE). Connector inventory with
 * sync detail, file upload → ingest pipeline, completeness meter, G0 gate.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { route } from '../lib/route.js';
import { db, type AppCtx } from '../lib/ctx.js';
import { badRequest } from '../lib/http-error.js';
import { completeness, ingestCsv } from '../services/ingest.js';
import { ensureGate, findGate } from '../services/gates.js';
import { mapGate } from '../lib/mappers.js';

export function connectorRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/connectors', summary: 'Connector inventory + intake queue + G0 completeness', tags: ['connectors'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const conns = await c.query(`SELECT * FROM connectors ORDER BY name`);
      const intake = await c.query(`SELECT * FROM intake_files ORDER BY created_at DESC LIMIT 25`);
      const pct = await completeness(c);
      const tenant = await c.query(`SELECT settings FROM tenants WHERE id=$1`, [principal!.tenantId]);
      const target = Number(tenant.rows[0]?.settings?.g0CompletenessTargetPct ?? 95);
      let g0 = await findGate(c, 'G0', principal!.tenantId);
      if (!g0) g0 = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G0', objectType: 'spend_base', objectRef: principal!.tenantId });
      return {
        connectors: conns.rows.map((x) => ({
          id: x.id, key: x.key, name: x.name, status: x.status, statusLine: x.status_line,
          detail: x.detail, lastSync: x.last_sync,
        })),
        intake: intake.rows.map((x) => ({
          id: x.id, name: x.name, rows: x.rows, status: x.status, mappedPct: Number(x.mapped_pct), createdAt: x.created_at,
        })),
        completenessPct: pct, completenessTargetPct: target,
        g0: mapGate(g0),
      };
    }),
  });

  // Multipart CSV upload — SCALE ingest (AC F2.2: dedupe + classify + lineage).
  app.post('/api/connectors/upload', async (req, reply) => {
    const principal = req.principal;
    if (!principal) return reply.status(401).send({ error: 'Unauthorized' });
    const file = await (req as unknown as { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!file) return reply.status(400).send({ error: 'No file uploaded', code: 'NO_FILE' });
    const content = await file.toBuffer();
    if (!/\.(csv|txt)$/i.test(file.filename)) {
      return reply.status(400).send({ error: 'v1 upload accepts CSV (XLSX: export as CSV; PDF scans arrive via the e-mail OCR drop).', code: 'FORMAT' });
    }
    try {
      const result = await db(ctx, principal, (c) => ingestCsv(c, {
        tenantId: principal.tenantId, actorId: principal.userId, actorName: principal.name,
        filename: file.filename, content,
      }));
      return reply.send(result);
    } catch (e) {
      const err = e as Error & { statusCode?: number };
      return reply.status(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  route(app, {
    method: 'POST', url: '/api/connectors/:key/sync', summary: 'Trigger a connector sync (stub adapters in v1 mark last_sync)', tags: ['connectors'],
    access: ['admin', 'owner'],
    params: z.object({ key: z.string() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(
        `UPDATE connectors SET last_sync=now(), status='ok', status_line='Synced just now' WHERE key=$1 RETURNING *`,
        [params.key]);
      if (!r.rows.length) throw badRequest('Unknown connector');
      return { ok: true, lastSync: r.rows[0].last_sync };
    }),
  });
}
