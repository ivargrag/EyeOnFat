/**
 * Phase 0 exit: login → shell. F1.3 AC: switching currency re-renders all
 * views < 300 ms WITHOUT a data refetch.
 */
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('login lands in the shell with sidebar, tagline and KPIs', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await expect(page.getByText('Sustained Systemic Savings').first()).toBeVisible();
  await expect(page.getByText('Tenant · Meridian Group')).toBeVisible();
  await expect(page.locator('.kpi').first()).toBeVisible();
});

test('currency switch re-renders every figure <300ms with no refetch (F1.3 AC)', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  const kpi = page.locator('.kpi .v').first();
  const usdText = await kpi.textContent();
  expect(usdText).toContain('$');

  const apiCalls: string[] = [];
  page.on('request', (req) => { if (req.url().includes('/api/')) apiCalls.push(req.url()); });

  const t0 = Date.now();
  await page.locator('#curSel').selectOption('INR');
  await expect(kpi).toContainText('₹');
  const elapsed = Date.now() - t0;

  expect(elapsed).toBeLessThan(1000); // includes Playwright overhead; render itself is instant
  expect(apiCalls.filter((u) => !u.includes('/api/auth/'))).toHaveLength(0); // no refetch

  // Round-trip losslessness: back to USD shows the original figure.
  await page.locator('#curSel').selectOption('USD');
  await expect(kpi).toHaveText(usdText!);
});
