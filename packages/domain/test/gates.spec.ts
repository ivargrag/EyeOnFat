/**
 * Exhaustive gate-authorization matrix: every role × every gate, positive and
 * negative — plus dual-sign G3 and award-authority behaviour (CLAUDE.md
 * testing requirement).
 */
import { describe, expect, it } from 'vitest';
import {
  GATE_IDS, GATE_RULES, ROLES, canSign, isSatisfied,
  type GateId, type GateSignature, type Principal, type Role,
} from '../src/index.js';

const principal = (roles: Role[], opts: Partial<Principal> = {}): Principal => ({
  userId: opts.userId ?? '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-0000000000aa',
  name: opts.name ?? 'Test User',
  email: 'test@example.com',
  roles,
  awardAuthority: opts.awardAuthority ?? false,
  kind: 'human',
});

const sig = (userId: string, role: Role, decision: GateSignature['decision'] = 'approve'): GateSignature => ({
  userId, userName: 'x', role, ts: new Date().toISOString(), decision, note: null, channel: 'web',
});

describe('gate authorization — every role × every gate', () => {
  for (const gateId of GATE_IDS) {
    const rule = GATE_RULES[gateId];
    for (const role of ROLES) {
      const eligible = rule.eligibleRoles.includes(role);
      const needsAward = Boolean(rule.requiresAwardAuthority);
      it(`${gateId} × ${role} → ${eligible ? 'eligible' : 'rejected'}`, () => {
        const res = canSign(gateId, principal([role], { awardAuthority: true }), []);
        if (eligible) expect(res.ok).toBe(true);
        else {
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.code).toBe('ROLE_NOT_ELIGIBLE');
        }
      });
      if (eligible && needsAward) {
        it(`${gateId} × ${role} without award authority → rejected`, () => {
          const res = canSign(gateId, principal([role], { awardAuthority: false }), []);
          expect(res.ok).toBe(false);
          if (!res.ok) expect(res.code).toBe('NO_AWARD_AUTHORITY');
        });
      }
    }
  }

  it('non-human principal can never sign any gate', () => {
    for (const gateId of GATE_IDS) {
      const p = { ...principal(['owner', 'admin', 'finance', 'pm', 'manager', 'procurement'], { awardAuthority: true }), kind: 'agent' as never };
      const res = canSign(gateId, p, []);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.code).toBe('NOT_HUMAN');
    }
  });
});

describe('G3 dual signature — pm + manager, two distinct humans', () => {
  const U1 = '00000000-0000-4000-8000-000000000001';
  const U2 = '00000000-0000-4000-8000-000000000002';

  it('one signature never satisfies G3', () => {
    expect(isSatisfied('G3', [sig(U1, 'pm', 'proceed')])).toBe(false);
    expect(isSatisfied('G3', [sig(U1, 'manager', 'proceed')])).toBe(false);
  });

  it('pm + manager from distinct users satisfies', () => {
    expect(isSatisfied('G3', [sig(U1, 'pm', 'proceed'), sig(U2, 'manager', 'proceed')])).toBe(true);
  });

  it('two pms never satisfy (manager slot unfilled)', () => {
    expect(isSatisfied('G3', [sig(U1, 'pm', 'proceed'), sig(U2, 'pm', 'proceed')])).toBe(false);
  });

  it('same user cannot sign twice', () => {
    const p = principal(['pm', 'manager'], { userId: U1 });
    const res = canSign('G3', p, [sig(U1, 'pm', 'proceed')]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('DUPLICATE_SIGNER');
  });

  it('a second pm cannot fill the manager slot', () => {
    const res = canSign('G3', principal(['pm'], { userId: U2 }), [sig(U1, 'pm', 'proceed')]);
    expect(res.ok).toBe(false);
  });

  it('a manager can complete after a pm signed', () => {
    const res = canSign('G3', principal(['manager'], { userId: U2 }), [sig(U1, 'pm', 'proceed')]);
    expect(res.ok).toBe(true);
  });
});

describe('G5 — finance only', () => {
  it('only finance is eligible', () => {
    for (const role of ROLES) {
      const res = canSign('G5', principal([role]), []);
      expect(res.ok).toBe(role === 'finance');
    }
  });
});
