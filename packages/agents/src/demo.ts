/**
 * Deterministic demo engine — used when no LLM provider key is configured.
 * Produces grounded, schema-correct outputs mirroring the reference prototype,
 * so the whole product (COACH runs, council, Procura crew) demos offline.
 */
import type { DemoResolver } from '@eof/model-gw';

const ASOF = '2026-08-04';

const OUTPUTS: Record<string, (ctx: string) => object> = {
  COACH: () => ({
    nextSteps: [{ agent: 'SCALE', title: 'Refresh & reconcile the spend base', reason: 'Fresh close data available' }],
    pauseAtGate: null,
    narration: 'Sequencing the crew for this project; pausing at every human gate.',
  }),
  SCALE: () => ({
    classified: [{ row: 1, category: ['Logistics & freight', 'Line-haul'], supplier: 'TransGulf Lines', confidence: 0.97 }],
    duplicates: [],
    completenessPct: 87,
    provenance: [{ source: 'SAP B1 July GL extract', asOf: ASOF }],
  }),
  CUBE: () => ({
    nodes: [{ name: 'Logistics & freight', amountUsdK: 7900, volumeShare: 48, priceShare: 52 }],
    provenance: [{ source: 'spend_records aggregate', asOf: ASOF }],
  }),
  LENS: () => ({
    flags: [
      { node: 'SwiftHaul USA', kind: 'price_variance', label: 'rate −18% quote models 2.1% carrier margin — below floor', severity: 'red', evidence: 'Quote decomposition vs corridor cost model' },
      { node: 'TransGulf Lines', kind: 'concentration', label: 'single-lane dependence UAE–KSA', severity: 'amber', evidence: '49% of freight spend on one lane' },
    ],
    opportunityRanking: [{ node: 'Logistics & freight', score: 118.5, rationale: 'spend × volatility × savings potential' }],
    provenance: [{ source: 'Corridor rate survey', asOf: '2026-07-10' }],
  }),
  SCOPE: () => ({
    zbc: { outcome: 'exists_justified', rationale: 'Core replenishment lane; volumes validated against store network plan.' },
    structure: [
      { name: 'Fuel & tolls', note: 'index-linked' }, { name: 'Driver & crew', note: '' },
      { name: 'Equipment & maintenance', note: '' }, { name: 'Insurance & compliance', note: '' },
      { name: 'Overheads', note: 'absorbed' }, { name: 'Fair carrier margin (floor 8%)', note: 'policy' },
    ],
    provenance: [{ source: 'Spec pack v3', asOf: '2026-06-15' }],
  }),
  PULSE: () => ({
    pricing: [
      { element: 'Fuel & tolls', valueUsd: 68, bandLowUsd: 64, bandHighUsd: 72, source: 'Platts diesel MENA', asOf: '2026-06-20' },
      { element: 'Driver & crew', valueUsd: 41, bandLowUsd: 38, bandHighUsd: 45, source: 'Regional wage benchmark', asOf: '2026-06-15' },
    ],
    provenance: [{ source: 'Platts diesel MENA', asOf: '2026-06-20' }],
  }),
  FORGE: () => ({
    stack: [
      { name: 'Fuel & tolls', agentValue: 68, formula: 'distance_km × consumption × diesel_index' },
      { name: 'Driver & crew', agentValue: 41, formula: 'trip_hours × crew_rate' },
    ],
    totalUsd: 171,
    provenance: [{ source: 'SCOPE structure + PULSE pricing', asOf: ASOF }],
  }),
  SENTINEL: () => ({
    checks: [
      { check: 'Rate / lane', model: '$171', benchmark: 'Corridor band $158–$176', status: 'ok' },
      { check: 'Carrier margin (−18% quote)', model: '2.1%', benchmark: 'Floor 8.0%', status: 'red' },
    ],
    subFloorFindings: ['SwiftHaul −18% quote models carrier margin 2.1% — below the 8% fair-margin floor. Supply risk, not savings.'],
    provenance: [{ source: 'Bid decomposition model', asOf: '2026-06-28' }],
  }),
  'FUEL FOR GROWTH': () => ({
    tests: [
      { test: 'Customer experience', score: 75, tone: 'amber', evidence: 'OTIF risk if the single carrier fails on the UAE–KSA lane.' },
      { test: 'Quality & spec integrity', score: 80, tone: 'lean', evidence: 'Service spec unchanged on paper.' },
      { test: 'Growth capacity', score: 66, tone: 'amber', evidence: 'Growth plan depends on the very lane being concentrated.' },
      { test: 'Supply continuity', score: 22, tone: 'fat', evidence: '−18% quote models carrier at 2.1% net margin — below the fair-margin floor; single-carrier dependence.' },
      { test: 'Brand, safety & compliance', score: 82, tone: 'lean', evidence: 'No exposure.' },
    ],
    classification: 'BONE',
    verdict: 'The −18% quote models the carrier below the fair-margin floor and creates single-carrier dependence on the lane your growth depends on. This is bone.',
    redesignProposal: 'Two-carrier Right-Source event with should-cost target loaded into the RFQ.',
    provenance: [{ source: 'POS/ops evidence pack', asOf: ASOF }],
  }),
  LEVER: () => ({
    lever: 'RightSource',
    sizingUsdK: 140,
    calculator: { baselineUsdPerLane: 189, targetUsdPerLane: 171, lanesPerYear: 7800 },
    talkTrack: 'Anchor on the frozen should-cost of $171/lane; structure a two-carrier 60/40 award to keep resilience while capturing the corridor band.',
    provenance: [{ source: 'Frozen should-cost model v1', asOf: '2026-07-02' }],
  }),
  PILOT: () => ({
    milestones: [
      { name: 'Bids in & evaluated', owner: 'Crew', due: '2026-08-28' },
      { name: 'Award & contract', owner: 'Director', due: '2026-09-15' },
    ],
    blockers: ['2 bids outstanding — clarification round closes Wednesday'],
    escalations: [],
    provenance: [{ source: 'Bid log', asOf: '2026-08-15' }],
  }),
  SCRIBE: () => ({
    funnel: { pipeline: 292, forecast: 327, committed: 263 },
    phasing: [{ month: 'Aug', pipeline: 290, forecast: 240, committed: 260 }],
    narrative: 'Committed savings up on bag-gauge rollout; freight event on track for a September award.',
    provenance: [{ source: 'projects table', asOf: ASOF }],
  }),
  'The Researcher': () => ({
    longList: [
      { supplier: 'TransGulf Lines', capability: 'Incumbent, deep UAE–KSA coverage', risk: 'Lane concentration' },
      { supplier: 'Desert Bridge Logistics', capability: 'Mid-tier challenger, strong OTIF', risk: 'Limited reefer fleet' },
      { supplier: 'Falcon Freight KSA', capability: 'KSA-side depth, customs pre-clearance', risk: 'UAE pickup network thinner' },
    ],
    marketStructure: 'Loose oligopoly on the primary lane with credible mid-tier challengers.',
    priceBand: { lowUsd: 158, highUsd: 176 },
    shouldCostAnchorUsd: 171,
    provenance: [{ source: 'Corridor rate survey', asOf: '2026-07-10' }, { source: 'Frozen should-cost model v1', asOf: '2026-07-02' }],
  }),
  'The RFP Architect': () => ({
    rfpSections: ['Scope & lanes', 'Service levels & OTIF', 'Pricing template anchored to should-cost $171/lane', 'Two-carrier 60/40 award structure', 'Equal-information Q&A rules'],
    evaluationMatrix: {
      criteria: [
        { name: 'Total cost of ownership (vs should-cost $171/lane)', weightPct: 40 },
        { name: 'Lane coverage & capacity resilience', weightPct: 20 },
        { name: 'OTIF track record', weightPct: 15 },
        { name: 'Financial health & fair-margin sustainability', weightPct: 15 },
        { name: 'Sustainability & compliance', weightPct: 10 },
      ],
    },
    provenance: [{ source: 'Researcher long-list + spec pack', asOf: '2026-07-18' }],
  }),
  'The Bid Handler': () => ({
    distribution: { sentTo: 6, date: '2026-07-21' },
    qa: [{ q: 'Fuel surcharge mechanism?', a: 'Indexed to Platts diesel MENA, published to all bidders.' }],
    bidStatus: [
      { supplier: 'TransGulf Lines', received: true }, { supplier: 'Desert Bridge Logistics', received: true },
      { supplier: 'Falcon Freight KSA', received: true }, { supplier: 'Red Sea Carriers', received: true },
      { supplier: 'SwiftHaul USA', received: false }, { supplier: 'GulfLink Haulage', received: false },
    ],
    scores: null,
    provenance: [{ source: 'Bid log', asOf: '2026-08-15' }],
  }),
  'The Recommender': () => ({
    recommendation: {
      suppliers: ['Desert Bridge Logistics (60%)', 'Falcon Freight KSA (40%)'],
      structure: 'Two-carrier 60/40 with annual rebalancing on OTIF',
      reasoning: 'Best TCO inside the corridor band at sustainable carrier margins; resilience preserved on the growth lane.',
    },
    sensitivity: ['±5% diesel moves TCO ±1.9%', 'Single-carrier award would save 2pp more at unacceptable continuity risk'],
    negotiationLevers: ['Volume commitment banding', 'Fuel-index collar', 'Backhaul utilisation'],
    provenance: [{ source: 'Locked evaluation matrix scoring', asOf: '2026-08-25' }],
  }),
  COUNCIL: () => ({
    stances: [
      { agent: 'LEVER', stance: 'Right Source with a two-carrier structure captures the corridor band without concentrating the lane.', levers: ['RightSource', 'Consolidate'], provenance: [{ source: 'Sourcing model', asOf: ASOF }] },
      { agent: 'PULSE', stance: 'Corridor pricing supports $158–176/lane; a competitive event lands near $171 sustainably.', levers: ['Price', 'RightSource'], provenance: [{ source: 'Corridor rate survey', asOf: '2026-07-10' }] },
      { agent: 'SENTINEL', stance: 'The −18% single-carrier quote is below the fair-margin floor — supply risk, not savings.', levers: ['RightSource'], provenance: [{ source: 'Bid decomposition', asOf: '2026-06-28' }] },
      { agent: 'FUEL FOR GROWTH', stance: 'Single-carrier dependence fails supply continuity; growth depends on this lane.', levers: ['RightSource'], provenance: [{ source: 'FFG evidence pack', asOf: ASOF }] },
      { agent: 'CUBE', stance: 'Price driver dominates the YoY delta on this lane (52% price share).', levers: ['Price'], provenance: [{ source: 'Volume × Price cube', asOf: ASOF }] },
      { agent: 'The Recommender', stance: 'Run the full sourcing event against the locked matrix; recommend two-carrier 60/40.', levers: ['RightSource'], provenance: [{ source: 'Event design', asOf: ASOF }] },
    ],
    consensus: 'Push Right Source: two-carrier event anchored to the frozen should-cost.',
    dissent: 'LEVER notes ~2pp more rate reduction available from single-carrier consolidation if risk were acceptable.',
  }),
};

/** Match the agent header in the rendered prompt (e.g. "# SENTINEL — …"). */
export const demoResolver: DemoResolver = (req) => {
  const text = req.messages.map((m) => m.content).join('\n');
  if (/# Lever Council/.test(text)) return JSON.stringify(OUTPUTS.COUNCIL(text));
  const m = text.match(/^# (.+?) — /m);
  const key = m?.[1]?.trim() ?? '';
  const fn = OUTPUTS[key];
  if (fn) return JSON.stringify(fn(text));
  return JSON.stringify({ refusal: 'insufficient data', missing: ['no demo corpus for this agent'] });
};
