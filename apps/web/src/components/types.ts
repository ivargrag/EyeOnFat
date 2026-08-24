/** Shared view-model types for the web app (shapes served by the API). */

export interface ProjectVM {
  id: string; name: string; description: string; bu: string; country: string;
  fn: string | null; brand: string | null; pnlElement: string; lever: string;
  leadName: string; team: string[]; financeLeadName: string; stage: string;
  annualSavingsUsdK: number; probabilityPct: number;
  savingsStart: string | null; savingsEnd: string | null;
  timeProbabilityAdjustedUsdK: number; carryForwardUsdK: number;
  costToAchieve: { oneTimeUsdK: number; recurringUsdK: number; notes: string | null };
  milestones: Array<{ id: string; name: string; owner: string; due: string | null; pct: number }>;
  meetings: Array<{ id: string; name: string; date: string | null; momAttachment: string | null }>;
  classification: string | null;
  ffgDecision: { verdict: string; decision: string | null } | null;
  needsNewSupplier: boolean; procuraEventId: string | null;
  duplicatedFrom: string | null; shouldCostModelId: string | null;
  procuraEligible?: boolean;
}

export interface GateVM {
  id: string; gateId: string; status: string;
  signatures: Array<{ userName: string; role: string; decision: string; ts: string; note: string | null }>;
  requiredRoles: string[]; requiredDistinctSignatures: number;
}

export interface ProcuraVM {
  id: string; projectRef: string; stage: string;
  shouldCostTargetUsd: number | null; baselineUsd: number | null;
  crewOutputs: Record<string, Array<{ title: string; body: string; data: Record<string, unknown> | null; provenance: Array<{ source: string; asOf: string }> }>>;
  evaluationMatrix: { criteria: Array<{ name: string; weightPct: number }>; lockedAt: string | null };
  bids: Array<{ id: string; supplier: string; receivedAt: string | null; sealed: boolean; amountUsd?: number | null; tcoUsd?: number | null; supplierMarginPct?: number | null; subFloor?: boolean }>;
  award: { decision: string; signerName: string; ts: string } | null;
  log: Array<{ ts: string; line: string }>;
}

export interface CouncilVM {
  id: string; participants: string[];
  transcript: Array<{ agent: string; stance: string; levers: string[] }>;
  consensus: string | null; dissent: string | null; recordedBy: string;
  humanDecision: { userName: string; lever: string; note: string | null; ts: string } | null;
  createdAt: string;
}

export interface RunVM {
  id: string; status: string;
  steps: Array<{ idx: number; agent: string; title: string; status: string; detail: string | null; gateId: string | null }>;
}

export const PSTAGES: Array<{ key: string; n: string; ag: string; gate: boolean; d: string }> = [
  { key: 'intake', n: 'Intake & scope', ag: 'COACH → Crew', gate: true, d: 'Project brief, category spec pack and the should-cost target hand off from Eye on Fat into the Procura event. Human gate: the category owner confirms scope, incumbent set and timeline.' },
  { key: 'research', n: 'Market research', ag: 'RESEARCHER', gate: false, d: 'Supplier long-list with capability & risk notes, market structure, expected price band anchored to the should-cost, and switching-cost intelligence.' },
  { key: 'rfp_build', n: 'RFP build', ag: 'RFP ARCHITECT', gate: true, d: 'Drafts the RFP with the evaluation matrix locked before distribution; should-cost target and spec tolerances embedded. Human gate: RFP sign-off — nothing is sent until you approve.' },
  { key: 'distribute_bids', n: 'Distribute & bids', ag: 'BID HANDLER', gate: false, d: 'Distributes to the approved shortlist, runs Q&A and clarifications with an equal-information rule, and logs bids as received — no peeking before the deadline.' },
  { key: 'evaluation', n: 'Evaluation', ag: 'BID HANDLER → RECOMMENDER', gate: false, d: 'Scores every bid against the locked matrix; builds a TCO model per bid; anomalies (e.g. sub-margin-floor pricing) escalate to SENTINEL.' },
  { key: 'recommendation', n: 'Recommendation', ag: 'RECOMMENDER', gate: true, d: 'Award recommendation with reasoning, sensitivity and negotiation levers. Human gate: the award decision is always yours — the Crew never awards.' },
  { key: 'award', n: 'Award & handback', ag: 'COACH', gate: true, d: 'Award signed by the accountable manager; contract terms and realised savings write back into this Eye on Fat project; SCRIBE updates the Pipeline → Forecast → Committed funnel.' },
  { key: 'complete', n: 'Complete', ag: 'SCRIBE', gate: false, d: 'Event complete — savings written back to the project.' },
];
