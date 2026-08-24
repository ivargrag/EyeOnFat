/**
 * M7 — Projects & delivery. Stage-gated: only `finance` moves Pipeline →
 * Forecast (G5, invariant #4). Duplicate = "steal with pride" (F7.2).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  LeverSchema, StageSchema, carryForward, procuraEligible, timeProbabilityAdjusted,
} from '@eof/domain';
import { route } from '../lib/route.js';
import { db, audit, type AppCtx } from '../lib/ctx.js';
import { isoDate, mapProject } from '../lib/mappers.js';
import { badRequest, forbidden, notFound } from '../lib/http-error.js';
import { ensureGate, signGate } from '../services/gates.js';
import { applyGateSideEffects } from '../services/workflows.js';

const MilestoneInput = z.object({ name: z.string(), owner: z.string().default(''), due: z.string().nullable().default(null), pct: z.number().min(0).max(100).default(0) });
const MeetingInput = z.object({ name: z.string(), date: z.string().nullable().default(null), momAttachment: z.string().nullable().default(null) });

const CreateProject = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  bu: z.string().min(1),
  country: z.string().min(1),
  fn: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  pnlElement: z.string().min(1),
  lever: LeverSchema,
  team: z.array(z.string()).default([]),
  annualSavingsUsdK: z.number().min(0),
  probabilityPct: z.number().min(0).max(100),
  savingsStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  savingsEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  costToAchieve: z.object({ oneTimeUsdK: z.number().default(0), recurringUsdK: z.number().default(0), notes: z.string().nullable().default(null) }).default({ oneTimeUsdK: 0, recurringUsdK: 0, notes: null }),
  milestones: z.array(MilestoneInput).default([]),
  meetings: z.array(MeetingInput).default([]),
  needsNewSupplier: z.boolean().default(false),
});

export function projectRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/projects', summary: 'List projects with filters', tags: ['projects'],
    querystring: z.object({
      mine: z.coerce.boolean().optional(),
      bu: z.string().optional(), country: z.string().optional(), pnlElement: z.string().optional(),
      stage: StageSchema.optional(), lever: LeverSchema.optional(),
    }),
    handler: async ({ principal, query }) => db(ctx, principal!, async (c) => {
      const conds: string[] = ['deleted_at IS NULL'];
      const params: unknown[] = [];
      const add = (sql: string, v: unknown) => { params.push(v); conds.push(sql.replace('?', `$${params.length}`)); };
      if (query.mine) add('lead_id = ?', principal!.userId);
      if (query.bu) add('bu = ?', query.bu);
      if (query.country) add('country = ?', query.country);
      if (query.pnlElement) add('pnl_element = ?', query.pnlElement);
      if (query.stage) add('stage = ?', query.stage);
      if (query.lever) add('lever = ?', query.lever);
      const r = await c.query(`SELECT * FROM projects WHERE ${conds.join(' AND ')} ORDER BY created_at DESC`, params);
      return {
        projects: r.rows.map((row) => ({ ...mapProject(row), procuraEligible: procuraEligible({ lever: row.lever, needsNewSupplier: row.needs_new_supplier }) })),
      };
    }),
  });

  route(app, {
    method: 'GET', url: '/api/projects/:id', summary: 'Project detail', tags: ['projects'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!r.rows.length) throw notFound('Project not found');
      const gates = await c.query(`SELECT * FROM gates WHERE object_ref=$1 ORDER BY created_at`, [params.id]);
      const councils = await c.query(`SELECT * FROM council_sessions WHERE project_ref=$1 ORDER BY created_at DESC`, [params.id]);
      const runs = await c.query(
        `SELECT * FROM agent_runs WHERE object_ref=$1 AND agent='COACH' ORDER BY created_at DESC LIMIT 5`, [params.id]);
      const row = r.rows[0];
      return {
        project: { ...mapProject(row), procuraEligible: procuraEligible({ lever: row.lever, needsNewSupplier: row.needs_new_supplier }) },
        gates: gates.rows.map((g) => ({ id: g.id, gateId: g.gate_id, status: g.status, signatures: g.signatures, requiredRoles: g.required_roles, requiredDistinctSignatures: g.required_distinct })),
        councilSessions: councils.rows.map((s) => ({
          id: s.id, participants: s.participants, transcript: s.transcript,
          consensus: s.consensus, dissent: s.dissent, recordedBy: s.recorded_by,
          humanDecision: s.human_decision, createdAt: s.created_at,
        })),
        coachRuns: runs.rows.map((x) => ({ id: x.id, status: x.status, createdAt: x.created_at })),
      };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/projects', summary: 'Create a project (saved to Pipeline)', tags: ['projects'],
    access: ['pm', 'manager', 'analyst', 'admin', 'owner', 'procurement', 'finance'],
    body: CreateProject,
    handler: async ({ principal, body }) => db(ctx, principal!, async (c) => {
      const tp = timeProbabilityAdjusted({ annualUsdK: body.annualSavingsUsdK, probabilityPct: body.probabilityPct, savingsStart: body.savingsStart });
      const cf = carryForward({ annualUsdK: body.annualSavingsUsdK, probabilityPct: body.probabilityPct, savingsStart: body.savingsStart });
      const financeLead = await c.query(`SELECT id, name FROM users WHERE 'finance' = ANY(roles) AND active LIMIT 1`);
      const r = await c.query(
        `INSERT INTO projects (tenant_id, name, description, bu, country, fn, brand, pnl_element, lever, lead_id, lead_name, team,
           finance_lead_id, finance_lead_name, stage, annual_savings_usd_k, probability_pct, savings_start, savings_end,
           tp_adjusted_usd_k, carry_forward_usd_k, cost_to_achieve, milestones, meetings, needs_new_supplier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Pipeline',$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         RETURNING *`,
        [principal!.tenantId, body.name, body.description, body.bu, body.country, body.fn ?? null, body.brand ?? null,
          body.pnlElement, body.lever, principal!.userId, principal!.name, JSON.stringify(body.team),
          financeLead.rows[0]?.id ?? null, financeLead.rows[0]?.name ?? '', body.annualSavingsUsdK, body.probabilityPct,
          body.savingsStart, body.savingsEnd ?? null, tp, cf, JSON.stringify(body.costToAchieve),
          JSON.stringify(body.milestones.map((m, i) => ({ id: `m${i + 1}`, ...m }))),
          JSON.stringify(body.meetings.map((m, i) => ({ id: `mt${i + 1}`, ...m }))),
          body.needsNewSupplier]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'project.create', objectType: 'project', objectRef: r.rows[0].id,
        payload: { name: body.name, lever: body.lever },
      });
      const row = r.rows[0];
      return { project: { ...mapProject(row), procuraEligible: procuraEligible({ lever: row.lever, needsNewSupplier: row.needs_new_supplier }) } };
    }),
  });

  route(app, {
    method: 'PATCH', url: '/api/projects/:id', summary: 'Update project fields', tags: ['projects'],
    params: z.object({ id: z.string().uuid() }),
    body: CreateProject.partial().extend({
      stage: z.undefined().optional(), // stage moves only through gated endpoints
    }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const cur = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.id]);
      if (!cur.rows.length) throw notFound('Project not found');
      const p = cur.rows[0];
      const merged = {
        name: body.name ?? p.name, description: body.description ?? p.description,
        bu: body.bu ?? p.bu, country: body.country ?? p.country,
        fn: body.fn !== undefined ? body.fn : p.fn, brand: body.brand !== undefined ? body.brand : p.brand,
        pnlElement: body.pnlElement ?? p.pnl_element, lever: body.lever ?? p.lever,
        team: body.team ?? p.team,
        annualSavingsUsdK: body.annualSavingsUsdK ?? Number(p.annual_savings_usd_k),
        probabilityPct: body.probabilityPct ?? Number(p.probability_pct),
        savingsStart: body.savingsStart ?? isoDate(p.savings_start),
        savingsEnd: body.savingsEnd !== undefined ? body.savingsEnd : p.savings_end,
        costToAchieve: body.costToAchieve ?? p.cost_to_achieve,
        milestones: body.milestones ? body.milestones.map((m, i) => ({ id: `m${i + 1}`, ...m })) : p.milestones,
        meetings: body.meetings ? body.meetings.map((m, i) => ({ id: `mt${i + 1}`, ...m })) : p.meetings,
        needsNewSupplier: body.needsNewSupplier ?? p.needs_new_supplier,
      };
      const rawStart: unknown = merged.savingsStart;
      const savingsStartIso = rawStart instanceof Date
        ? rawStart.toISOString().slice(0, 10) : String(rawStart).slice(0, 10);
      const tp = timeProbabilityAdjusted({ annualUsdK: merged.annualSavingsUsdK, probabilityPct: merged.probabilityPct, savingsStart: savingsStartIso });
      const cf = carryForward({ annualUsdK: merged.annualSavingsUsdK, probabilityPct: merged.probabilityPct, savingsStart: savingsStartIso });
      const r = await c.query(
        `UPDATE projects SET name=$2, description=$3, bu=$4, country=$5, fn=$6, brand=$7, pnl_element=$8, lever=$9,
           team=$10, annual_savings_usd_k=$11, probability_pct=$12, savings_start=$13, savings_end=$14,
           tp_adjusted_usd_k=$15, carry_forward_usd_k=$16, cost_to_achieve=$17, milestones=$18, meetings=$19,
           needs_new_supplier=$20, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [params.id, merged.name, merged.description, merged.bu, merged.country, merged.fn, merged.brand,
          merged.pnlElement, merged.lever, JSON.stringify(merged.team), merged.annualSavingsUsdK, merged.probabilityPct,
          savingsStartIso, merged.savingsEnd, tp, cf, JSON.stringify(merged.costToAchieve),
          JSON.stringify(merged.milestones), JSON.stringify(merged.meetings), merged.needsNewSupplier]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'project.update', objectType: 'project', objectRef: params.id, payload: { fields: Object.keys(body) },
      });
      return { project: mapProject(r.rows[0]) };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/projects/:id/duplicate', summary: 'Duplicate — steal with pride (resets to Pipeline)', tags: ['projects'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
      name: z.string().optional(), bu: z.string().optional(), country: z.string().optional(),
      annualSavingsUsdK: z.number().optional(), savingsStart: z.string().optional(),
    }).default({}),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const src = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [params.id]);
      if (!src.rows.length) throw notFound('Project not found');
      const s = src.rows[0];
      const annual = body.annualSavingsUsdK ?? Number(s.annual_savings_usd_k);
      const start = body.savingsStart ?? isoDate(s.savings_start);
      const prob = Number(s.probability_pct);
      const tp = timeProbabilityAdjusted({ annualUsdK: annual, probabilityPct: prob, savingsStart: start });
      const cf = carryForward({ annualUsdK: annual, probabilityPct: prob, savingsStart: start });
      const r = await c.query(
        `INSERT INTO projects (tenant_id, name, description, bu, country, fn, brand, pnl_element, lever, lead_id, lead_name,
           team, finance_lead_id, finance_lead_name, stage, annual_savings_usd_k, probability_pct, savings_start, savings_end,
           tp_adjusted_usd_k, carry_forward_usd_k, cost_to_achieve, milestones, meetings, needs_new_supplier, duplicated_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'Pipeline',$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING *`,
        [principal!.tenantId, body.name ?? `${s.name} (copy)`, s.description, body.bu ?? s.bu, body.country ?? s.country,
          s.fn, s.brand, s.pnl_element, s.lever, principal!.userId, principal!.name, JSON.stringify(s.team),
          s.finance_lead_id, s.finance_lead_name, annual, prob, start, s.savings_end, tp, cf,
          JSON.stringify(s.cost_to_achieve),
          JSON.stringify((s.milestones ?? []).map((m: object) => ({ ...m, pct: 0 }))),
          '[]', s.needs_new_supplier, s.id]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'project.duplicate', objectType: 'project', objectRef: r.rows[0].id,
        payload: { duplicatedFrom: s.id },
      });
      return { project: mapProject(r.rows[0]) };
    }),
  });

  /**
   * G5 — Finance commits Pipeline → Forecast. Invariant #4: only role
   * `finance` may do this; enforced here at the API layer AND by the gate rule.
   */
  route(app, {
    method: 'POST', url: '/api/projects/:id/commit-forecast', summary: 'G5 — Finance commits project to Forecast', tags: ['projects', 'gates'],
    access: ['finance'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ note: z.string().nullable().default(null) }).default({ note: null }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.id]);
      if (!pr.rows.length) throw notFound('Project not found');
      if (pr.rows[0].stage !== 'Pipeline') throw badRequest(`Project is at ${pr.rows[0].stage}; G5 commits Pipeline → Forecast.`, 'WRONG_STAGE');
      const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G5', objectType: 'project', objectRef: params.id });
      const res = await signGate(c, principal!, { gateRef: gate.id, decision: 'approve', note: body.note });
      if (res.satisfied) await applyGateSideEffects(ctx, c, principal!, res.gate, 'approve');
      const updated = await c.query(`SELECT * FROM projects WHERE id=$1`, [params.id]);
      return { project: mapProject(updated.rows[0]) };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/projects/:id/stage', summary: 'Gated stage transitions (Forecast→Committed G4 · Committed→Delivered G6)', tags: ['projects'],
    params: z.object({ id: z.string().uuid() }),
    body: z.object({ stage: StageSchema, note: z.string().nullable().default(null) }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL FOR UPDATE`, [params.id]);
      if (!pr.rows.length) throw notFound('Project not found');
      const from = pr.rows[0].stage as string;
      const to = body.stage;
      if (from === 'Pipeline' && to === 'Forecast') {
        throw forbidden('Pipeline → Forecast is the G5 gate: use /commit-forecast (finance only).', 'USE_G5');
      }
      if (from === 'Forecast' && to === 'Committed') {
        if (!principal!.roles.some((r) => ['pm', 'manager', 'owner'].includes(r))) {
          throw forbidden('Forecast → Committed requires pm/manager/owner (G4).', 'ROLE_REQUIRED');
        }
        const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G4', objectType: 'project', objectRef: params.id });
        const res = await signGate(c, principal!, { gateRef: gate.id, decision: 'approve', note: body.note });
        if (res.satisfied) {
          await c.query(`UPDATE projects SET stage='Committed', updated_at=now() WHERE id=$1`, [params.id]);
        }
      } else if (from === 'Committed' && to === 'Delivered') {
        const gate = await ensureGate(c, { tenantId: principal!.tenantId, gateId: 'G6', objectType: 'project', objectRef: params.id });
        const res = await signGate(c, principal!, { gateRef: gate.id, decision: 'approve', note: body.note });
        if (res.satisfied) await applyGateSideEffects(ctx, c, principal!, res.gate, 'approve');
      } else {
        throw badRequest(`Transition ${from} → ${to} is not allowed.`, 'BAD_TRANSITION');
      }
      const updated = await c.query(`SELECT * FROM projects WHERE id=$1`, [params.id]);
      return { project: mapProject(updated.rows[0]) };
    }),
  });

  route(app, {
    method: 'DELETE', url: '/api/projects/:id', summary: 'Soft-delete a project', tags: ['projects'],
    access: ['admin', 'owner', 'pm'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      await c.query(`UPDATE projects SET deleted_at=now() WHERE id=$1`, [params.id]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'project.soft_delete', objectType: 'project', objectRef: params.id,
      });
      return { ok: true };
    }),
  });
}
