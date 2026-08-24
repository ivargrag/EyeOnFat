/**
 * M3 ACs: treemap blocks with Volume×Price split (shares sum to 100),
 * supplier drill-down, invoice-line lineage, → Opportunity pre-fill (F3.3).
 */
import { expect, test } from '@playwright/test';
import { login } from './helpers.js';

test('spend tree: blocks, driver split reconciles, drill to lineage', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/tree');
  await expect(page.locator('.tnode').first()).toBeVisible();

  // Driver split reconciles: "Vol X% × Price Y%" with X+Y=100.
  const hint = await page.locator('.tnode .hint').first().textContent();
  const m = hint!.match(/Vol (\d+)% × Price (\d+)%/);
  expect(m).toBeTruthy();
  expect(Number(m![1]) + Number(m![2])).toBe(100);

  // Drill: Raw materials → suppliers.
  await page.locator('.tnode', { hasText: 'Raw materials' }).click();
  await expect(page.locator('.drillcard')).toContainText('Raw materials — supplier drill-down');
  await expect(page.locator('.drillcard')).toContainText('Gulf Polymers');

  // Invoice lines with document lineage.
  await page.locator('.drillcard a', { hasText: 'Gulf Polymers' }).click();
  await expect(page.locator('.drillcard')).toContainText('invoice lines (document lineage)');
  await expect(page.locator('.drillcard .mini tbody tr').first()).toBeVisible();
});

test('→ Opportunity pre-fills an Idea with dims and evidence (F3.3 AC)', async ({ page }) => {
  await login(page, 'k.menon@meridiangroup.com');
  await page.goto('/tree');
  await page.locator('.tnode', { hasText: 'Raw materials' }).click();
  await page.locator('.drillcard button', { hasText: 'Opportunity' }).first().click();
  await page.waitForURL(/projects\/add/);
  const name = await page.locator('input').first().inputValue();
  expect(name.length).toBeGreaterThan(5);
  await expect(page.locator('textarea')).toHaveValue(/LENS evidence/);
});
