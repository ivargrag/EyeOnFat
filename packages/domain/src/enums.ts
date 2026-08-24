/**
 * Canonical lexicon — PRD §3. Names are invariant: do not rename.
 */
import { z } from 'zod';

export const LEVERS = [
  'Price',
  'Specifications',
  'Demand',
  'Eliminate',
  'Automate',
  'Consolidate',
  'RightSource',
] as const;
export const LeverSchema = z.enum(LEVERS);
export type Lever = z.infer<typeof LeverSchema>;

/** Display labels (UI copy per prototype). Enum values above are canonical. */
export const LEVER_LABELS: Record<Lever, string> = {
  Price: 'Price',
  Specifications: 'Specifications',
  Demand: 'Demand',
  Eliminate: 'Eliminate',
  Automate: 'Automate (Digitise)',
  Consolidate: 'Consolidate',
  RightSource: 'Right Source',
};

export const CLASSIFICATIONS = ['FAT', 'MUSCLE', 'BONE'] as const;
export const ClassificationSchema = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof ClassificationSchema>;

export const STAGES = ['Pipeline', 'Forecast', 'Committed', 'Delivered'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const GATE_IDS = [
  'G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6',
  'P-INTAKE', 'P-RFP', 'P-AWARD',
] as const;
export const GateIdSchema = z.enum(GATE_IDS);
export type GateId = z.infer<typeof GateIdSchema>;

export const ROLES = [
  'owner', 'admin', 'finance', 'pm', 'manager', 'analyst', 'viewer', 'procurement',
] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const PROCURA_STAGES = [
  'intake',          // ◆ human gate P-INTAKE
  'research',
  'rfp_build',       // ◆ human gate P-RFP (sign-off before distribution)
  'distribute_bids',
  'evaluation',
  'recommendation',  // ◆ human gate P-AWARD
  'award',
  'complete',
] as const;
export const ProcuraStageSchema = z.enum(PROCURA_STAGES);
export type ProcuraStage = z.infer<typeof ProcuraStageSchema>;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'INR'] as const;
export const CurrencySchema = z.enum(CURRENCIES);
export type Currency = z.infer<typeof CurrencySchema>;

/** Agent roster — canonical names (CLAUDE.md). "FUEL FOR GROWTH", not "Trainer". */
export const AGENTS = [
  'COACH',
  'SCALE',
  'CUBE',
  'LENS',
  'SCOPE',
  'PULSE',
  'FORGE',
  'SENTINEL',
  'FUEL FOR GROWTH',
  'LEVER',
  'PILOT',
  'SCRIBE',
  'The Researcher',
  'The RFP Architect',
  'The Bid Handler',
  'The Recommender',
] as const;
export const AgentNameSchema = z.enum(AGENTS);
export type AgentName = z.infer<typeof AgentNameSchema>;

export const AGENT_RUN_STATUSES = [
  'queued', 'running', 'gate_hold', 'complete', 'failed', 'refused', 'cancelled',
] as const;
export const AgentRunStatusSchema = z.enum(AGENT_RUN_STATUSES);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const FFG_TESTS = [
  'Customer experience',
  'Quality & spec integrity',
  'Growth capacity',
  'Supply continuity',
  'Brand, safety & compliance',
] as const;
export type FfgTestName = (typeof FFG_TESTS)[number];
