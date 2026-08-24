/**
 * Canonical agent roster (PRD §5.1). Names are invariant.
 */
import type { AgentName } from '@eof/domain';

export interface AgentDef {
  name: AgentName;
  family: 'eof' | 'procura' | 'orchestrator';
  stage: string;
  role: string;
  mandate: string;
  consumes: string;
  produces: string;
  promptFile: string;
  /** Tool allow-list — agents can NEVER call gate-signing mutations. */
  tools: string[];
}

export const ROSTER: AgentDef[] = [
  {
    name: 'COACH', family: 'orchestrator', stage: 'Orchestrator', role: 'Orchestrator',
    mandate: 'Runs the whole value stream: sequences the crew, enforces every human gate, opens Procura events when a project converts, and loops the stream back to Stage 00 on fresh data.',
    consumes: 'gate outcomes & programme state', produces: 'stage hand-offs, Procura event briefs, audit trail',
    promptFile: 'coach.md', tools: ['spend.query', 'project.read', 'agentrun.enqueue'],
  },
  {
    name: 'SCALE', family: 'eof', stage: 'Stage 00', role: 'Data wrangler',
    mandate: 'Ingests ERP/accounting feeds and uploads; deduplicates, classifies to the taxonomy and reconciles to the trial balance.',
    consumes: 'raw GL/AP/PO feeds, scans (OCR)', produces: 'the clean spend base for G0',
    promptFile: 'scale.md', tools: ['spend.ingest', 'spend.classify'],
  },
  {
    name: 'CUBE', family: 'eof', stage: 'Stage 01', role: 'Cube builder',
    mandate: 'Builds the Volume × Price spend cube with drill-down by category, supplier, invoice, department, brand, BU and geography.',
    consumes: 'the clean spend base', produces: 'the drillable spend tree',
    promptFile: 'cube.md', tools: ['spend.query', 'tree.materialise'],
  },
  {
    name: 'LENS', family: 'eof', stage: 'Stage 01', role: 'Insight hunter',
    mandate: 'Surfaces anomalies, price-variance and demand outliers; ranks opportunities by spend × volatility × savings potential.',
    consumes: 'the cube', produces: 'the ranked opportunity shortlist for G1',
    promptFile: 'lens.md', tools: ['spend.query', 'benchmark.lookup'],
  },
  {
    name: 'SCOPE', family: 'eof', stage: 'Stage 02', role: 'Cost architect',
    mandate: 'Asks the zero-based question first, then structures the clean-sheet: what the cost is made of, element by element.',
    consumes: 'spec packs & shortlist', produces: 'the cost structure',
    promptFile: 'scope.md', tools: ['shouldcost.read', 'shouldcost.write_agent_layer'],
  },
  {
    name: 'PULSE', family: 'eof', stage: 'Stage 02', role: 'Market analyst',
    mandate: 'Prices each element off indices and market quotes with as-of dates — directionally right beats falsely precise.',
    consumes: 'indices, quotes, rate cards', produces: 'priced inputs with provenance',
    promptFile: 'pulse.md', tools: ['benchmark.lookup', 'shouldcost.write_agent_layer'],
  },
  {
    name: 'FORGE', family: 'eof', stage: 'Stage 02', role: 'Model builder',
    mandate: 'Assembles the formula-driven cost stack; analyst edits are preserved as their own layer and never overwritten.',
    consumes: 'SCOPE structure + PULSE rates', produces: 'the editable should-cost stack',
    promptFile: 'forge.md', tools: ['shouldcost.write_agent_layer'],
  },
  {
    name: 'SENTINEL', family: 'eof', stage: 'Stages 02–03', role: 'Guardrail & benchmarker',
    mandate: "Benchmarks against strategic look-alikes, industry look-alikes and internal peers; enforces the fair-margin floor — sub-floor 'savings' are supply risk, not wins.",
    consumes: 'stacks + benchmark libraries', produces: 'ok/amber/red checks & gap-to-benchmark tables',
    promptFile: 'sentinel.md', tools: ['benchmark.lookup', 'shouldcost.write_checks'],
  },
  {
    name: 'FUEL FOR GROWTH', family: 'eof', stage: 'Stage 03 · Gate G3', role: 'Growth guardian',
    mandate: 'Runs the Fuel-for-Growth gate: five evidence-based tests to classify every idea FAT, MUSCLE or BONE — and proposes redesigns that keep the saving without cutting muscle. Testifies only; the PM and business Manager dual-sign the decision.',
    consumes: 'savings ideas + POS/ops/supplier evidence', produces: 'classifications, redesign proposals, G3 evidence packs',
    promptFile: 'fuel_for_growth.md', tools: ['spend.query', 'benchmark.lookup', 'project.read'],
  },
  {
    name: 'LEVER', family: 'eof', stage: 'Stage 04', role: 'Strategist',
    mandate: 'Maps every cleared gap to one of the seven levers, applies the Eye on Fat sourcing model, sizes ideas with calculators and drafts the negotiation talk-track or business case.',
    consumes: 'bridges + gaps + sourcing assessment', produces: 'the sized savings-idea backlog',
    promptFile: 'lever.md', tools: ['project.read', 'calculator.run'],
  },
  {
    name: 'PILOT', family: 'eof', stage: 'Stage 05', role: 'Programme manager',
    mandate: 'Turns committed ideas into projects with owners, milestones and blocker escalation across teams, brands, BUs and geographies.',
    consumes: 'the committed pipeline', produces: 'live project boards and blocker alerts',
    promptFile: 'pilot.md', tools: ['project.read', 'project.write_milestones'],
  },
  {
    name: 'SCRIBE', family: 'eof', stage: 'Stage 05', role: 'Reporter',
    mandate: 'Maintains the Pipeline → Forecast → Committed funnel, month-wise phasing, BU/Country and P&L-element splits, and the steal-with-pride playbook library.',
    consumes: 'project status + finance actuals', produces: 'SteerCo reporting and playbooks',
    promptFile: 'scribe.md', tools: ['project.read', 'report.build'],
  },
  {
    name: 'The Researcher', family: 'procura', stage: 'Procura Crew', role: 'Market intelligence',
    mandate: 'Builds the supplier long-list, market structure and expected price band — anchored to the should-cost target handed over from the project.',
    consumes: 'project brief + should-cost target', produces: 'long-list & price-band intel',
    promptFile: 'procura_researcher.md', tools: ['benchmark.lookup', 'procura.write_outputs'],
  },
  {
    name: 'The RFP Architect', family: 'procura', stage: 'Procura Crew', role: 'RFP designer',
    mandate: 'Drafts the RFP with the evaluation matrix locked before distribution; nothing is sent without human sign-off.',
    consumes: 'long-list + spec pack', produces: 'the signed-off RFP',
    promptFile: 'procura_rfp_architect.md', tools: ['procura.write_outputs'],
  },
  {
    name: 'The Bid Handler', family: 'procura', stage: 'Procura Crew', role: 'Bid manager',
    mandate: 'Distributes, runs Q&A with an equal-information rule, logs bids sealed until deadline, then scores against the locked matrix.',
    consumes: 'the RFP + bids', produces: 'scored bid comparisons & TCO models',
    promptFile: 'procura_bid_handler.md', tools: ['procura.write_outputs', 'procura.log_bid'],
  },
  {
    name: 'The Recommender', family: 'procura', stage: 'Procura Crew', role: 'Award adviser',
    mandate: 'Builds the award recommendation with reasoning, sensitivity and negotiation levers — the Crew never awards; you do.',
    consumes: 'evaluation output', produces: 'the recommendation for the human award gate',
    promptFile: 'procura_recommender.md', tools: ['procura.write_outputs'],
  },
];

export const rosterByName = new Map(ROSTER.map((a) => [a.name, a]));
