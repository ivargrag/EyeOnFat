/**
 * Gate service — the ONLY code path that advances a gate, and it demands an
 * authenticated human Principal (invariant #1). Agents, admin tools and tests
 * have no way around this: the API layer is the enforcement point (#2).
 */
import type { PoolClient } from '@eof/db';
import {
  GATE_RULES, canSign, isSatisfied,
  type GateId, type GateSignature, type Principal,
} from '@eof/domain';
import { badRequest, conflict, forbidden, notFound } from '../lib/http-error.js';
import { audit } from '../lib/ctx.js';

export interface GateRow {
  id: string; tenant_id: string; gate_id: GateId; object_type: string; object_ref: string;
  required_roles: string[]; required_distinct: number; signatures: GateSignature[];
  status: 'open' | 'signed' | 'rejected' | 'held'; created_at: string;
}

export async function ensureGate(
  c: PoolClient,
  args: { tenantId: string; gateId: GateId; objectType: string; objectRef: string },
): Promise<GateRow> {
  const existing = await c.query(
    `SELECT * FROM gates WHERE gate_id=$1 AND object_ref=$2 AND status='open' ORDER BY created_at DESC LIMIT 1`,
    [args.gateId, args.objectRef],
  );
  if (existing.rows.length) return existing.rows[0] as GateRow;
  const rule = GATE_RULES[args.gateId];
  const r = await c.query(
    `INSERT INTO gates (tenant_id, gate_id, object_type, object_ref, required_roles, required_distinct, status)
     VALUES ($1,$2,$3,$4,$5,$6,'open') RETURNING *`,
    [args.tenantId, args.gateId, args.objectType, args.objectRef, rule.eligibleRoles, rule.requiredDistinctSignatures],
  );
  return r.rows[0] as GateRow;
}

export interface SignResult {
  gate: GateRow;
  satisfied: boolean;
}

/**
 * Add a human signature to a gate. Throws 403 for ineligible principals and
 * 409 for closed gates. Returns whether the gate is now fully satisfied.
 */
export async function signGate(
  c: PoolClient,
  principal: Principal,
  args: { gateRef: string; decision: 'approve' | 'proceed' | 'hold' | 'reject'; note?: string | null; channel?: string },
): Promise<SignResult> {
  // Defence in depth: a principal must be a human with a user row in this tenant.
  if (principal.kind !== 'human') throw forbidden('Gates require an authenticated human principal.', 'NOT_HUMAN');
  const userRow = await c.query(`SELECT id, name, active FROM users WHERE id=$1 AND deleted_at IS NULL`, [principal.userId]);
  if (!userRow.rows.length || !userRow.rows[0].active) throw forbidden('Signer is not an active user in this tenant.', 'NOT_HUMAN');

  const gr = await c.query(`SELECT * FROM gates WHERE id=$1 FOR UPDATE`, [args.gateRef]);
  if (!gr.rows.length) throw notFound('Gate not found');
  const gate = gr.rows[0] as GateRow;
  if (gate.status !== 'open') throw conflict(`Gate is ${gate.status}; no further signatures accepted.`, 'GATE_CLOSED');

  const existing: GateSignature[] = gate.signatures ?? [];
  const check = canSign(gate.gate_id, principal, existing);
  if (!check.ok) throw forbidden(check.message, check.code);

  // Multi-signature gates carry ONE decision: all signers must agree.
  if (existing.length > 0 && existing[0].decision !== args.decision) {
    throw conflict(`Existing signature carries decision "${existing[0].decision}"; co-signers must match or the gate must be re-opened.`, 'DECISION_CONFLICT');
  }

  // The signature role recorded is the eligible role the signer fills.
  const rule = GATE_RULES[gate.gate_id];
  const filledRoles = new Set(existing.map((s) => s.role));
  const role = rule.distinctRoleSlots
    ? (rule.distinctRoleSlots.flat().find((r) => principal.roles.includes(r) && !filledRoles.has(r)) ?? principal.roles[0])
    : (rule.eligibleRoles.find((r) => principal.roles.includes(r)) ?? principal.roles[0]);

  const signature: GateSignature = {
    userId: principal.userId, userName: principal.name, role,
    ts: new Date().toISOString(), decision: args.decision,
    note: args.note ?? null, channel: (args.channel as GateSignature['channel']) ?? 'web',
  };
  const signatures = [...existing, signature];
  const satisfied = isSatisfied(gate.gate_id, signatures);
  const newStatus = satisfied ? (args.decision === 'reject' ? 'rejected' : 'signed') : 'open';

  const updated = await c.query(
    `UPDATE gates SET signatures=$2, status=$3 WHERE id=$1 RETURNING *`,
    [gate.id, JSON.stringify(signatures), newStatus],
  );

  await audit(c, {
    tenantId: principal.tenantId, actorId: principal.userId, actorName: principal.name,
    channel: signature.channel, action: 'gate.sign',
    objectType: gate.object_type, objectRef: gate.object_ref,
    payload: { gateId: gate.gate_id, decision: args.decision, note: args.note ?? null, satisfied },
  });

  return { gate: updated.rows[0] as GateRow, satisfied };
}

/** Convenience: gate for object or throw. */
export async function getGate(c: PoolClient, gateRef: string): Promise<GateRow> {
  const r = await c.query(`SELECT * FROM gates WHERE id=$1`, [gateRef]);
  if (!r.rows.length) throw notFound('Gate not found');
  return r.rows[0] as GateRow;
}

export function assertGateSigned(gate: GateRow | null, gateId: GateId): void {
  if (!gate || gate.status !== 'signed') {
    throw badRequest(`Gate ${gateId} must be signed first.`, 'GATE_NOT_SIGNED');
  }
}

export async function findGate(
  c: PoolClient, gateId: GateId, objectRef: string,
): Promise<GateRow | null> {
  const r = await c.query(
    `SELECT * FROM gates WHERE gate_id=$1 AND object_ref=$2 ORDER BY created_at DESC LIMIT 1`,
    [gateId, objectRef],
  );
  return (r.rows[0] as GateRow) ?? null;
}
