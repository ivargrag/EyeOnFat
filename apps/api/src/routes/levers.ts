/**
 * M6 — Seven Levers & Sourcing (LEVER agent). Cards with tool lists, linked
 * projects and per-lever totals; sizing calculator; Procura hand-off metadata.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LEVERS, LEVER_LABELS, LeverSchema } from '@eof/domain';
import { runAgentStep } from '@eof/agents';
import { route } from '../lib/route.js';
import { db, type AppCtx } from '../lib/ctx.js';
import { mapProject } from '../lib/mappers.js';

const LEVER_META: Record<string, { group: 'mult' | 'add'; blurb: string; tools: string[] }> = {
  Price: {
    group: 'mult',
    blurb: 'Pay the right price for what you already buy. Transparency beats negotiation theatre. Stalled negotiations convert into a Procura event from within the project.',
    tools: ['Tender / auction', 'Should-cost analysis (SCOPE→SENTINEL)', 'Volume & bundle deals', 'Alternate vendor development', 'Index-linked pricing'],
  },
  Specifications: {
    group: 'mult',
    blurb: 'Buy fit-for-purpose, not gold-plated. Design and material re-engineering is where 10–20% often hides. Spec-change resourcing can convert into a Procura event.',
    tools: ['Standardise variants', 'Fit-for-purpose review', 'Innovate with supplier / upstream', 'Design optimisation', 'Material substitution'],
  },
  Demand: {
    group: 'mult',
    blurb: 'Consume less of it. Volume is a choice, not a given — the zero-based question lives here.',
    tools: ['Demand policies & budgets', 'Reduce / reuse consumption', 'Inventory reduction & JIT', 'Collaborate with business owners'],
  },
  Eliminate: {
    group: 'add',
    blurb: 'The cheapest spend is the one that stops. ZBC challenges every line to justify its existence.',
    tools: ['Zero-based challenge', 'Stop / sunset list', 'Policy elimination', 'Duplicate-service removal'],
  },
  Automate: {
    group: 'add',
    blurb: 'Take the manual touch out — digitise the workflow and redeploy the effort.',
    tools: ['OCR & workflow automation', 'Self-service portals', 'RPA on repetitive steps', 'E-invoicing'],
  },
  Consolidate: {
    group: 'add',
    blurb: 'Fewer, deeper supplier relationships; bundle demand across BUs & geographies — without breaching the fair-margin floor.',
    tools: ['Vendor consolidation', 'Cross-BU demand bundling', 'Framework agreements', 'Catalogue rationalisation'],
  },
  RightSource: {
    group: 'add',
    blurb: 'The right supplier, geography and contract model. Hands off to the Procura Crew end-to-end — you keep the award decision.',
    tools: ['Procura sourcing event', 'Make vs buy', 'Local ↔ regional ↔ global', 'Contract-model redesign'],
  },
};

export function leverRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/levers', summary: 'Seven lever cards with linked projects & totals', tags: ['levers'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const rows = (await c.query(`SELECT * FROM projects WHERE deleted_at IS NULL`)).rows;
      return {
        levers: LEVERS.map((lv, i) => {
          const linked = rows.filter((p) => p.lever === lv);
          return {
            key: lv, label: LEVER_LABELS[lv], index: i + 1,
            group: LEVER_META[lv].group,
            groupLabel: LEVER_META[lv].group === 'mult' ? 'Multiplicative · what the cost is' : 'Additive · how you operate',
            blurb: LEVER_META[lv].blurb, tools: LEVER_META[lv].tools,
            projectCount: linked.length,
            totalUsdK: linked.reduce((a, p) => a + Number(p.annual_savings_usd_k), 0),
            projects: linked.map((p) => ({
              id: p.id, name: p.name, annualSavingsUsdK: Number(p.annual_savings_usd_k),
              procura: Boolean(p.procura_event_id),
            })),
          };
        }),
      };
    }),
  });

  /** LEVER agent: size an idea + draft the talk-track (F6.2). */
  route(app, {
    method: 'POST', url: '/api/levers/size', summary: 'LEVER agent — size an idea & draft the talk-track', tags: ['levers'],
    body: z.object({
      lever: LeverSchema,
      projectId: z.string().uuid().optional(),
      context: z.record(z.unknown()).default({}),
    }),
    handler: async ({ principal, body }) => db(ctx, principal!, async (c) => {
      let projectCtx: Record<string, unknown> = body.context;
      if (body.projectId) {
        const p = (await c.query(`SELECT * FROM projects WHERE id=$1`, [body.projectId])).rows[0];
        if (p) projectCtx = { ...projectCtx, project: mapProject(p) };
      }
      const res = await runAgentStep(ctx.gateway, {
        tenantId: principal!.tenantId, agent: 'LEVER',
        context: { lever: body.lever, ...projectCtx },
      });
      await c.query(
        `INSERT INTO agent_runs (tenant_id, agent, trigger, triggered_by, object_type, object_ref, status, outputs, model_used, provenance)
         VALUES ($1,'LEVER','user',$2,$3,$4,$5,$6,$7,$8)`,
        [principal!.tenantId, principal!.userId, body.projectId ? 'project' : null, body.projectId ?? null,
          res.refused ? 'refused' : 'complete', JSON.stringify(res.output), res.modelUsed, JSON.stringify(res.provenance)]);
      return { refused: res.refused, output: res.output };
    }),
  });
}
