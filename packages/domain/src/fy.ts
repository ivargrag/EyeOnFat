/**
 * Fiscal-year & time-and-probability math (F7.4).
 * FY is Apr–Mar by default (tenant-configurable via fyStartMonth).
 * T&P adjustment: annual × months_remaining_in_FY/12 × probability.
 */

export interface TpInput {
  annualUsdK: number;
  probabilityPct: number;
  savingsStart: string;       // YYYY-MM-DD
  fyStartMonth?: number;      // 1-12, default 4 (April)
  /** Reference date used to pick the FY window; defaults to savingsStart's FY. */
  asOf?: string;
}

/** Months remaining in the FY (inclusive of the start month) from a date. */
export function monthsRemainingInFy(dateIso: string, fyStartMonth = 4): number {
  const d = new Date(dateIso + 'T00:00:00Z');
  const m = d.getUTCMonth() + 1; // 1-12
  const intoFy = (m - fyStartMonth + 12) % 12; // months elapsed since FY start
  return 12 - intoFy;
}

export function fyLabel(dateIso: string, fyStartMonth = 4): string {
  const d = new Date(dateIso + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() + 1 >= fyStartMonth ? y : y - 1;
  const s = String(startYear).slice(2);
  const e = String(startYear + 1).slice(2);
  return `FY ${s}–${e}`;
}

/** T&P-adjusted current-FY savings, 000s USD (rounded to 1 decimal). */
export function timeProbabilityAdjusted(i: TpInput): number {
  const rem = monthsRemainingInFy(i.savingsStart, i.fyStartMonth ?? 4);
  const v = i.annualUsdK * (rem / 12) * (i.probabilityPct / 100);
  return Math.round(v * 10) / 10;
}

/** Carry-forward to next FY = probability-weighted annual minus current-FY portion. */
export function carryForward(i: TpInput): number {
  const weighted = i.annualUsdK * (i.probabilityPct / 100);
  const cf = weighted - timeProbabilityAdjusted(i);
  return Math.max(0, Math.round(cf * 10) / 10);
}
