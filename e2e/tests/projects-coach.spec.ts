/**
 * F7.2 steal-with-pride, F7.3 add project (T&P auto-compute), and
 * F7.5 COACH semi-autonomy: runs between gates, pauses ◆ at G2, never auto-signs.
 */
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('add project: T&P auto-computes; saves to Pipeline', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/projects/add');
  await page.locator('input').first().fill('E2E — Corrugate box weight optimisation');
  // Open savings accordion and check the auto T&P: 120 × 6/12 × 75% = 45k (Oct start)
  await page.locator('.acc', { hasText: '2 · Savings' }).locator('> button').click();
  await expect(page.locator('input[readonly]').nth(1)).toHaveValue(/\$45k/);
  await page.getByRole('button', { name: /save project → pipeline/i }).click();
  await page.waitForURL(/projects\?open=/);
  await expect(page.locator('.pdetail')).toContainText('E2E — Corrugate box weight optimisation');
  await expect(page.locator('.pdetail .stgpill').first()).toHaveText('Pipeline');
});

test('duplicate — steal with pride resets to Pipeline (F7.2)', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/projects');
  const row = page.locator('tr', { hasText: 'SaaS licence rationalisation' });
  await row.getByTitle(/steal with pride/i).click();
  await expect(page.locator('.pdetail h2')).toContainText('SaaS licence rationalisation (copy)');
  await expect(page.locator('.pdetail .stgpill').first()).toHaveText('Pipeline');
  await expect(page.locator('.pdetail')).toContainText('stolen with pride');
});

test('COACH run streams steps and pauses at a human gate — never auto-signs (F7.5 AC)', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/projects');
  await page.locator('tr', { hasText: 'Corrugate & void-fill' }).locator('a').first().click();
  await page.getByRole('button', { name: /hand to coach/i }).click();

  const steps = page.locator('.cstep');
  await expect(steps.first()).toBeVisible({ timeout: 30_000 });
  // The run pauses at the first gate (G2 after SENTINEL) and shows Sign & resume.
  await expect(page.locator('.cstep.hold')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.cstep.hold')).toContainText('◆');
  await expect(page.getByRole('button', { name: /sign G2 & resume/i })).toBeVisible();
  // Reload mid-run: state is persisted, tracker resumes from DB (resumability AC).
  await page.reload();
  await page.locator('tr', { hasText: 'Corrugate & void-fill' }).locator('a').first().click();
  await expect(page.locator('.cstep.hold')).toBeVisible({ timeout: 20_000 });
});
