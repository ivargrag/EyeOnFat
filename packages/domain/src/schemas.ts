/**
 * Canonical domain objects — PRD §3. These zod schemas are the single source
 * of truth for API validation, OpenAPI generation and the web client.
 * All monetary amounts are stored in base USD (thousands unless noted).
 */
import { z } from 'zod';
import {
  AgentNameSchema, AgentRunStatusSchema, ClassificationSchema, CurrencySchema,
  GateIdSchema, LeverSchema, ProcuraStageSchema, RoleSchema, StageSchema,
} from './enums.js';

export const Uuid = z.string().uuid();
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const IsoDateTime = z.string();

/** Provenance entry — every agent output must carry these (P6). */
export const ProvenanceSchema = z.object({
  source: z.string(),           // e.g. "ICIS SE-Asia resin index", "spend_records rows 1024-1187"
  ref: z.string().optional(),   // row ids / document pointer / url
  asOf: IsoDate,                // as-of date of the underlying data
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/* ───────────────────────── SpendRecord ───────────────────────── */

export const SpendRecordSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  source: z.string(),                      // connector key or upload filename
  supplier: z.string(),
  category: z.array(z.string()).max(8),    // 8-level taxonomy path
  bu: z.string(),
  country: z.string(),
  fn: z.string().nullable(),               // function/department
  brand: z.string().nullable(),
  invoiceRef: z.string().nullable(),
  date: IsoDate,
  volume: z.number().nullable(),
  unitPrice: z.number().nullable(),
  amountUsd: z.number(),                   // base USD (absolute, not 000s)
  currency: CurrencySchema,
  fxRateAsOf: IsoDate.nullable(),
  lineage: z.object({ documentId: z.string().nullable(), page: z.number().nullable() }).nullable(),
});
export type SpendRecord = z.infer<typeof SpendRecordSchema>;

/* ───────────────────────── SpendNode (Spend Tree) ───────────────────────── */

export const LensFlagSchema = z.object({
  kind: z.enum(['price_variance', 'duplicate', 'tail_fragmentation', 'over_spec', 'concentration', 'other']),
  label: z.string(),                       // e.g. "price var 22%", "dup licences"
  severity: z.enum(['info', 'amber', 'red']),
  evidence: z.string().optional(),
});
export type LensFlag = z.infer<typeof LensFlagSchema>;

export const SpendNodeSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  parentId: Uuid.nullable(),
  level: z.enum(['category', 'supplier', 'invoice']),
  name: z.string(),
  amountUsdK: z.number(),                  // annual spend, 000s USD
  volumeShare: z.number().min(0).max(100), // driver split — volumeShare + priceShare = 100
  priceShare: z.number().min(0).max(100),
  lensFlags: z.array(LensFlagSchema),
  insight: z.string().nullable(),
  opportunityRank: z.number().nullable(),  // spend × volatility × savings potential
  recordCount: z.number().int(),
});
export type SpendNode = z.infer<typeof SpendNodeSchema>;

/* ───────────────────────── ShouldCostModel ───────────────────────── */

export const CostElementSchema = z.object({
  name: z.string(),
  agentValue: z.number().nullable(),       // agent layer — never mutated by analyst edits
  agentProvenance: z.array(ProvenanceSchema).default([]),
  analystValue: z.number().nullable(),     // analyst layer — never overwritten by agents
  formula: z.string().nullable(),
});
export type CostElement = z.infer<typeof CostElementSchema>;

export const SentinelCheckSchema = z.object({
  check: z.string(),
  model: z.string(),
  benchmark: z.string(),
  status: z.enum(['ok', 'amber', 'red']),
});
export type SentinelCheck = z.infer<typeof SentinelCheckSchema>;

export const ShouldCostModelSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  item: z.string(),
  unit: z.string(),                         // e.g. "per 1,000 bags"
  zbcChallenge: z.object({
    question: z.string(),
    outcome: z.enum(['exists_justified', 'reduce', 'eliminate', 'pending']),
    rationale: z.string().nullable(),
  }),
  structure: z.array(CostElementSchema),
  currentPriceUsd: z.number(),
  fairMarginFloorPct: z.number(),
  sentinelChecks: z.array(SentinelCheckSchema),
  status: z.enum(['draft', 'g2_signed']),
  frozenVersion: z.number().int().nullable(), // set at G2; frozen versions are the only referencable ones
  projectId: Uuid.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ShouldCostModel = z.infer<typeof ShouldCostModelSchema>;

/* ───────────────────────── Gate ───────────────────────── */

export const GateSignatureSchema = z.object({
  userId: Uuid,
  userName: z.string(),
  role: RoleSchema,
  ts: IsoDateTime,
  decision: z.enum(['approve', 'proceed', 'hold', 'reject']),
  note: z.string().nullable(),
  channel: z.enum(['web', 'teams', 'slack', 'email']).default('web'),
});
export type GateSignature = z.infer<typeof GateSignatureSchema>;

export const GateSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  gateId: GateIdSchema,
  objectType: z.enum(['tenant', 'project', 'should_cost_model', 'procura_event', 'spend_base']),
  objectRef: Uuid,
  requiredRoles: z.array(RoleSchema),
  requiredDistinctSignatures: z.number().int().min(1),
  signatures: z.array(GateSignatureSchema),
  status: z.enum(['open', 'signed', 'rejected', 'held']),
  createdAt: IsoDateTime,
});
export type Gate = z.infer<typeof GateSchema>;

/* ───────────────────────── FFG decision ───────────────────────── */

export const FfgTestResultSchema = z.object({
  test: z.string(),
  score: z.number().min(0).max(100),
  tone: z.enum(['lean', 'amber', 'fat']),
  evidence: z.string(),
  provenance: z.array(ProvenanceSchema).default([]),
});
export type FfgTestResult = z.infer<typeof FfgTestResultSchema>;

export const FfgDecisionSchema = z.object({
  verdict: z.string(),                     // agent verdict text
  classification: ClassificationSchema.nullable(),
  redesignProposal: z.string().nullable(), // when MUSCLE/BONE
  tests: z.array(FfgTestResultSchema),
  decision: z.enum(['proceed', 'hold', 'reject']).nullable(),
  gateRef: Uuid.nullable(),                // the G3 gate carrying the two signatures
});
export type FfgDecision = z.infer<typeof FfgDecisionSchema>;

/* ───────────────────────── Project (Idea/Project — one object) ───────────────────────── */

export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  owner: z.string(),
  due: IsoDate.nullable(),
  pct: z.number().min(0).max(100),
});
export type Milestone = z.infer<typeof MilestoneSchema>;

export const MeetingSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: IsoDate.nullable(),
  momAttachment: z.string().nullable(),    // object-store key
});
export type Meeting = z.infer<typeof MeetingSchema>;

export const ProjectSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  name: z.string().min(1),
  description: z.string().default(''),
  bu: z.string(),
  country: z.string(),
  fn: z.string().nullable(),
  brand: z.string().nullable(),
  pnlElement: z.string(),
  lever: LeverSchema,
  leadId: Uuid.nullable(),
  leadName: z.string(),
  team: z.array(z.string()).default([]),
  financeLeadId: Uuid.nullable(),
  financeLeadName: z.string(),
  stage: StageSchema,
  annualSavingsUsdK: z.number(),           // 000s, base USD
  probabilityPct: z.number().min(0).max(100),
  savingsStart: IsoDate,
  savingsEnd: IsoDate.nullable(),          // null = recurring
  timeProbabilityAdjustedUsdK: z.number(), // computed: annual × months_remaining_in_FY/12 × probability
  carryForwardUsdK: z.number(),            // computed
  costToAchieve: z.object({ oneTimeUsdK: z.number(), recurringUsdK: z.number(), notes: z.string().nullable() }),
  milestones: z.array(MilestoneSchema),
  meetings: z.array(MeetingSchema),
  classification: ClassificationSchema.nullable(),
  ffgDecision: FfgDecisionSchema.nullable(),
  needsNewSupplier: z.boolean(),
  procuraEventId: Uuid.nullable(),
  duplicatedFrom: Uuid.nullable(),         // "steal with pride"
  shouldCostModelId: Uuid.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Project = z.infer<typeof ProjectSchema>;

/** Procura eligibility (F8.1). */
export function procuraEligible(p: Pick<Project, 'lever' | 'needsNewSupplier'>): boolean {
  return ['Price', 'Specifications', 'RightSource'].includes(p.lever) || p.needsNewSupplier;
}

/* ───────────────────────── ProcuraEvent ───────────────────────── */

export const BidSchema = z.object({
  id: z.string(),
  supplier: z.string(),
  receivedAt: IsoDateTime.nullable(),
  sealed: z.boolean(),                     // sealed until deadline
  amountUsd: z.number().nullable(),
  unit: z.string().nullable(),
  tcoUsd: z.number().nullable(),
  supplierMarginPct: z.number().nullable(),
  subFloor: z.boolean().default(false),    // SENTINEL: models margin below tenant floor
  notes: z.string().nullable(),
});
export type Bid = z.infer<typeof BidSchema>;

export const EvaluationMatrixSchema = z.object({
  criteria: z.array(z.object({ name: z.string(), weightPct: z.number() })),
  lockedAt: IsoDateTime.nullable(),        // immutable after lock (at distribution)
});
export type EvaluationMatrix = z.infer<typeof EvaluationMatrixSchema>;

export const CrewOutputSectionSchema = z.object({
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).nullable(),
  provenance: z.array(ProvenanceSchema).default([]),
});
export const CrewOutputsSchema = z.object({
  researcher: z.array(CrewOutputSectionSchema).default([]),
  rfp_architect: z.array(CrewOutputSectionSchema).default([]),
  bid_handler: z.array(CrewOutputSectionSchema).default([]),
  recommender: z.array(CrewOutputSectionSchema).default([]),
});
export type CrewOutputs = z.infer<typeof CrewOutputsSchema>;

export const ProcuraEventSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  projectRef: Uuid,
  shouldCostTargetUsd: z.number().nullable(),
  shouldCostModelRef: Uuid.nullable(),     // must be a G2-frozen version
  baselineUsd: z.number().nullable(),
  stage: ProcuraStageSchema,
  crewOutputs: CrewOutputsSchema,
  evaluationMatrix: EvaluationMatrixSchema,
  bids: z.array(BidSchema),
  award: z.object({
    decision: z.string(),
    signerUserId: Uuid,
    signerName: z.string(),
    ts: IsoDateTime,
  }).nullable(),
  log: z.array(z.object({ ts: IsoDateTime, line: z.string() })),
  createdAt: IsoDateTime,
});
export type ProcuraEvent = z.infer<typeof ProcuraEventSchema>;

/* ───────────────────────── AgentRun ───────────────────────── */

export const AgentRunStepSchema = z.object({
  idx: z.number().int(),
  agent: AgentNameSchema,
  title: z.string(),
  status: z.enum(['pending', 'running', 'gate_hold', 'done', 'skipped', 'refused', 'failed']),
  detail: z.string().nullable(),
  gateId: GateIdSchema.nullable(),
  startedAt: IsoDateTime.nullable(),
  finishedAt: IsoDateTime.nullable(),
});
export type AgentRunStep = z.infer<typeof AgentRunStepSchema>;

export const AgentRunSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  agent: AgentNameSchema,                  // COACH for orchestrated runs
  trigger: z.enum(['user', 'coach']),
  triggeredByUserId: Uuid.nullable(),
  objectType: z.enum(['project', 'procura_event', 'spend_base', 'should_cost_model']).nullable(),
  objectRef: Uuid.nullable(),
  inputsRef: z.record(z.unknown()).nullable(),
  outputsRef: z.record(z.unknown()).nullable(),
  modelUsed: z.string().nullable(),
  tokensIn: z.number().int().default(0),
  tokensOut: z.number().int().default(0),
  costUsd: z.number().default(0),
  provenance: z.array(ProvenanceSchema).default([]),
  status: AgentRunStatusSchema,
  gateHolds: z.array(Uuid).default([]),
  steps: z.array(AgentRunStepSchema).default([]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

/* ───────────────────────── LeverCouncilSession ───────────────────────── */

export const CouncilStanceSchema = z.object({
  agent: AgentNameSchema,
  stance: z.string(),
  levers: z.array(LeverSchema),
  provenance: z.array(ProvenanceSchema).default([]),
});
export const LeverCouncilSessionSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  projectRef: Uuid,
  participants: z.array(AgentNameSchema),
  transcript: z.array(CouncilStanceSchema),
  consensus: z.string().nullable(),
  dissent: z.string().nullable(),
  recordedBy: z.string(),                  // SCRIBE
  humanDecision: z.object({
    userId: Uuid, userName: z.string(), lever: LeverSchema, note: z.string().nullable(), ts: IsoDateTime,
  }).nullable(),
  createdAt: IsoDateTime,
});
export type LeverCouncilSession = z.infer<typeof LeverCouncilSessionSchema>;

/* ───────────────────────── FYConfig / tenant settings ───────────────────────── */

export const FYConfigSchema = z.object({
  fyStartMonth: z.number().int().min(1).max(12).default(4), // Apr–Mar, tenant-configurable
  baseCurrency: z.literal('USD').default('USD'),
  enabledCurrencies: z.array(CurrencySchema).default(['USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR']),
  fxSource: z.enum(['seed', 'ecb', 'openexchangerates']).default('seed'),
  fairMarginFloorPct: z.number().default(8),
  g0CompletenessTargetPct: z.number().default(95),
  /** Roles for which TOTP MFA is enforced (recommended in production: finance, admin). */
  mfaRequiredForRoles: z.array(RoleSchema).default([]),
});
export type FYConfig = z.infer<typeof FYConfigSchema>;

/* ───────────────────────── Users / auth ───────────────────────── */

export const UserSchema = z.object({
  id: Uuid,
  tenantId: Uuid,
  email: z.string().email(),
  name: z.string(),
  roles: z.array(RoleSchema).min(1),
  mfaEnabled: z.boolean(),
  awardAuthority: z.boolean().default(false), // Procura award gate flag
  active: z.boolean(),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof UserSchema>;

/** Authenticated human principal — the ONLY identity that can sign a gate. */
export const PrincipalSchema = z.object({
  userId: Uuid,
  tenantId: Uuid,
  name: z.string(),
  email: z.string().email(),
  roles: z.array(RoleSchema),
  awardAuthority: z.boolean().default(false),
  kind: z.literal('human'),                // agents/services never receive a principal
});
export type Principal = z.infer<typeof PrincipalSchema>;
