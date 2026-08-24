import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'EyeOnFat!2026';

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('#crumb')).toHaveText(/dashboard/i, { timeout: 20_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.locator('.avatar').click();
  await page.waitForURL(/login/);
}
