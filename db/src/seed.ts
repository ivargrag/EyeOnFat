/**
 * Seed the Meridian Group demo tenant. Idempotent: wipes and re-inserts the
 * demo tenant's rows (dev convenience), leaves other tenants untouched.
 * Run AFTER migrations: pnpm db:migrate && pnpm db:seed
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { carryForward, timeProbabilityAdjusted } from '@eof/domain';
import {
  AGENT_ACTIVITY, CONNECTORS, DEMO_PASSWORD, FFG_CASES, FX, INTAKE,
  MODEL_REGISTRY, PROCURA_FREIGHT, PROJECTS, SHOULD_COST_BAG, SHOULD_COST_FREIGHT,
  SPEND_TREE, TENANT, USERS,
} from './seed-data.js';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) { console.error('DATABASE_ADMIN_URL required'); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const c = new pg.Client({ connectionString: adminUrl });
  await c.connect();
  const q = (text: string, params?: unknown[]) => c.query(text, params);

  // ── tenant ──
  const existing = await q('SELECT id FROM tenants WHERE slug = $1', [TENANT.slug]);
  let tenantId: string;
  if (existing.rows.length) {
    tenantId = existing.rows[0].id;
    await q(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
    // wipe demo tenant data (dev reset) — FK-safe order
    for (const t of ['council_sessions', 'agent_runs', 'procura_events', 'gates', 'projects',
      'should_cost_models', 'spend_nodes', 'spend_records', 'intake_files', 'connectors',
      'refresh_tokens']) {
      await q(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]);
    }
    await q('UPDATE tenants SET settings = $2 WHERE id = $1', [tenantId, TENANT.settings]);
  } else {
    const r = await q('INSERT INTO tenants (slug, name, settings) VALUES ($1,$2,$3) RETURNING id',
      [TENANT.slug, TENANT.name, TENANT.settings]);
    tenantId = r.rows[0].id;
    await q(`SELECT set_config('app.tenant_id', $1, false)`, [tenantId]);
  }
  console.log(`tenant ${TENANT.name} → ${tenantId}`);

  // ── users ──
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const userIds: Record<string, string> = {};
  const userNames: Record<string, string> = {};
  for (const u of USERS) {
    const r = await q(
      `INSERT INTO users (tenant_id, email, name, password_hash, roles, award_authority)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, email) DO UPDATE SET name=$3, password_hash=$4, roles=$5, award_authority=$6, active=true, deleted_at=NULL
       RETURNING id`,
      [tenantId, u.email, u.name, hash, u.roles, u.awardAuthority]);
    userIds[u.email] = r.rows[0].id;
    userNames[u.email] = u.name;
  }

  // ── fx + model registry (global) ──
  for (const f of FX) {
    await q(`INSERT INTO fx_rates (currency, rate_per_usd, as_of, source) VALUES ($1,$2,$3,'seed')
             ON CONFLICT (currency, as_of) DO UPDATE SET rate_per_usd=$2`, [f.currency, f.rate, today]);
  }
  for (const m of MODEL_REGISTRY) {
    await q(`INSERT INTO model_registry (model_id, provider, capabilities, context_window, cost_in_per_m, cost_out_per_m, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (model_id) DO UPDATE SET provider=$2, status=$7`,
      [m.modelId, m.provider, JSON.stringify(m.capabilities), m.contextWindow, m.costIn, m.costOut, m.status]);
  }

  // ── connectors + intake ──
  for (const cn of CONNECTORS) {
    await q(`INSERT INTO connectors (tenant_id, key, name, status, status_line, detail, last_sync)
             VALUES ($1,$2,$3,$4,$5,$6, CASE WHEN $4='ok' THEN now() ELSE NULL END)`,
      [tenantId, cn.key, cn.name, cn.status, cn.statusLine, cn.detail]);
  }
  for (const f of INTAKE) {
    await q(`INSERT INTO intake_files (tenant_id, name, rows, status, mapped_pct) VALUES ($1,$2,$3,$4,$5)`,
      [tenantId, f.name, f.rows, f.status, f.mappedPct]);
  }

  // ── spend tree: nodes + synthetic invoice-level records ──
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  for (const cat of SPEND_TREE) {
    const catNode = await q(
      `INSERT INTO spend_nodes (tenant_id, parent_id, level, name, amount_usd_k, volume_share, price_share, lens_flags, insight, opportunity_rank, record_count)
       VALUES ($1,NULL,'category',$2,$3,$4,$5,$6,NULL,$7,$8) RETURNING id`,
      [tenantId, cat.name, cat.amtK, cat.volShare, 100 - cat.volShare,
        JSON.stringify(cat.flag ? [{ kind: 'other', label: 'LENS opportunity', severity: 'amber' }] : []),
        cat.amtK * (cat.flag ? 1.5 : 1) / 100, cat.suppliers.length * months.length]);
    const catId = catNode.rows[0].id;

    for (const sup of cat.suppliers) {
      await q(
        `INSERT INTO spend_nodes (tenant_id, parent_id, level, name, amount_usd_k, volume_share, price_share, lens_flags, insight, opportunity_rank, record_count)
         VALUES ($1,$2,'supplier',$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId, catId, sup.name, sup.amtK, cat.volShare, 100 - cat.volShare,
          JSON.stringify(sup.flag ? [{ kind: 'price_variance', label: sup.insight.slice(0, 60), severity: 'amber' }] : []),
          sup.insight || null, sup.flag ? sup.amtK / 50 : null, months.length]);

      // synthetic monthly invoice lines summing to the annual figure (half-year seeded)
      const perMonthUsd = (sup.amtK * 1000) / months.length;
      let i = 0;
      for (const m of months) {
        i += 1;
        const unitPrice = 8 + ((sup.name.length * 7 + i) % 40);
        const volume = Math.round((perMonthUsd / unitPrice) * 100) / 100;
        await q(
          `INSERT INTO spend_records (tenant_id, source, supplier, category, bu, country, invoice_ref, date, volume, unit_price, amount_usd, currency, fx_rate_asof, lineage)
           VALUES ($1,'sap_b1',$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',$11,$12)`,
          [tenantId, sup.name, [cat.name, sup.name], cat.bu, cat.country,
            `INV-${cat.name.slice(0, 3).toUpperCase()}-${i}${sup.name.length}`, `${m}-15`,
            volume, unitPrice, perMonthUsd, today,
            JSON.stringify({ documentId: `doc-${cat.name}-${sup.name}-${m}`.replace(/[^a-z0-9-]/gi, '_'), page: 1 })]);
      }
    }
  }

  // Unclassified tail (KSA petty-cash feed) → G0 completeness lands ≈ 87%
  for (let i = 1; i <= 6; i++) {
    await q(
      `INSERT INTO spend_records (tenant_id, source, supplier, category, bu, country, invoice_ref, date, amount_usd, currency, fx_rate_asof)
       VALUES ($1,'banking','KSA petty cash', '{"Unclassified"}', 'Retail', 'KSA', $2, $3, $4, 'USD', $5)`,
      [tenantId, `PC-${i}`, `2026-0${3 + i}-20`, 8_775_000 / 6, today]);
  }

  // ── should-cost models ──
  const mkStructure = (s: typeof SHOULD_COST_BAG.structure) => s.map((e) => ({
    name: e.name, agentValue: e.agentValue,
    agentProvenance: [{ source: e.prov, asOf: e.asOf }],
    analystValue: null, formula: null,
  }));
  const bagModel = await q(
    `INSERT INTO should_cost_models (tenant_id, item, unit, zbc, structure, current_price_usd, fair_margin_floor_pct, sentinel_checks, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft') RETURNING id`,
    [tenantId, SHOULD_COST_BAG.item, SHOULD_COST_BAG.unit, JSON.stringify(SHOULD_COST_BAG.zbc),
      JSON.stringify(mkStructure(SHOULD_COST_BAG.structure)), SHOULD_COST_BAG.currentPriceUsd,
      SHOULD_COST_BAG.fairMarginFloorPct, JSON.stringify(SHOULD_COST_BAG.sentinelChecks)]);
  const bagModelId = bagModel.rows[0].id;

  const freightModel = await q(
    `INSERT INTO should_cost_models (tenant_id, item, unit, zbc, structure, current_price_usd, fair_margin_floor_pct, sentinel_checks, status, frozen_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'g2_signed',1) RETURNING id`,
    [tenantId, SHOULD_COST_FREIGHT.item, SHOULD_COST_FREIGHT.unit, JSON.stringify(SHOULD_COST_FREIGHT.zbc),
      JSON.stringify(mkStructure(SHOULD_COST_FREIGHT.structure)), SHOULD_COST_FREIGHT.currentPriceUsd,
      SHOULD_COST_FREIGHT.fairMarginFloorPct, JSON.stringify(SHOULD_COST_FREIGHT.sentinelChecks)]);
  const freightModelId = freightModel.rows[0].id;

  // ── projects ──
  const financeEmail = 's.iyer@meridiangroup.com';
  const projectIds: Record<string, string> = {};
  for (const p of PROJECTS) {
    const tp = timeProbabilityAdjusted({ annualUsdK: p.annualK, probabilityPct: p.probabilityPct, savingsStart: p.savingsStart });
    const cf = carryForward({ annualUsdK: p.annualK, probabilityPct: p.probabilityPct, savingsStart: p.savingsStart });
    const r = await q(
      `INSERT INTO projects (tenant_id, name, description, bu, country, pnl_element, lever, lead_id, lead_name, team,
         finance_lead_id, finance_lead_name, stage, annual_savings_usd_k, probability_pct, savings_start,
         tp_adjusted_usd_k, carry_forward_usd_k, milestones, meetings, classification, needs_new_supplier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`,
      [tenantId, p.name, p.description, p.bu, p.country, p.pnl, p.lever,
        userIds[p.leadEmail], userNames[p.leadEmail] ?? p.leadEmail, JSON.stringify(p.team),
        userIds[financeEmail], userNames[financeEmail], p.stage, p.annualK, p.probabilityPct, p.savingsStart,
        tp, cf,
        JSON.stringify(p.milestones.map((m, i) => ({ id: `m${i + 1}`, name: m[0], owner: m[1], due: null, pct: m[2] }))),
        JSON.stringify(p.meetings.map((m, i) => ({ id: `mt${i + 1}`, name: m[0], date: m[1], momAttachment: 'MoM attached' }))),
        p.classification ?? null, p.needsNewSupplier]);
    projectIds[p.key] = r.rows[0].id;
  }
  await q('UPDATE should_cost_models SET project_id=$2 WHERE id=$1', [bagModelId, projectIds['bag']]);
  await q('UPDATE should_cost_models SET project_id=$2 WHERE id=$1', [freightModelId, projectIds['freight']]);
  await q('UPDATE projects SET should_cost_model_id=$2 WHERE id=$1', [projectIds['bag'], bagModelId]);
  await q('UPDATE projects SET should_cost_model_id=$2 WHERE id=$1', [projectIds['freight'], freightModelId]);

  // ── FFG decisions + G3 gates ──
  for (const f of FFG_CASES) {
    const pid = projectIds[f.projectKey];
    const signatures = f.signedBy.map((email, i) => ({
      userId: userIds[email], userName: userNames[email],
      role: i === 0 ? (email.includes('dsouza') ? 'pm' : 'pm') : 'manager',
      ts: '2026-07-15T10:00:00Z',
      decision: f.decision ?? 'proceed', note: null, channel: 'web',
    }));
    // NOTE: seeded signatures represent historical human decisions (test users) — no gate is auto-signed by code paths.
    const gate = await q(
      `INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, signatures, status)
       VALUES ($1,'G3','project',$2,$3,2,$4,$5) RETURNING id`,
      [tenantId, pid, ['pm', 'manager'], JSON.stringify(signatures), f.decision ? 'signed' : 'open']);
    await q(
      `UPDATE projects SET ffg_decision=$2, classification=$3 WHERE id=$1`,
      [pid, JSON.stringify({
        verdict: f.verdict, classification: f.classification, redesignProposal: f.redesignProposal,
        tests: f.tests.map((t) => ({ ...t, provenance: [] })),
        decision: f.decision, gateRef: gate.rows[0].id,
      }), f.classification]);
  }

  // ── other open gates ──
  await q(`INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, status)
           VALUES ($1,'G0','spend_base',$2,$3,1,'open')`, [tenantId, tenantId, ['owner', 'finance']]);
  await q(`INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, status)
           VALUES ($1,'G2','should_cost_model',$2,$3,1,'open')`, [tenantId, bagModelId, ['analyst', 'pm']]);

  // ── Procura event (freight, live at distribute_bids) ──
  const pe = await q(
    `INSERT INTO procura_events (tenant_id, project_ref, should_cost_target_usd, should_cost_model_ref, baseline_usd, stage, crew_outputs, evaluation_matrix, bids, log)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [tenantId, projectIds['freight'], PROCURA_FREIGHT.shouldCostTargetUsd, freightModelId, PROCURA_FREIGHT.baselineUsd,
      PROCURA_FREIGHT.stage, JSON.stringify(PROCURA_FREIGHT.crewOutputs), JSON.stringify(PROCURA_FREIGHT.evaluationMatrix),
      JSON.stringify(PROCURA_FREIGHT.bids.map((b) => ({ ...b, amountUsd: null, unit: null, tcoUsd: null, supplierMarginPct: null, subFloor: false, notes: null }))),
      JSON.stringify(PROCURA_FREIGHT.log)]);
  const procuraId = pe.rows[0].id;
  await q('UPDATE projects SET procura_event_id=$2 WHERE id=$1', [projectIds['freight'], procuraId]);

  // signed Procura gates (historical human decisions by test users)
  await q(
    `INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, signatures, status)
     VALUES ($1,'P-INTAKE','procura_event',$2,$3,1,$4,'signed')`,
    [tenantId, procuraId, ['procurement', 'manager', 'pm'],
      JSON.stringify([{ userId: userIds['sc.director@meridiangroup.com'], userName: 'Supply Chain Director', role: 'manager', ts: '2026-07-02T09:00:00Z', decision: 'approve', note: 'Scope, incumbent set and timeline confirmed', channel: 'web' }])]);
  await q(
    `INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, signatures, status)
     VALUES ($1,'P-RFP','procura_event',$2,$3,1,$4,'signed')`,
    [tenantId, procuraId, ['procurement', 'manager'],
      JSON.stringify([{ userId: userIds['a.dsouza@meridiangroup.com'], userName: "A. D'Souza", role: 'procurement', ts: '2026-07-21T09:00:00Z', decision: 'approve', note: 'RFP + locked matrix approved for distribution', channel: 'web' }])]);

  // ── agent activity rows ──
  for (const a of AGENT_ACTIVITY) {
    await q(
      `INSERT INTO agent_runs (tenant_id, agent, trigger, status, outputs, model_used, provenance)
       VALUES ($1,$2,'coach','complete',$3,'demo-engine','[]')`,
      [tenantId, a.agent, JSON.stringify({ note: a.note })]);
  }

  // ── Lever Council session for the freight project ──
  await q(
    `INSERT INTO council_sessions (tenant_id, project_ref, participants, transcript, consensus, dissent, recorded_by, human_decision)
     VALUES ($1,$2,$3,$4,$5,$6,'SCRIBE',$7)`,
    [tenantId, projectIds['freight'],
      JSON.stringify(['LEVER', 'PULSE', 'SENTINEL', 'FUEL FOR GROWTH', 'CUBE', 'The Recommender']),
      JSON.stringify([
        { agent: 'LEVER', stance: 'Consolidation to one carrier maximises rate leverage but concentrates the lane; recommend Right Source with a two-carrier structure.', levers: ['RightSource', 'Consolidate'], provenance: [] },
        { agent: 'SENTINEL', stance: 'The −18% single-carrier quote models 2.1% margin — below the 8% floor. That is supply risk, not savings.', levers: ['RightSource'], provenance: [{ source: 'SwiftHaul bid model', asOf: '2026-06-28' }] },
        { agent: 'PULSE', stance: 'Corridor pricing supports $158–176/lane; a competitive two-carrier event should land near $171 sustainably.', levers: ['Price', 'RightSource'], provenance: [{ source: 'Corridor rate survey', asOf: '2026-07-10' }] },
        { agent: 'FUEL FOR GROWTH', stance: 'Growth plan depends on this lane. Single-carrier dependence fails the supply-continuity test.', levers: ['RightSource'], provenance: [] },
        { agent: 'CUBE', stance: 'Lane is 49% of freight spend; price driver dominates the YoY delta.', levers: ['Price'], provenance: [] },
        { agent: 'The Recommender', stance: 'Run a full sourcing event with the locked matrix; two-carrier 60/40 award recommended structure.', levers: ['RightSource'], provenance: [] },
      ]),
      'Convert to a two-carrier Right-Source Procura event with should-cost target $171/lane.',
      'LEVER notes single-carrier consolidation would yield ~2pp more rate reduction if risk were acceptable — recorded as dissent.',
      JSON.stringify({ userId: userIds['a.dsouza@meridiangroup.com'], userName: "A. D'Souza", lever: 'RightSource', note: 'Two-carrier structure approved', ts: '2026-07-01T12:00:00Z' })]);

  // ── audit trail for the seeded historical signatures ──
  const audit = (actor: string, action: string, objectType: string, ref: string, payload: object) =>
    q(`SELECT audit_append($1,$2,$3,'web',$4,$5,$6,$7)`,
      [tenantId, userIds[actor], userNames[actor], action, objectType, ref, JSON.stringify(payload)]);
  await audit('sc.director@meridiangroup.com', 'gate.sign', 'procura_event', procuraId, { gateId: 'P-INTAKE', decision: 'approve' });
  await audit('a.dsouza@meridiangroup.com', 'gate.sign', 'procura_event', procuraId, { gateId: 'P-RFP', decision: 'approve' });
  await audit('k.menon@meridiangroup.com', 'gate.sign', 'project', projectIds['bag'], { gateId: 'G3', decision: 'proceed' });
  await audit('retail.ops@meridiangroup.com', 'gate.sign', 'project', projectIds['bag'], { gateId: 'G3', decision: 'proceed' });

  console.log('✓ Meridian Group demo tenant seeded');
  console.log(`  Sign in as k.menon@meridiangroup.com / ${DEMO_PASSWORD} (or s.iyer, a.dsouza, retail.ops, sc.director, admin @meridiangroup.com)`);
  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
