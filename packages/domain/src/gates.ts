/**
 * Gate rulebook — pure logic shared by API enforcement and tests.
 *
 * INVARIANTS (CLAUDE.md #1–#4):
 *  - No code path advances a Gate without an authenticated human principal.
 *  - Agents recommend; humans decide. Enforced at API layer.
 *  - G3 requires two distinct signatures: role `pm` + role `manager`.
 *  - Only role `finance` moves a project Pipeline → Forecast (G5).
 */
import type { GateId, Role } from './enums.js';
import type { GateSignature, Principal } from './schemas.js';

export interface GateRule {
  gateId: GateId;
  title: string;
  /** Roles any one of which qualifies a signer (per-slot rules override). */
  eligibleRoles: Role[];
  /** Number of DISTINCT human signatures required. */
  requiredDistinctSignatures: number;
  /**
   * When set, each required signature slot must be satisfiable by a distinct
   * user covering these role sets (G3: one `pm` + one `manager`).
   */
  distinctRoleSlots?: Role[][];
  /** Extra flag required on the principal (Procura award authority). */
  requiresAwardAuthority?: boolean;
}

export const GATE_RULES: Record<GateId, GateRule> = {
  G0: { gateId: 'G0', title: 'Scope & completeness', eligibleRoles: ['owner', 'finance'], requiredDistinctSignatures: 1 },
  G1: { gateId: 'G1', title: 'Opportunity shortlist', eligibleRoles: ['owner', 'finance', 'manager'], requiredDistinctSignatures: 1 },
  G2: { gateId: 'G2', title: 'Clean-sheet acceptance', eligibleRoles: ['analyst', 'pm'], requiredDistinctSignatures: 1 },
  G3: {
    gateId: 'G3', title: 'Fuel-for-Growth decision',
    eligibleRoles: ['pm', 'manager'], requiredDistinctSignatures: 2,
    distinctRoleSlots: [['pm'], ['manager']],
  },
  G4: { gateId: 'G4', title: 'Ideas sized & committed', eligibleRoles: ['pm', 'manager'], requiredDistinctSignatures: 1 },
  G5: { gateId: 'G5', title: 'Finance commits to Forecast', eligibleRoles: ['finance'], requiredDistinctSignatures: 1 },
  G6: { gateId: 'G6', title: 'SteerCo signs actuals', eligibleRoles: ['owner', 'finance'], requiredDistinctSignatures: 1 },
  'P-INTAKE': { gateId: 'P-INTAKE', title: 'Procura intake & scope', eligibleRoles: ['procurement', 'manager', 'pm'], requiredDistinctSignatures: 1 },
  'P-RFP': { gateId: 'P-RFP', title: 'RFP sign-off', eligibleRoles: ['procurement', 'manager'], requiredDistinctSignatures: 1 },
  'P-AWARD': {
    gateId: 'P-AWARD', title: 'Award decision',
    eligibleRoles: ['procurement', 'manager'], requiredDistinctSignatures: 1,
    requiresAwardAuthority: true,
  },
};

export type SignRejection =
  | { ok: false; code: 'NOT_HUMAN'; message: string }
  | { ok: false; code: 'ROLE_NOT_ELIGIBLE'; message: string }
  | { ok: false; code: 'NO_AWARD_AUTHORITY'; message: string }
  | { ok: false; code: 'DUPLICATE_SIGNER'; message: string };
export type SignCheck = { ok: true } | SignRejection;

/** Can this principal add a signature to this gate right now? */
export function canSign(gateId: GateId, principal: Principal, existing: GateSignature[]): SignCheck {
  const rule = GATE_RULES[gateId];
  if (principal.kind !== 'human') {
    return { ok: false, code: 'NOT_HUMAN', message: 'Gates require an authenticated human principal.' };
  }
  if (!rule.eligibleRoles.some((r) => principal.roles.includes(r))) {
    return { ok: false, code: 'ROLE_NOT_ELIGIBLE', message: `Gate ${gateId} requires one of roles: ${rule.eligibleRoles.join(', ')}.` };
  }
  if (rule.requiresAwardAuthority && !principal.awardAuthority) {
    return { ok: false, code: 'NO_AWARD_AUTHORITY', message: `Gate ${gateId} requires award authority.` };
  }
  if (existing.some((s) => s.userId === principal.userId)) {
    return { ok: false, code: 'DUPLICATE_SIGNER', message: 'This user has already signed; distinct signers are required.' };
  }
  if (rule.distinctRoleSlots) {
    // The new signer must be able to fill an as-yet-unfilled role slot.
    const open = openSlots(gateId, existing);
    const fits = open.some((slot) => slot.some((r) => principal.roles.includes(r)));
    if (!fits) {
      return { ok: false, code: 'ROLE_NOT_ELIGIBLE', message: `All remaining ${gateId} signature slots require a different role.` };
    }
  }
  return { ok: true };
}

function openSlots(gateId: GateId, existing: GateSignature[]): Role[][] {
  const rule = GATE_RULES[gateId];
  if (!rule.distinctRoleSlots) return [];
  const slots = rule.distinctRoleSlots.map((s) => [...s]);
  const used = new Set<number>();
  for (const sig of existing) {
    const idx = slots.findIndex((slot, i) => !used.has(i) && slot.includes(sig.role));
    if (idx >= 0) used.add(idx);
  }
  return slots.filter((_, i) => !used.has(i));
}

/** Is the gate fully satisfied by these signatures? */
export function isSatisfied(gateId: GateId, signatures: GateSignature[]): boolean {
  const rule = GATE_RULES[gateId];
  const distinct = new Set(signatures.map((s) => s.userId));
  if (distinct.size < rule.requiredDistinctSignatures) return false;
  if (rule.distinctRoleSlots) {
    return openSlots(gateId, signatures).length === 0 && distinct.size >= rule.requiredDistinctSignatures;
  }
  return true;
}
