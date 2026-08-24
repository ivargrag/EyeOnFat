/**
 * COACH graph (F7.5): the canonical per-project sequence. COACH runs
 * autonomously BETWEEN gates and pauses ◆ at every human gate; the workflow
 * engine persists each step so a killed browser/process resumes from state.
 * COACH never signs — resumption requires a human gate signature.
 */
import type { AgentName, GateId } from '@eof/domain';
import { procuraEligible } from '@eof/domain';

export interface CoachStepDef {
  agent: AgentName;
  title: string;
  /** When set, the run pauses at this human gate AFTER the step completes. */
  gateAfter: GateId | null;
  /** Council step flag (Lever Council is a multi-voice deliberation). */
  council?: boolean;
}

export function buildCoachGraph(project: { lever: string; needsNewSupplier: boolean }): CoachStepDef[] {
  const steps: CoachStepDef[] = [
    { agent: 'SCALE', title: 'Refresh & reconcile the spend base', gateAfter: null },
    { agent: 'CUBE', title: 'Rebuild Volume × Price cube for the project dims', gateAfter: null },
    { agent: 'LENS', title: 'Anomaly scan & opportunity ranking', gateAfter: null },
    { agent: 'SCOPE', title: 'Zero-based challenge & cost structure', gateAfter: null },
    { agent: 'PULSE', title: 'Market pricing with as-of dates', gateAfter: null },
    { agent: 'FORGE', title: 'Assemble formula-driven should-cost stack', gateAfter: null },
    { agent: 'SENTINEL', title: 'Benchmarks & fair-margin floor checks', gateAfter: 'G2' },
    { agent: 'FUEL FOR GROWTH', title: 'Five tests · FAT/MUSCLE/BONE classification', gateAfter: 'G3' },
    { agent: 'COACH', title: 'Lever Council — which levers to push', gateAfter: null, council: true },
    { agent: 'LEVER', title: 'Lever mapping, sizing & talk-track', gateAfter: 'G4' },
  ];
  if (procuraEligible(project as { lever: never; needsNewSupplier: boolean })) {
    steps.push({ agent: 'The Researcher', title: 'Procura eligibility brief — market pre-scan', gateAfter: null });
  }
  steps.push(
    { agent: 'PILOT', title: 'Milestones, owners & blocker watch', gateAfter: null },
    { agent: 'SCRIBE', title: 'Funnel & phasing update, SteerCo narrative', gateAfter: null },
  );
  return steps;
}

/** Procura crew sequence per event stage (F8.3). */
export const PROCURA_STAGE_AGENTS: Record<string, AgentName | null> = {
  intake: null, // human gate P-INTAKE
  research: 'The Researcher',
  rfp_build: 'The RFP Architect', // ends at human gate P-RFP
  distribute_bids: 'The Bid Handler',
  evaluation: 'The Bid Handler',
  recommendation: 'The Recommender', // ends at human gate P-AWARD
  award: null, // human decision
  complete: null,
};
