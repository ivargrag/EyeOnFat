# E2E — Playwright suites keyed to PRD acceptance criteria

Prereqs: Postgres migrated (`pnpm db:migrate`), API on :4000, Web on :3000.
Global setup re-seeds the Meridian demo tenant (set `E2E_SKIP_SEED=1` to skip).

```bash
pnpm e2e                       # or: cd e2e && npx playwright test
PW_CHROMIUM_PATH=/path/to/chromium pnpm e2e   # pre-installed browser images
```

| Spec | PRD ACs covered |
|---|---|
| shell-currency | Phase 0 login→shell · F1.3 currency <300ms, no refetch, lossless round-trip |
| tree | F3.1 blocks + Volume×Price split reconciles · F3.2 drill + lineage · F3.3 → Opportunity pre-fill |
| gates | F5.3 G3 dual signature (reject <2 signers) · invariant #4 finance-only G5 |
| procura | F8.2 crew UI · F8.3 sealed bids + locked matrix · F8.4 human award + write-back |
| projects-coach | F7.2 steal-with-pride · F7.4 T&P auto-compute · F7.5 COACH pauses at gates, resumable |

API-level ACs (analyst-layer preservation, SENTINEL sub-floor block, matrix
immutability 409, MFA scoping, audit hash chain) live in `apps/api/test/api.spec.ts`.
