# NexTHTax agent instructions

Offline-first Thai personal income tax planner. Static Vite + React app; no backend, no accounts. Users keep their tax folder in a local directory (File System Access) or a ZIP. Scripts live in `package.json`; storage format in `docs/storage-format.md`; tax sources in `docs/tax-research-2569.md`.

## Invariants

- **Privacy.** Tax data stays on the user's device. Keep the app free of requests that carry user data, analytics, external AI, and `localStorage`/IndexedDB/cache storage of workspace data.
- **Money is integer satang.** Ratios use `BigInt`; progressive tax drops only the final sub-baht fraction (`progressiveTax` in `src/domain/engine.ts`).
- **The engine owns every formula.** UI, reports, CSV, and the ZIP `index.html` read results from `calculate`; they never recompute caps or allowances.
- **Rules are per-year snapshots.** A year's rules are stored inside the user's folder. Change `public/rules/*.json` only for a reviewed legal update, never to fix UI. Rules with `status: pending` keep documents but add no deduction.
- **Schema version 1 is frozen.** Adding or changing a field in `src/domain/model.ts` needs an approved migration plan; files with unknown versions are rejected, never rewritten.
- **Writes go through `src/use-workspace.ts`.** Build one candidate workspace, check the expected workspace/year identity, then `commit` once. A failed write never shows "saved".
- **Evidence is never deleted.** Removing a record or attachment keeps the stored file.
- **User-facing text is plain Thai.** Keep schema, JSON, and formula terms out of normal UI flows. Code, identifiers, and commit messages are English.
- **Fixtures are fictional.** Sample data and test fixtures say they are fictional (`สมมติ`). Real tax data never enters the repository.

## Verification

Run in this order: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, then `node scripts/verify-pdf.mjs`.

- `verify-pdf.mjs` reads `test-results/artifacts/annual-thai.pdf`, which `tests/e2e/app.spec.ts` creates, so it runs after the E2E suite. It imports `@napi-rs/canvas`, which is installed transitively and is not listed in `package.json`.
- On this Linux host, Chromium needs `LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu`.
- Record results in `docs/verification.md` and `docs/harness/verification.json` when a delivery is verified.

## Release

A push to `main` runs `.github/workflows/pages.yml` and publishes the live site at https://zr0aces.github.io/NexTHTax/. Commit, push, and deploy only when the user asks.

## Plans

Plans live in `process/general-plans/active/` and are named `<feature>_PLAN_<dd-mm-yy>.md`. Validate a plan with `node ~/.claude-x/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs --strict <plan>` when that script exists. Implement only an approved plan, and pass its exact path to the implementer.
