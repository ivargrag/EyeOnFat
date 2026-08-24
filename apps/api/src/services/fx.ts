/**
 * FX service (F1.3): daily rates, base USD, as-of stamped. Conversion happens
 * client-side at render (currency switch re-renders < 300 ms, no refetch);
 * the API only serves the daily table. Stored values remain base USD.
 */
import type { PoolClient } from '@eof/db';
import { dbGlobal, type AppCtx } from '../lib/ctx.js';

export interface FxTable {
  asOf: string;
  base: 'USD';
  rates: Record<string, number>; // units of currency per USD
}

export async function latestRates(ctx: AppCtx): Promise<FxTable> {
  return dbGlobal(ctx, async (c) => {
    const r = await c.query(
      `SELECT DISTINCT ON (currency) currency, rate_per_usd, as_of
       FROM fx_rates ORDER BY currency, as_of DESC`);
    const rates: Record<string, number> = { USD: 1 };
    let asOf = new Date().toISOString().slice(0, 10);
    for (const row of r.rows) {
      rates[row.currency] = Number(row.rate_per_usd);
      asOf = row.as_of instanceof Date ? row.as_of.toISOString().slice(0, 10) : String(row.as_of);
    }
    return { asOf, base: 'USD' as const, rates };
  });
}

/** Daily sync from openexchangerates (when configured); 'seed' keeps the table. */
export async function syncDailyRates(ctx: AppCtx): Promise<void> {
  if (ctx.env.FX_SOURCE !== 'openexchangerates' || !ctx.env.OPENEXCHANGERATES_APP_ID) return;
  const res = await fetch(
    `https://openexchangerates.org/api/latest.json?app_id=${ctx.env.OPENEXCHANGERATES_APP_ID}&symbols=EUR,GBP,AED,SAR,INR`);
  if (!res.ok) return;
  const data = (await res.json()) as { rates: Record<string, number> };
  const today = new Date().toISOString().slice(0, 10);
  await dbGlobal(ctx, async (c: PoolClient) => {
    for (const [cur, rate] of Object.entries(data.rates)) {
      await c.query(
        `INSERT INTO fx_rates (currency, rate_per_usd, as_of, source) VALUES ($1,$2,$3,'openexchangerates')
         ON CONFLICT (currency, as_of) DO UPDATE SET rate_per_usd=$2, source='openexchangerates'`,
        [cur, rate, today]);
    }
  });
}
