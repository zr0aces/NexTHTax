# Last-four-commit review: safe local release preparation

Date: 2026-10-29
Complexity: MEDIUM — local release-file/Git safety and bounded CLI regression tests
Status: COMPLETE — user approved 2026-10-29; implementation and required verification passed
Execute anchor: `process/general-plans/active/release-review-fixes_PLAN_29-10-26.md`

## Overview

User requested Standards/Spec review of the last four commits and fixes until the reviewed scope passes. Pin base `51ea677ccd8e4b214e451f6feb3ba62a00504a68` and head `2d8fbd75379bb9fd68f6f744fb0876c83ec40ef8`: release tooling, tax-category limits, follow-up fixes and the 0.2.0 version bump.

The tax paths have an approved plan and no further actionable findings from the two review agents. Release tooling has no separate approved implementation plan; this artifact is the repository-required approval boundary for its corrections. CLI help/JSDoc and AGENTS.md are the release contracts, not an invented release product specification.

Goal: make the existing version CLI honor clean-tree, SemVer, synchronized-file and verification promises, without incorporating user changes into release commits or falsely claiming rollback. Prefer Node standard-library operations and the existing three-file ownership boundary; no new release framework or dependencies.

## Findings and reproduction

| Finding | Evidence and responsible layer |
|---|---|
| Dirty-tree release includes unrelated staged work (P1) | `release-version.mjs` reads but ignores gitStatus after writing files, stages App.tsx and commits all staged paths. Isolated fictional repository: `patch --git-tag` exited 0 and included `unrelated.txt` in the release commit. |
| Failed tagging leaves advanced history but claims rollback (P1) | Existing `v1.2.4` tag: commit succeeded, tag failed, catch restored old working files only; HEAD advanced and all three release paths were dirty. |
| Verification stops early (P2, Standards) | `runVerification` runs typecheck/tests/build only. AGENTS.md requires those followed by E2E and PDF, in order. |
| Lockfile consistency misses root-package drift (P2) | `lock.version ?? lock.packages[""].version` checks only one. Fictional fixture with root-package version 0.0.1 and other copies 1.2.3: `check` exited 0. |
| SemVer validator accepts invalid/lossy inputs (P2) | Exported parser accepted `01.2.3`, `1.2.3-alpha..beta`, `1.2.3-01`, `1.2.3+build.` and rounded `9007199254740993.0.0`. |

All reproduction Git writes occurred in automatically removed temporary repositories; the project worktree, index, tags and history were unchanged. Existing tests do not exercise these CLI failure paths.

## Public Contracts

- Preserve package version 0.2.0 in this task. Do not bump, tag, commit, push or deploy this project as part of review/fix verification.
- Release-owned files are exactly `package.json`, `package-lock.json` and `src/version.ts`. Preserve unrelated package fields, dependency versions, source and user changes.
- `--git-tag` must reject tracked/staged/untracked changes before writes; preflight repository and target-tag availability before mutation. A second pre-commit check must reject unexpected changes that appear during verification, rather than include them.
- Use argument-array Git process execution, not interpolated shell commands. Stage only the three version files after successful checks.
- Before a release commit exists, failed preparation restores owned files and any index changes made by this invocation. After commit succeeds, a tagging failure retains that valid release commit and matching files, exits nonzero, reports its commit ID and the failed tag step, and gives a manual recovery instruction. Never reset history, amend unrelated work, remove existing tags, or claim a full Git rollback after retaining a commit.
- Failed restoration attempts must report partial recovery honestly and preserve evidence. Do not overwrite independently changed file contents while restoring this invocation's writes.
- SemVer core components must follow identifier rules and safe integer arithmetic; reject leading zeroes, empty identifiers, numeric prerelease leading zeroes and unsupported-size core components. Preserve valid prerelease/build strings and current documented patch/minor/major behavior; no new prerelease policy.
- Validate both lockfile version locations plus package.json and APP_VERSION independently. For the repository's lockfile v3, missing/malformed values are inconsistent; do not use fallback selection to hide disagreement.
- Dry-run performs no filesystem or Git mutation. Unknown flags/ambiguous commands must fail before writes, particularly misspellings of --dry-run. Preserve documented command/flag aliases.
- `--verify` means the complete repository-required verification sequence. Include documented Linux browser-library prerequisites without changing dependencies or deployment configuration.
- Tax formulas, rules snapshots, schema v1, workspace writes and evidence retention remain untouched by release fixes.

## Touchpoints

| Files | Responsibility |
|---|---|
| `scripts/release-version.mjs` | Strict parser/arithmetic, complete version comparison, CLI preflight, owned-file preparation, full verification, truthful pre/post-commit failure handling. |
| `tests/release-version.test.ts` | Parser and bounds; CLI/check/dry-run/preflight/rollback/failure tests in isolated fictional temporary repositories. Never mutate the project during tests. |
| `docs/verification.md`, `docs/harness/verification.json` | Actual review findings, regression reproduction, test results and limitations. |
| This plan | Approval, completion checklist and execution evidence. |

## Implementation Checklist

### Phase 1 — Approval and red regressions

- [x] Obtain approval of this exact plan, then pin/check worktree and preserve any independent edits.
- [x] Add temporary-fixture tests for invalid SemVer and overflow, all four version locations, malformed/missing inputs, dirty staged/unstaged/untracked trees, tag collision and no-mutation dry-run/invalid arguments.
- [x] Add isolated failure-path tests for pre-commit failure, tag failure after commit and verification failure; assert file bytes, HEAD/index/tags and unrelated user work.
- [x] Exercise the real CLI/process boundary instead of asserting only intermediate mock values. Simulate expensive verification commands in a fictional fixture or narrow subprocess mocks for order/failure tests; the real repository still runs the full delivery suite separately.

### Phase 2 — Narrow corrections

- [x] Fix parser and overflow at the existing SemVer owner, and compare both lockfile fields independently with canonical valid version values.
- [x] Parse arguments once and reject malformed requests before reading/writing mutable release state; ensure check/dry-run do not create commits or tags.
- [x] Add clean-tree/tag preflight and restrict staging to owned version files. Recheck unexpected changes before staging/committing.
- [x] Separate pre-commit restoration from post-commit tagging failure. Preserve an already-created release commit; do not restore old file bytes beneath it or erase external edits. Report failed restoration paths without masking the original error.
- [x] Extend verification to typecheck → unit tests → build → E2E → PDF; configure browser prerequisites as already documented and expose command failures clearly.
- [x] Keep existing output/API where practical; update CLI help for exact failure/recovery semantics. Do not introduce a generic transaction service, new package, configuration system or unrelated cleanup.

### Phase 3 — Review loop and gates

- [x] Re-run both independent review axes over the pinned four-commit scope plus fixes. Fix remaining actionable task-related findings and repeat until both have zero open findings.
- [x] Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, then `node scripts/verify-pdf.mjs`, prefixing shell commands with rtk; use the documented Linux library path for Chromium.
- [x] Run `npm run version:check`, strict plan validation and diff whitespace checks; inspect Thai PDF page one and record actual results in both verification files.
- [x] Confirm version remains 0.2.0, no schema/rules/dependency changes occurred and no project commit/tag/push/deploy was performed.

## Blast Radius

Only local release CLI behavior, its tests and delivery evidence. Git write tests use isolated repositories, never the live project. Real release commits/tags remain explicit CLI opt-ins. This task does not modernize GitHub Actions, change release naming, introduce CalVer, alter valid normal version increments or reopen reviewed tax legislation.

## Acceptance Criteria

1. Dirty trees and pre-existing target tags cause nonzero exit with original files/index/HEAD/tags preserved; unrelated work never enters a release commit.
2. Pre-commit failure returns owned files/index to their original state when safe; partial restoration is explicitly reported. Post-commit tag failure keeps a consistent committed release, exits nonzero and reports recovery information without resetting history.
3. Invalid/unsafe SemVer and malformed CLI inputs fail without writes; valid forms work. All four version locations must agree and be valid for check to pass.
4. Dry-run changes no file/index/HEAD/tag. --verify runs all five gates in the required order and fails on any gate failure.
5. Two-axis follow-up review has zero open actionable findings in the defined scope, all required delivery checks pass, and final evidence accurately records omissions and results.

## Phase Completion Rules

Do not implement before approval. Capture failing regression evidence before each responsible fix. Finish each phase's checklist before reporting it complete. Failed gates are incomplete delivery, not acceptance. Stop at the acceptance criteria; request an amendment if a schema or public release-policy change beyond these recovery semantics becomes necessary.

## Verification Evidence

Planning evidence (2026-10-29): pinned nonempty four-commit diff; both independent axes completed. Standards found five issues, Spec four, with the omitted verification gates Standards-only. Temporary-fixture reproductions confirmed dirty commit contamination, failed-tag partial rollback, root-lock version false pass and invalid/unsafe SemVer. No project runtime/release files changed at planning stage.

Baseline suite before any release fixes (2026-10-29): typecheck passed; 195 unit/integration tests passed across 7 files; build passed with 224 precached assets and the existing >500kB chunk warning; 23 Chromium E2E tests passed in 23.4 seconds; Thai PDF verification passed (4 pages, 4 expected strings and first-page rasterization). `version:check` reported 0.2.0 consistent under its current incomplete comparison. These passing baseline checks do not cover or resolve the reproduced release bugs. Only this draft plan is added; no production files, index, project history or tags changed.

Test Procedure: focused release regressions first, then the repository's complete five-gate sequence in the exact order listed in Phase 3. E2E creates `test-results/artifacts/annual-thai.pdf`; PDF verification must follow it. Check actual browser prerequisite paths before invoking tests. Record counts and failure/skip caveats rather than reuse previous delivery numbers.

Context pointers: `process/context/all-context.md` and `process/context/tests.md` are absent; do not create them just to satisfy plan tooling. Use AGENTS.md, existing tests and the verification records as source of truth.

## Resume and Execution Handoff

Approval received 2026-10-29 for `process/general-plans/active/release-review-fixes_PLAN_29-10-26.md`. Implementer read this exact path and completed Phases 1–3. Next Step: stop with verified local changes; await explicit commit/release instructions. Structural validation alone is not implementation proof; runtime results follow.

## Implementation completion — 2026-10-29

- Captured 32 red failures on the original CLI, then fixed the five original findings. Kept existing valid bump behavior while enforcing safe integer arithmetic, strict identifiers/arguments and independent four-copy consistency.
- Used native path-limited Git commits to own the temporary index rather than manually stage/unstage user data. Round 2 demonstrated native --only still allows hooks to stage extra paths; added delegating guards after all three modifying commit-hook phases, preserved other hooks/configuration, and validated committed/current outputs before tagging. Five added hook/ref/postcommit regressions were red before correction.
- Added native Git-ref preflight, guarded owned-file restoration with explicit partial failure reports, safe retained-commit finalization failure, and the full five-stage verification pipeline. No history reset or tag deletion; no hook bypass.
- Final release tests:55 passed, including staged/unstaged/untracked work, tag conflict, bad arguments, missing/drifted/invalid versions, safe arithmetic, dry-run, each verification-stage failure, write/restore failure, independent changes, custom/disabled hooks, postcommit edits, invalid Git tag names, missing files, noGit and symlink protections. All fixtures fictional; Git mutations were confined to temporary repositories.
- Standards and Spec review round 3: zero open actionable findings. Final real-project sequence passed: typecheck,242 unit/integration tests, build,23 Chromium E2E tests(23.5s), Thai PDF4 pages with first-page visual inspection. Version check0.2.0, strict plan validator and diff/index/protected-file checks passed. Evidence stored in both required verification files.
- No new dependency, schema/tax-rule/package/lock/app-version changes, project commit/tag/push/deploy. Verification used Linux; Windows/macOS release execution, Safari/Firefox, actual OS picker and live hosting remain untested. Existing build chunk warning remains outside scope.


## User-authorized publication handoff — 2026-10-29

After review completion the user prepared version0.3.0 and explicitly requested commit, push and deploy. This newer request authorizes publication and supersedes the review-stage no-release constraints for this handoff only. The release's four version copies agree at0.3.0; reran all five gates successfully (242tests,23E2E in25.3s,4-page Thai PDF) and refreshed both verification records. No additional Git tag is requested. Next Step: commit reviewed fixes plus user version bump, push main, watch Pages workflow for that exact commit, and verify the live site/version without sending workspace data.
