/**
 * M8 ACs: embedded crew UI on the live event; evaluation matrix locked
 * (immutable); bids sealed until deadline; award requires a human with
 * award authority.
 */
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('live Procura event: stepper, locked matrix, sealed bids, crew outputs, log', async ({ page }) => {
  await login(page, "a.dsouza@meridiangroup.com");
  await page.goto('/projects');
  await page.locator('tr', { hasText: 'Freight two-carrier' }).locator('a').first().click();

  const box = page.locator('.procura-box');
  await expect(box).toContainText('Procura procurement event — live');
  await expect(box).toContainText('Should-cost target');
  await expect(box.locator('.pstep.now')).toContainText('Distribute & bids');
  await expect(box).toContainText('locked'); // matrix locked at distribution
  await expect(box.locator('.mini td', { hasText: '🔒 sealed' }).first()).toBeVisible(); // sealed bids hide amounts
  await expect(box).toContainText('The Researcher');
  await expect(box.locator('.plog')).toContainText('P-RFP signed off');
});

test('full run to award: close bidding → evaluation → human award writes back (F8.4)', async ({ page }) => {
  await login(page, "a.dsouza@meridiangroup.com"); // procurement + award authority
  await page.goto('/projects');
  await page.locator('tr', { hasText: 'Freight two-carrier' }).locator('a').first().click();
  const box = page.locator('.procura-box');

  await box.getByRole('button', { name: /close bidding/i }).click();
  // demo engine evaluates + recommends within a few seconds
  await expect(box.locator('.pstep.now')).toContainText('Recommendation', { timeout: 30_000 });
  // Bids unsealed at deadline, scored against the locked matrix with TCO.
  await expect(box.locator('.plog')).toContainText('bids unsealed at deadline');
  // (Sub-floor SENTINEL blocking is covered by API tests: classify-savings P2 AC.)

  await box.locator('input[placeholder*="Award decision"]').fill('Two-carrier 60/40: Desert Bridge + Falcon Freight');
  await box.getByRole('button', { name: /sign p-award/i }).click();
  await expect(box).toContainText('Event complete — savings written back', { timeout: 20_000 });
  await expect(box.locator('.plog')).toContainText('P-AWARD signed');
});
