import { execSync } from 'node:child_process';

/** Re-seed the Meridian demo tenant so every run starts from known state. */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_SEED === '1') return;
  execSync('pnpm --filter @eof/db seed', {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'inherit',
    env: process.env,
  });
}
