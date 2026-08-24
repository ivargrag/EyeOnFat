import { defineConfig } from '@playwright/test';

/**
 * E2E suites keyed to PRD acceptance criteria (§4/§6).
 * Prereqs: Postgres migrated, API on :4000, Web on :3000.
 * Global setup re-seeds the Meridian demo tenant for determinism.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // suites share the seeded demo tenant — run serially
  globalSetup: './global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Sandbox/CI images may pre-install Chromium at a fixed path; otherwise
    // `npx playwright install chromium` provides the default.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  reporter: [['list']],
});
