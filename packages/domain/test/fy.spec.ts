import { describe, expect, it } from 'vitest';
import { carryForward, fyLabel, monthsRemainingInFy, timeProbabilityAdjusted } from '../src/index.js';

describe('T&P adjustment — annual × months_remaining_in_FY/12 × probability', () => {
  it('start at FY start (April) → full year', () => {
    expect(monthsRemainingInFy('2026-04-01')).toBe(12);
    expect(timeProbabilityAdjusted({ annualUsdK: 120, probabilityPct: 100, savingsStart: '2026-04-01' })).toBe(120);
  });
  it('start in October → 6 months remaining', () => {
    expect(monthsRemainingInFy('2026-10-01')).toBe(6);
    expect(timeProbabilityAdjusted({ annualUsdK: 120, probabilityPct: 75, savingsStart: '2026-10-01' })).toBe(45);
  });
  it('start in March → 1 month remaining', () => {
    expect(monthsRemainingInFy('2027-03-15')).toBe(1);
  });
  it('carry-forward = probability-weighted annual minus current FY portion', () => {
    // 120 × 75% = 90 weighted; current FY 45 → carry 45
    expect(carryForward({ annualUsdK: 120, probabilityPct: 75, savingsStart: '2026-10-01' })).toBe(45);
  });
  it('round-trip: tp + carry = weighted annual', () => {
    const i = { annualUsdK: 96, probabilityPct: 60, savingsStart: '2026-11-01' };
    const total = timeProbabilityAdjusted(i) + carryForward(i);
    expect(total).toBeCloseTo(96 * 0.6, 1);
  });
  it('FY label Apr–Mar', () => {
    expect(fyLabel('2026-06-01')).toBe('FY 26–27');
    expect(fyLabel('2027-02-01')).toBe('FY 26–27');
    expect(fyLabel('2027-04-01')).toBe('FY 27–28');
  });
});
