/**
 * Agent Crew: roster + activity, COACH runs (start / state / SSE stream /
 * resume) and Lever Council sessions. No route here can sign a gate.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROSTER, runCouncil } from '@eof/agents';
import { route } from '../lib/route.js';
import { db, dbTenant, audit, type AppCtx } from '../lib/ctx.js';
import { mapAgentRun } from '../lib/mappers.js';
import { notFound } from '../lib/http-error.js';
import { resumeCoachRun, startCoachRun } from '../services/workflows.js';

export function agentRoutes(app: FastifyInstance, ctx: AppCtx): void {
  route(app, {
    method: 'GET', url: '/api/agents/roster', summary: 'Agent roster with last activity', tags: ['agents'],
    handler: async ({ principal }) => db(ctx, principal!, async (c) => {
      const acts = await c.query(
        `SELECT DISTINCT ON (agent) agent, outputs, created_at FROM agent_runs
         ORDER BY agent, created_at DESC`);
      const actMap = new Map(acts.rows.map((r) => [r.agent, r]));
      return {
        roster: ROSTER.map((a) => ({
          name: a.name, family: a.family, stage: a.stage, role: a.role,
          mandate: a.mandate, consumes: a.consumes, produces: a.produces, tools: a.tools,
          lastActivity: (() => {
            const act = actMap.get(a.name);
            if (!act) return null;
            const note = act.outputs?.note ?? act.outputs?.narrative ?? null;
            return { note: typeof note === 'string' ? note : 'run complete', at: act.created_at };
          })(),
        })),
      };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/projects/:projectId/coach', summary: 'Hand to COACH — start a semi-autonomous run (pauses at every human gate)', tags: ['agents'],
    params: z.object({ projectId: z.string().uuid() }),
    handler: async ({ principal, params }) => {
      const runId = await startCoachRun(ctx, principal!, params.projectId);
      return { runId };
    },
  });

  route(app, {
    method: 'GET', url: '/api/agent-runs/:id', summary: 'Agent run state (steps, outputs, gate holds)', tags: ['agents'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => db(ctx, principal!, async (c) => {
      const r = await c.query(`SELECT * FROM agent_runs WHERE id=$1`, [params.id]);
      if (!r.rows.length) throw notFound('Run not found');
      return { run: mapAgentRun(r.rows[0]) };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/agent-runs/:id/resume', summary: 'Nudge a held run to re-check its gate (resumes only if the gate is signed)', tags: ['agents'],
    params: z.object({ id: z.string().uuid() }),
    handler: async ({ principal, params }) => {
      await resumeCoachRun(ctx, principal!.tenantId, params.id);
      return { ok: true };
    },
  });

  // SSE stream of a run's live step tracker (F7.5 streaming log).
  app.get('/api/agent-runs/:id/stream', async (req, reply) => {
    const principal = req.principal;
    if (!principal) return reply.status(401).send({ error: 'Unauthorized' });
    const { id } = req.params as { id: string };
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'access-control-allow-origin': ctx.env.WEB_ORIGIN,
    });
    let closed = false;
    req.raw.on('close', () => { closed = true; });
    let lastPayload = '';
    for (let i = 0; i < 600 && !closed; i++) {
      const run = await dbTenant(ctx, principal.tenantId, async (c) =>
        (await c.query(`SELECT * FROM agent_runs WHERE id=$1`, [id])).rows[0] ?? null);
      if (!run) break;
      const payload = JSON.stringify(mapAgentRun(run));
      if (payload !== lastPayload) {
        reply.raw.write(`data: ${payload}\n\n`);
        lastPayload = payload;
      }
      if (['complete', 'failed', 'cancelled', 'gate_hold'].includes(run.status)) break;
      await new Promise((res) => setTimeout(res, 700));
    }
    reply.raw.end();
  });

  route(app, {
    method: 'POST', url: '/api/projects/:projectId/council', summary: 'Convene the Lever Council (agents debate; the human decides)', tags: ['agents'],
    params: z.object({ projectId: z.string().uuid() }),
    body: z.object({
      participants: z.array(z.string()).default(['LEVER', 'PULSE', 'SENTINEL', 'FUEL FOR GROWTH', 'CUBE', 'The Recommender']),
    }).default({ participants: ['LEVER', 'PULSE', 'SENTINEL', 'FUEL FOR GROWTH', 'CUBE', 'The Recommender'] }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const pr = await c.query(`SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL`, [params.projectId]);
      if (!pr.rows.length) throw notFound('Project not found');
      const p = pr.rows[0];
      const res = await runCouncil(ctx.gateway, {
        tenantId: principal!.tenantId,
        context: {
          project: { name: p.name, lever: p.lever, bu: p.bu, pnlElement: p.pnl_element, annualSavingsUsdK: Number(p.annual_savings_usd_k), description: p.description },
        },
        participants: body.participants as never,
      });
      const o = res.output as { stances?: unknown[]; consensus?: string; dissent?: string };
      const s = await c.query(
        `INSERT INTO council_sessions (tenant_id, project_ref, participants, transcript, consensus, dissent, recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,'SCRIBE') RETURNING *`,
        [principal!.tenantId, params.projectId, JSON.stringify(body.participants),
          JSON.stringify(o.stances ?? []), o.consensus ?? null, o.dissent ?? null]);
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'council.convened', objectType: 'project', objectRef: params.projectId,
        payload: { sessionId: s.rows[0].id },
      });
      return {
        session: {
          id: s.rows[0].id, participants: body.participants, transcript: o.stances ?? [],
          consensus: o.consensus ?? null, dissent: o.dissent ?? null, recordedBy: 'SCRIBE',
          humanDecision: null, createdAt: s.rows[0].created_at,
        },
      };
    }),
  });

  route(app, {
    method: 'POST', url: '/api/council/:sessionId/decide', summary: 'Record the human lever decision on a council session', tags: ['agents'],
    params: z.object({ sessionId: z.string().uuid() }),
    body: z.object({ lever: z.string(), note: z.string().nullable().default(null) }),
    handler: async ({ principal, params, body }) => db(ctx, principal!, async (c) => {
      const decision = {
        userId: principal!.userId, userName: principal!.name, lever: body.lever,
        note: body.note, ts: new Date().toISOString(),
      };
      const r = await c.query(
        `UPDATE council_sessions SET human_decision=$2 WHERE id=$1 RETURNING *`,
        [params.sessionId, JSON.stringify(decision)]);
      if (!r.rows.length) throw notFound('Session not found');
      await audit(c, {
        tenantId: principal!.tenantId, actorId: principal!.userId, actorName: principal!.name,
        action: 'council.human_decision', objectType: 'project', objectRef: r.rows[0].project_ref,
        payload: decision,
      });
      return { ok: true, humanDecision: decision };
    }),
  });
}
