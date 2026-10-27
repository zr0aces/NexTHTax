# Tax year 2569: reviewed category limits and clear entitlement display

Date: 2026-10-27
Complexity: MEDIUM — legal-data review, snapshot-safe presentation, regression coverage
Status: COMPLETE — user approved plan 2026-10-27; all implementation verification gates passed
Execute anchor: `process/general-plans/active/tax-2569-category-limits_PLAN_27-10-26.md`

## Overview

Implement the user's review request for ลดหย่อนภาษีปี 2569 (2026): make category limits, units, percentage bases, and shared ceilings understandable; complete missing catalogue entries without granting unverified deductions. The infographic `/tmp/tax-2569.jpg` dated 22 October 2569 is a discovery checklist, not legal authority. Preserve correct existing calculations rather than replace them with infographic shorthand.

The user requested planning followed by implementation. Repository instructions require an approved plan first, so this artifact is the approval boundary. No application or tax-data edits are authorized merely by creating it.

## Current behavior and trace

- `public/rules/2569.json` is loaded and validated by `src/domain/rules.ts`; `getRules(2569)` clones it for new workspaces. Existing workspaces retain their own snapshots.
- `src/domain/engine.ts:calculate` owns income ratios, fixed allowances, shared ceilings, pension allocation, donations, and ESGX carry-over. Correct caps already exist for most reviewed categories.
- `src/domain/fixed-allowances.ts` owns supported annual family claims, person counts and the base/additional-child relationship. The 60,000 child entitlement is already implemented as 30,000 base plus 30,000 additional.
- `src/ui/overview.tsx` renders engine results, but cards do not clearly show the statutory ceiling or its unit. `src/ui/categories.tsx` lists status without limits. `RuleConditions` in `src/ui/rules-dialogs.tsx` displays a generic cap and percentage, without always distinguishing per-person limits and precise bases.
- `src/domain/model.ts` freezes schema version 1. There is no pregnancy identity, adoption relationship or cross-year Solar claim history. These cannot safely become automatically calculated rights in this task.
- Existing replacement flows: `App.tsx:readRules` checks workspace/year identity while reading the file; `use-workspace.ts:applyRules` requests a backup download before replacement and rechecks workspace identity. Its busy UI is inert during that operation. Do not infer a durable backup or a complete stale-preview guard from these checks: browser downloads cannot prove that the user saved a file, and a preview may outlive the workspace/year it was prepared for. Bind preview confirmation to its original workspace/year and recheck after asynchronous backup before the single commit.
- `src/domain/workspace.ts:replaceYearRules` invalidates records when the corresponding rule meaning or shared caps change; names, sources, versions and review dates are excluded from meaning. A metadata-only replacement currently returns the original data. Adding catalogue entries is a meaning change to the set, but does not itself reset unchanged records. Replacement rejects removing any category with existing records, including custom categories. Preserve these contracts; document metadata-only no-op behavior rather than promise every version-only update is installed.
- PDF/CSV (`src/reports/annual-report.tsx`) and ZIP index (`src/storage/zip.ts`) already consume domain calculations; no independent formulas will be introduced.

## Scope and legal-data decisions

All monetary amounts in this table are baht. Stored values remain integer satang.

| Category | Target meaning and data decision |
|---|---|
| Personal / no-income spouse | Preserve 60,000 each; spouse requires legal eligibility. |
| Children | Preserve 30,000/person and additional 30,000 for qualifying second-and-later children born from 2561; explain combined 60,000, never add 60,000 again. |
| Adopted children | Add pending `adopted-child` (group `family`, formula `paid`, cap `null`); explain 30,000/person, maximum three and interaction with children by law only after checking RD source. Define the existing `child` claim as children by law, not adopted children, in reviewed conditions. No calculated adoption claim until relationship/count protection is designed separately; do not reinterpret legacy child records silently. |
| Parents / disability care | Preserve 30,000/person (parents maximum four when eligible) and 60,000/person for qualifying dependants; do not imply every dependent qualifies. |
| Pregnancy / childbirth | Record reviewed 60,000-per-pregnancy information, reimbursements and cumulative cross-year conditions. Remain pending: no annual cap masquerading as a pregnancy cap. |
| Life / own health | Preserve 100,000 life, 25,000 health, combined 100,000; explain pension premiums may occupy unused life capacity without double-counting. |
| Parents' health | Preserve total 15,000, not 15,000 per parent; explain allocation between payers. |
| Spouse life insurance | Preserve 10,000. Activation requires the legal gate below; otherwise pending with a recorded reason. |
| Social security 33 | Preserve actual paid capped at 10,500, ordinary 875/month; no assumption of twelve full contributions. Do not create a fixed southern 8,750 ceiling without the applicable official period and geographic conditions. |
| Social security 39 / 40 | Keep pending in this delivery: 5,184 is a normal-rate annual reference for 39, not proof of current-year eligibility. Explain actual eligible member payments and possible reductions; do not count state contributions or treat 40 as unconditionally uncapped. |
| RMF / provident / pension | Preserve 30% income and 500,000; 15% wages and 500,000; 15% income and 200,000 for the pension additional portion, respectively. |
| GPF / NSF | Preserve member-only GPF 30% salary and 500,000; NSF 30,000. |
| Private-school teacher fund | Activation requires the legal gate below: verified member-only actual-paid 500,000 and the retirement shared-cap rule; otherwise keep pending and retain cap `null`. |
| Retirement group | Preserve shared 500,000 across applicable categories. Individual ceilings are not additive. |
| Thai ESG / ESGX new | Preserve combined 30% income and 300,000 for 2569, separate from retirement. Preserve applicable holding-period warnings. |
| ESGX from LTF | Preserve supported 2568 transfer provenance, first-year claim and remaining entitlement divided by four for 2569–2572; maximum 50,000/year is not universal entitlement. |
| Social enterprise | Keep pending; investigate the infographic's 100,000 and describe it as unconfirmed until current primary sources establish the rule and conditions. |
| Housing interest | Preserve 100,000 total, qualifying interest only and co-borrower allocation. |
| Art purchase | Add pending `art-purchase` (group `special`, formula `paid`, cap `null`); investigate the claimed 100,000/year. Do not put an unverified amount into an authoritative cap field. |
| Solar Rooftop | Preserve pending 200,000 with official legal basis, correct purchase window and connection-year/one-time restrictions; no activation without cross-year safeguards. |
| CCTV | Add pending `cctv` (group `special`, formula `paid`, cap `null`) with explicit current-year uncertainty. RD FAQ found so far covers 2559–2563 business premises/income, not a general salaried-person deduction for 2569. No activation based on the infographic. |
| Political donation | Preserve 10,000. |
| General / special donations | Preserve sequential 10% bases; special multiplied amounts share the special ceiling before the general deduction. Education/sport retain verified specific rules. No blanket doubling for all hospitals or social-development recipients. |

Verified rows retain current formulas/caps in this plan; evidence requiring a correction triggers the amendment gate below. Unconfirmed infographic amounts may appear only as clearly labelled research notes, never as available entitlement. For unresolved rights, present “รอตรวจสอบ · ยังไม่นำมาคำนวณ”.

### Legal activation gate and bounded research

Only `spouse-life` and `teacher-fund` are activation candidates in this delivery. Each requires a ledger entry with a primary-source URL and specific section, effective period covering 2569, eligible payer/payment/policy or fund conditions, cap and applicable shared cap, evidence needed from the individual, and why existing fields plus explicit confirmation suffice. Cover the gate with the activation regression cases below. A missing, inaccessible, contradictory or historical-only source fails the gate: retain pending; log the uncertainty. “Verified law” and “supported by the app” are separate decisions.

Use at most three targeted primary-source searches per unresolved category, following directly referenced legal instruments as needed. Stop at a clear applicable source or log unresolved when the bound is reached. This does not mean checking every law in the app anew. Other pending categories remain pending even if research finds a general entitlement: activation of those categories needs separate review of missing safeguards. If evidence contradicts a currently verified formula/cap, record the exact issue and request a plan amendment before changing that calculation; this plan authorizes clarifying data and the two explicit activation candidates, not an open-ended tax-engine rewrite.

New pending entries use `kind: deduction`, `rateBps: null`, `sharedCap: null`, `multiplier: 1`, unique stable IDs and an order consistent with their existing group. The year window identifies the catalogue year, not a claimed legal effective date. Do not invent a legal source or reviewed date when the law is unresolved; record review scope in the research ledger. Pending pregnancy retains cap `null`: describe the verified per-pregnancy ceiling in conditions rather than storing an annual numeric cap.

## Public Contracts

- No changes to `src/domain/model.ts`, persisted fields, schema version, record meaning or unknown-version rejection. No migration is approved here.
- Additional pending categories use existing rule fields and stable new IDs; respect the maximum 150 categories. Do not rename existing category IDs or reclassify existing family records.
- Update snapshot/rule versions and reviewed dates accurately; do not mark unchecked laws verified or fabricate source authority. Keep overall ruleset partial.
- Existing user snapshots never auto-upgrade. New workspaces use the new bundled snapshot; existing workspaces opt in through existing preview/backup/confirmation flow.
- Privacy, evidence retention, single-candidate commits, expected workspace/year checks and failed-save behavior remain unchanged.
- Calculation results remain authoritative for allowed/remaining amounts. Display code may format stored statutory metadata but must not calculate caps, shared remainders, contribution ratios or tax.
- Proposed bundle version: `2569.3-reviewed-2026-10-27`; use the actual implementation review date if later. Update only changed rule versions/review dates after recording evidence; an unchanged rule retains its audit trail.

## Touchpoints

| Files | Planned responsibility |
|---|---|
| `docs/tax-research-2569.md` | Dated source ledger: legal period, cap/unit/base/shared ceiling, confidence, support limitation, activation decision; correct stale pending summaries. |
| `public/rules/2569.json` | Reviewed descriptions/conditions/sources/versions and pending catalogue entries; only legally supported cap/status changes. |
| `src/ui/format.ts` or one focused new UI formatting module | Shared Thai statutory-limit description using existing snapshot metadata; no stored field or monetary formula. Reuse `isAnnualCompatible`/`quantityKindOf` for supported annual family units; other specialized restrictions come from snapshot descriptions/conditions, not a second hardcoded legal catalogue. |
| `src/ui/categories.tsx`, `src/ui/overview.tsx`, `src/ui/rules-dialogs.tsx` | Consistent statutory ceiling, ratio base, per-person/per-pregnancy unit, shared-cap explanation and separate computed remainder/status. Conditions must still support custom/imported rules without inventing legal metadata. Explain in Help how to obtain and import the bundled file; keep technical JSON/schema terms inside the explicit rule-inspection flow. |
| `src/styles.css` | Only styles needed for readable limit text, wrapping and mobile accessibility. |
| `src/domain/engine.ts`, `src/domain/rules.ts`, `src/domain/workspace.ts` | Reuse existing calculation/import/replacement behavior; change only if approved acceptance requires it and tests first demonstrate the gap. No speculative rewrites. |
| `src/App.tsx`, `src/use-workspace.ts` | Bind rule preview/application to expected workspace/year, reject stale confirmation and recheck after backup before one commit. Preserve backup failures and saved-status semantics. |
| `tests/engine.test.ts`, `tests/storage.test.ts`, `tests/category-limits-ui.test.ts`, `tests/e2e/app.spec.ts` | Data validation, pending exclusion, boundary/shared-cap behavior, snapshot replacement and UI proof. New UI tests follow the existing `renderToStaticMarkup` pattern; use browser E2E for interactive behavior. |
| `docs/verification.md`, `docs/harness/verification.json` | Actual delivery results, versions and important limitations. |

## Implementation Checklist

### Phase 1 — Source review and legal-data ledger

- [x] Recheck cited primary sources in existing research notes, recording applicability to 2569 rather than treating webpage update dates as law.
- [x] Investigate art, CCTV, southern contributions and social enterprise with a bounded primary-source search. If no applicable law is established, record unresolved and stop the search; do not block all other work.
- [x] Resolve the spouse-life and teacher-fund activation gates explicitly. User confirmation of a record is not a substitute for verifying the law.
- [x] Produce source-backed data edits and pending catalogue entries from the table; retain existing accurate caps and bump affected versions.
- [x] Store the source ledger in the repository, so execution does not depend on `/tmp/tax-2569.jpg` remaining present. Do not add the third-party image or personal documents to fixtures.

### Phase 2 — Snapshot-driven limit presentation

- [x] Add one shared limit formatter/view component; use snapshot values, precise income-base text and shared-cap amounts from the current workspace, not the bundled year file.
- [x] Pass the current `RuleSet` to conditions/limit presentation where required; `RuleConditions` currently receives only a `TaxRule`. Update its call sites in `App.tsx`. A shared-cap key without an amount must never render `undefined`, zero capacity or an invented cap: `donation-special` is a percentage-based pool and intentionally has no `sharedCaps` amount.
- [x] Show “เพดานตามหลักเกณฑ์” separately from “ใช้แล้ว” and “วงเงินคงเหลือที่คำนวณได้”; for percentages explain both constraints without calculating in UI.
- [x] Show units and restrictions consistently across category choice, cards and conditions. Never label pending/expired/document-only caps as usable remaining rights.
- [x] Explain base-plus-additional child entitlement and pension additional-portion meaning without inventing a second calculation path.
- [x] Present the pension 200,000 as the additional retirement portion, not a ceiling on the whole category's allowed amount; unused life capacity can legitimately make the category's allowed total exceed 200,000. Show donation 10% as the legal deduction ceiling after multiplication, not as 10% of cash paid or a fixed baht pool.
- [x] Ensure future-year/custom/imported rules do not inherit unsupported 2569 amounts, unit assumptions or group values. Unknown/null metadata must have an honest fallback.
- [x] For pending/expired/document-only rules, show status before any reference cap. Label any reviewed reference ceiling as information only and suppress usable remainder/progress claims. For unreviewed infographic numbers, use research notes, not a statutory-ceiling label. Incompatible imported family rules use generic snapshot text rather than an automatic “per person”/“per year” interpretation.
- [x] Keep old-workspace rules update opt-in; explain the existing import/preview/backup steps in help/docs rather than silently installing new rules.
- [x] Provide a user-initiated download link to the bundled rules file using Vite's build-provided base URL (currently `./` in `vite.config.ts`), with the bundled target year/version and a same-year warning. Keep the installed snapshot's year/version labelled separately from the available bundle; never label `getRules(2570)` as an available downloadable verified bundle. The link targets `rules/2569.json`, not an absolute `/rules/2569.json` path. This downloads public app metadata only, never workspace data. Keep import local and usable offline once the file is saved; the existing cache-manifest already includes the public rules file. Preview cancel leaves the snapshot unchanged; confirm remains bound to the original workspace/year before and after backup. Explain that the backup download must be checked by the user.
- [x] Preserve custom-category replacement rejection: if the incoming bundle omits a category containing records, stop with the existing error and retain all data; do not silently merge, delete or remap custom records. Document this limitation in help and test it.

### Phase 3 — Regression proof and delivery record

- [x] Add unit assertions for preserved cap values, percentage bases and shared groups; schema validation of the revised bundle and pending new entries.
- [x] Cover health 25,000 plus life shared 100,000, retirement shared 500,000, ESG shared 300,000, NSF 30,000, normal M33 10,500 versus lower actual paid, and ESGX carry cases with 20,000 and 50,000 entitlements.
- [x] Prove base child plus additional is 60,000 for the qualifying child, not 90,000; maintain existing family duplicate/count protections.
- [x] Prove every pending category contributes zero even when a record is confirmed with complete documents; pending pregnancy/Solar cannot become paid annual claims.
- [x] Test any newly activated paid rule at zero, cap, above cap, unconfirmed and ineligible; teacher-fund amounts must consume retirement capacity if activated.
- [x] Verify imported alternative cap values render from their snapshot; old ZIP/workspace snapshots remain unchanged until explicit replacement; changed conditions require reconfirmation and attachments survive.
- [x] Use existing `examples/fictional-tax-2569.zip` as a historical-snapshot regression fixture; keep its embedded rules unchanged. Add tests for compatible and incompatible imported family metadata, absent shared-cap amounts for donation-special, pension life allocation, null income and future-year rules. Reuse existing passing coverage rather than duplicate it.
- [x] Test rule-update download at the root and nested `/NexTHTax/` hosting location with the current relative Vite base, without changing deployment config. Assert URL resolution for both locations in focused tests and exercise an actual browser download under the normal preview server. Verify the file matches the available-bundle year/version and passes `importRules`; inspect build output/service-worker asset inclusion for offline delivery. Test cancellation, wrong-year input, custom-record rejection, backup failure and stale preview/application: each must preserve the active data and pre-operation save state without a new success notice. If the user deliberately switched workspaces/years after preview, reject the stale apply without reverting that switch. A no-op metadata-only replacement must not be claimed as installed.
- [x] Add browser checks for category selection, card/conditions limit agreement, pending messaging, shared ceilings, mobile wrapping, keyboard-accessible conditions and no workspace-data network traffic.
- [x] Run the full verification sequence and record only actual results; inspect the generated Thai PDF after verification.

## Blast Radius

Main changes are reviewed tax metadata and read-only UI information. New pending categories expand the catalogue without changing totals. Spouse-life/teacher-fund activation, if evidence permits, affects only new or explicitly updated snapshots and confirmed eligible records. Existing snapshot totals must remain identical. No new dependencies, backend, analytics, schema migration, release, commit, push or deployment.

Adoption relationship validation, cross-year pregnancy/Solar tracking, a universal tax-return engine, automatic rule downloads and unverified special-policy activation are explicit non-goals. These require separate approved modeling/migration work if requested later.

## Acceptance Criteria

1. Every reviewed infographic category is either represented with source-backed limits or explicitly marked unresolved/document-only; no unverified right increases calculated deductions.
2. The user can distinguish statutory ceiling, per-person/per-pregnancy units, shared limits, actual paid and engine-calculated remaining capacity without reading JSON.
3. Reviewed caps already correct do not regress, group ceilings are not additive, and a qualifying second child is 30,000 base plus 30,000 additional.
4. Current-year rules changes have traceable primary-source reasons, accurate versions and no silent modifications of existing workspaces or future-year rules.
5. All supported UI/report/export totals continue to originate from `calculate`; schema/privacy/evidence/write invariants hold.
6. All required automated checks pass before calling implementation complete. A failing or unavailable gate is an incomplete delivery, with its cause and limitation reported honestly; recording a failure is not acceptance. No release action is performed.
7. An existing-workspace user can obtain the public rules file and explicitly import it; stale previews, failed backups, wrong-year files and recorded custom-category omissions cannot change the active workspace. Version-only no-op behavior is disclosed rather than labelled a successful upgrade.

## Phase Completion Rules

Complete source review before finalizing status/cap edits. Complete focused data/display tests before UI integration. A phase is complete only when its checklist and applicable acceptance criteria are demonstrated. Do not expand scope to solve unsupported rights by changing schema. Stop and request a separate migration plan if safe implementation needs new persisted facts.

## Verification Evidence

Planning-stage checks: inspected the rule schema, bundled data, calculate path, family helpers, category/cards/conditions, import/replace flow, report and ZIP calculation consumers. No application tests run at planning stage.

### Plan review loop (2026-10-27)

Round 1 traced the plan against `model.ts`, `rules.ts`, `engine.ts`, `fixed-allowances.ts`, `workspace.ts:replaceYearRules`, `App.tsx:readRules`, `use-workspace.ts:applyRules`, UI limit consumers and existing engine/storage/E2E tests. Findings corrected in this artifact:

- Replaced open-ended formula/cap corrections with bounded source research, a checkable two-category activation gate and amendment requirements for unexpected verified-law conflicts.
- Specified pending IDs, null caps, adoption separation and per-pregnancy semantics; no new persisted fields or automatic reinterpretation of old records.
- Removed the implicit duplicate legal catalogue in UI; units and reference restrictions use supported family helpers or snapshot text, with imported/future-year fallback.
- Covered the actual conditions-component input seam, pension's two-part entitlement and donation-special's missing fixed shared-cap amount.
- Added an end-to-end public-rules acquisition path and explicit metadata-only/custom-record replacement limits.
- Corrected the assumed backup/preview safety contract and assigned expected-identity checks and rejection tests to their owning files.
- Changed completion from “pass or document failure” to passing all required gates; documented failures are incomplete, not accepted.

Round 2 re-traced download, caching and update-test assumptions against `vite.config.ts`, `scripts/cache-manifest.mjs`, `playwright.config.ts` and `tests/engine.test.ts`. Corrected the mistaken configured `/NexTHTax/` base (actual base is relative `./`), specified root/nested URL-resolution proof without changing hosting configuration, separated installed versus available versions, and clarified failure/stale-preview tests to preserve the active user choice and pre-operation save state. Assigned deterministic UI proof to `tests/category-limits-ui.test.ts` using the repo's existing server-render pattern.

Final review completion criterion: reread the revised artifact, trace every changed contract to its owner, check all reviewed categories have a bounded data decision, verify acceptance-to-test coverage, then run the strict plan validator. Record actual results below; do not treat this planning review as implementation verification or user approval.

Round 3 result (2026-10-27): reviewed the corrected legal gates, snapshot/display ownership, update acquisition/confirmation/rejection path and acceptance-to-proof mapping. No remaining actionable plan findings identified. Strict plan validation passed with zero warnings and zero failures. Application implementation and legal-source revalidation remain unexecuted Phase 1–3 work; the review does not approve execution or certify the infographic's claims.

Acceptance-to-proof map for execution:

| Criteria | Required proof |
|---|---|
| 1, 3 | Source ledger and validated bundle; engine cap/shared-cap/pending/activation boundary cases. |
| 2 | `category-limits-ui.test.ts` for snapshot values, units, status and specialized fallbacks; E2E for cards, conditions, selection, keyboard and mobile. |
| 4, 7 | Historical ZIP roundtrip, replacement/reconfirmation/attachment tests, stale apply and failed-backup E2E, public-file download/version and URL-resolution checks. |
| 5 | Reuse engine totals; existing storage/privacy/export regressions plus no-user-data-network browser checks, Thai PDF extraction/raster inspection. |
| 6 | All five delivery commands pass in order and both verification records reflect the actual run. |

Implementation Test Procedure, in repository-required order (prefix shell commands with `rtk`):

1. `rtk npm run typecheck`
2. `rtk npm test`
3. `rtk npm run build`
4. `rtk proxy env LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:e2e`
5. `rtk proxy node scripts/verify-pdf.mjs`

E2E must first generate `test-results/artifacts/annual-thai.pdf`. Use existing transitive canvas dependency; report missing prerequisites rather than silently adding dependencies. Record actual counts/results in both verification files and important caveats (native folder picker, untested browsers, unresolved legal conditions). Do not claim visual PDF review unless performed.

Context pointers: `process/context/all-context.md` and `process/context/tests.md` do not currently exist; do not invent them for this feature. Existing source of truth is `AGENTS.md`, the research document, tests, and delivery verification files.

## Resume and Execution Handoff

Next Step: implementation complete; await user review, with no release actions authorized. The user approved `process/general-plans/active/tax-2569-category-limits_PLAN_27-10-26.md` on 2026-10-27; the implementer read that exact path and completed Phases 1–3 with the legal activation gates. Evidence and limitations are recorded below. No further implementation is pending under this plan.


## Implementation completion — 2026-10-27

- Completed Phases 1–3 using this exact approved anchor. Source ledger in `docs/tax-research-2569.md` passes spouse-life and teacher-fund activation gates; all other pending rights remain excluded.
- Bundle `2569.3-reviewed-2026-10-27`: 46 categories, including three new pending catalogue entries. Preserved existing cap/formula values except approved teacher-fund activation from null to 500,000 and spouse-life status activation. No schema or tax formula changes.
- Added snapshot-only limit presentation, explicit bundled-file download, expected workspace/year-bound rule confirmation and honest no-op/backup messaging. Cleared inherited numeric conditions in newly created future-year pending rules; existing saved snapshots remain untouched.
- Required final sequence passed: typecheck; 194 unit/integration tests; static build with 224 precached assets; 23 Chromium E2E tests (26.3 seconds); Thai PDF verification (4 pages). Visually inspected desktop/mobile screenshots and the PDF first page.
- Tests were developed alongside UI integration rather than completed before integration; all specified behavioral gates passed before completion. Existing category-chooser E2E assertion was narrowed to fixed claims so the new pending adoption document category is allowed. No missing persisted facts were introduced.
- Important limits: unresolved legal measures remain pending, browser cannot certify backup download completion, native OS picker/Safari/Firefox/screen reader/live hosting untested, and build retains a chunk-size warning. Full results are in `docs/verification.md` and `docs/harness/verification.json`.
- No commit, push, deploy, dependency addition or historical fixture replacement. Next Step: stop implementation; release only on an explicit user request.
