/**
 * Gate ACs through the UI:
 *  - F5.3: G3 decision needs two distinct qualified signatures (pm + manager).
 *  - Invariant #4: only finance commits Pipeline → Forecast (G5).
 */
import { expect, test } from '@playwright/test';
import { login, logout } from './helpers.js';

test('G3 dual-sign: pm first (gate stays open), manager completes', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com'); // pm
  await page.goto('/ffg');
  const openCase = page.locator('.ffg-item', { hasText: 'Merchandiser' }).first();
  await expect(openCase).toBeVisible();

  await openCase.locator('.db.hold').click();
  await expect(openCase.locator('.okmsg')).toContainText(/awaiting the second qualified signer/i);

  await logout(page);
  await login(page, 'retail.ops@meridiangroup.com'); // manager
  await page.goto('/ffg');
  const managerCase = page.locator('.ffg-item', { hasText: 'Merchandiser' }).first();
  await managerCase.locator('.db.hold').click();
  await expect(managerCase.locator('.okmsg')).toContainText(/dual-signed to the audit log/i);
});

test('G5: pm sees a refusal path; finance commits Pipeline → Forecast', async ({ page }) => {
  // pm has no commit button
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/projects');
  await page.locator('tr', { hasText: 'Utilities tariff' }).locator('a').first().click();
  const acc2 = page.locator('.acc', { hasText: '2 · Savings' });
  await acc2.locator('> button').click();
  await expect(acc2).toContainText('Only Finance');
  await expect(acc2.getByRole('button', { name: /commit to forecast/i })).toHaveCount(0);
  await logout(page);

  // finance commits
  await login(page, 's.iyer@meridiangroup.com');
  await page.goto('/projects');
  await page.locator('tr', { hasText: 'Utilities tariff' }).locator('a').first().click();
  const facc2 = page.locator('.acc', { hasText: '2 · Savings' });
  await facc2.locator('> button').click();
  await facc2.getByRole('button', { name: /commit to forecast/i }).click();
  await expect(facc2.locator('.okmsg')).toContainText(/committed to Forecast/i);
  await expect(page.locator('.pdetail .stgpill').first()).toHaveText('Forecast');
});
