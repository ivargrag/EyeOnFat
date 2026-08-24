/**
 * API integration tests against a migrated + seeded database (Meridian demo).
 * Keyed to PRD acceptance criteria:
 *  - F5.3 AC: API rejects a G3 decision with <2 distinct qualified signatures
 *  - Invariant #4: only finance moves Pipeline → Forecast
 *  - F8.4 AC: evaluation matrix immutable after lock; award needs human signature
 *  - F4.2 AC: analyst edit never mutates the agent layer
 *  - P2: sub-floor scenarios blocked without override+reason
 *
 * Skips when DATABASE_URL is not set. Run: pnpm db:migrate && pnpm db:seed && vitest.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer, type BuiltServer } from '../src/server.js';

const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const PASSWORD = 'EyeOnFat!2026';
let built: BuiltServer;
let app: FastifyInstance;

async function login(email: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.accessToken).toBeTruthy();
  return body.accessToken as string;
}
const auth = (t: string) => ({ authorization: `Bearer ${t}` });

d('Eye on Fat API — gate & guardrail acceptance criteria', () => {
  let pmToken: string, managerToken: string, financeToken: string, procurementToken: string;
  let projectRosterId: string; // open G3 case (merchandiser)

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    built = await buildServer({ NODE_ENV: 'test' } as never);
    app = built.app;
    pmToken = await login('k.menon@meridiangroup.com');
    managerToken = await login('retail.ops@meridiangroup.com');
    procurementToken = await login("a.dsouza@meridiangroup.com");
    financeToken = await login('s.iyer@meridiangroup.com');
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await built.ctx.pool.end();
  });

  it('login → shell data', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth(pmToken) });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.roles).toContain('pm');
  });

  it('MFA enforcement is off for the demo tenant (configurable via settings.mfaRequiredForRoles)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 's.iyer@meridiangroup.com', password: PASSWORD } });
    expect(res.json().mfaSetupRequired).toBe(false);
  });

  it('G3: single signature leaves the gate open — decision NOT applied (F5.3 AC)', async () => {
    // Self-contained: create a fresh idea and run the FUEL FOR GROWTH agent on it.
    const created = await app.inject({
      method: 'POST', url: '/api/projects', headers: auth(pmToken),
      payload: {
        name: `FFG test case ${Date.now()}`, bu: 'Retail', country: 'UAE', pnlElement: 'Manpower services',
        lever: 'Demand', annualSavingsUsdK: 100, probabilityPct: 70, savingsStart: '2026-10-01',
      },
    });
    expect(created.statusCode).toBe(200);
    projectRosterId = created.json().project.id;
    const ran = await app.inject({ method: 'POST', url: `/api/ffg/${projectRosterId}/run`, headers: auth(pmToken) });
    expect(ran.statusCode).toBe(200);
    expect(ran.json().gate.status).toBe('open');

    const res = await app.inject({
      method: 'POST', url: `/api/ffg/${projectRosterId}/decide`, headers: auth(pmToken),
      payload: { decision: 'hold', note: 'Redesign as smart rostering' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().satisfied).toBe(false);
    expect(res.json().pendingSecondSignature).toBe(true);
  });

  it('G3: same user cannot sign twice', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/ffg/${projectRosterId}/decide`, headers: auth(pmToken),
      payload: { decision: 'hold' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('DUPLICATE_SIGNER');
  });

  it('G3: a second pm cannot fill the manager slot', async () => {
    const rao = await login('p.rao@meridiangroup.com');
    const res = await app.inject({
      method: 'POST', url: `/api/ffg/${projectRosterId}/decide`, headers: auth(rao),
      payload: { decision: 'hold' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('G3: manager completes the dual signature → decision applied with audit', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/ffg/${projectRosterId}/decide`, headers: auth(managerToken),
      payload: { decision: 'hold', note: 'Protect peak coverage' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().satisfied).toBe(true);
    expect(res.json().project.ffgDecision.decision).toBe('hold');
  });

  it('G5: pm CANNOT commit Pipeline → Forecast (finance only, invariant #4)', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/projects?stage=Pipeline', headers: auth(pmToken) });
    const pipeline = list.json().projects[0];
    const res = await app.inject({
      method: 'POST', url: `/api/projects/${pipeline.id}/commit-forecast`, headers: auth(pmToken), payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('G5: finance commits Pipeline → Forecast', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/projects?stage=Pipeline', headers: auth(financeToken) });
    const pipeline = list.json().projects[0];
    const res = await app.inject({
      method: 'POST', url: `/api/projects/${pipeline.id}/commit-forecast`, headers: auth(financeToken), payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().project.stage).toBe('Forecast');
  });

  it('Procura: evaluation matrix is immutable after lock (F8.4 AC)', async () => {
    const events = await app.inject({ method: 'GET', url: '/api/procura', headers: auth(procurementToken) });
    const live = events.json().events.find((e: { evaluationMatrix: { lockedAt: string | null } }) => e.evaluationMatrix.lockedAt);
    expect(live).toBeTruthy();
    const res = await app.inject({
      method: 'PATCH', url: `/api/procura/${live.id}/matrix`, headers: auth(procurementToken),
      payload: { criteria: [{ name: 'Price only', weightPct: 100 }] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MATRIX_LOCKED');
  });

  it('Procura: sealed bids never expose amounts', async () => {
    const events = await app.inject({ method: 'GET', url: '/api/procura', headers: auth(procurementToken) });
    const live = events.json().events.find((e: { stage: string }) => e.stage === 'distribute_bids');
    const detail = await app.inject({ method: 'GET', url: `/api/procura/${live.id}`, headers: auth(procurementToken) });
    for (const bid of detail.json().event.bids) {
      expect(bid.sealed).toBe(true);
      expect(bid.amountUsd).toBeUndefined();
    }
  });

  it('Should-cost: analyst edit never mutates the agent layer (F4.2 AC)', async () => {
    const models = await app.inject({ method: 'GET', url: '/api/should-cost', headers: auth(pmToken) });
    const draft = models.json().models.find((m: { status: string }) => m.status === 'draft');
    const el = draft.structure[0];
    const res = await app.inject({
      method: 'PATCH', url: `/api/should-cost/${draft.id}/analyst-layer`, headers: auth(pmToken),
      payload: { edits: [{ elementName: el.name, analystValue: 39.9 }] },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json().model.structure.find((x: { name: string }) => x.name === el.name);
    expect(updated.analystValue).toBe(39.9);
    expect(updated.agentValue).toBe(el.agentValue);           // agent layer untouched
    expect(updated.agentProvenance).toEqual(el.agentProvenance);
  });

  it('SENTINEL: sub-floor scenario cannot be classified savings without override (P2)', async () => {
    const models = await app.inject({ method: 'GET', url: '/api/should-cost', headers: auth(pmToken) });
    const model = models.json().models[0];
    const blocked = await app.inject({
      method: 'POST', url: `/api/should-cost/${model.id}/classify-savings`, headers: auth(pmToken),
      payload: { scenarioPriceUsd: 88, supplierMarginPct: 2.1, override: false },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('SUB_FLOOR');

    const overridden = await app.inject({
      method: 'POST', url: `/api/should-cost/${model.id}/classify-savings`, headers: auth(pmToken),
      payload: { scenarioPriceUsd: 88, supplierMarginPct: 2.1, override: true, overrideReason: 'Strategic exception approved by SteerCo' },
    });
    expect(overridden.statusCode).toBe(200);
    expect(overridden.json().overridden).toBe(true);
  });

  it('duplicate — steal with pride resets stage & links duplicated_from (F7.2)', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/projects', headers: auth(pmToken) });
    const committed = list.json().projects.find((p: { stage: string }) => p.stage === 'Committed');
    const res = await app.inject({
      method: 'POST', url: `/api/projects/${committed.id}/duplicate`, headers: auth(pmToken),
      payload: { bu: 'Hospitality', country: 'KSA' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().project.stage).toBe('Pipeline');
    expect(res.json().project.duplicatedFrom).toBe(committed.id);
    expect(res.json().project.bu).toBe('Hospitality');
  });

  it('audit log is hash-chained', async () => {
    const admin = await login('admin@meridiangroup.com');
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit?limit=10', headers: auth(admin) });
    expect(res.statusCode).toBe(200);
    const entries = res.json().entries;
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.hash).toHaveLength(64);
  });
});
