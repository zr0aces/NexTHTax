# Category navigation and explicit annual tax calculation

Date: 25 Oct 2026 · Status: implemented with safe rule gates; 2026 legal-data signoff outstanding

## 1. Outcome
Documents remain home. Selecting a category opens its list, not a long grid above it. A visible change-category action returns to the category chooser without destroying the editor/draft. Existing safeguards, old-format editing, backups and health plans remain intact.

Calculation is a distinct workflow for tax year 2026 (2569): single Thai residents, salary-only, under 65, no disability/dependents. Three sections: taxpayer facts; explicitly selected income/deductions; estimated result. Unsupported facts must block, never silently calculate a partial case.

## 2. Invariants and reuse
- App owns category scope, selection and dirty navigation guards; DocumentCategories and DocumentList remain presentational. Keep list/editor mounted while changing categories so return preserves work; apply the existing guard when committing an incompatible category.
- Reuse TaxInputs, source/worksheet fingerprints, WorkspaceSession mutation queue, readback verification, copy migration and transfer. Never auto-select records or modify evidence amounts while choosing claims.
- Explicit source selection copies an editable amount only on user action. Same-year active records only; one record may occur in only one worksheet event. Selection does not establish eligibility. Source edits/deletion/status/category changes invalidate confirmation.
- Manual rows explicitly show no attached evidence. Completeness confirmation includes acknowledgement of no overlap between manual and linked rows; unknown amounts are null, zero is explicit.
- Preserve 2025 calculator and health planning; new annual workflow is year 2026 only. Do not flatten imported income types, facts, treatments or multiple rows.

## 3. Data compatibility
Schema 5 expands worksheet deduction categories to allow donations and housing/other claims; current record/category vocabulary stays unchanged. Freeze schema 4 TaxInputs and year validation, in addition to frozen schemas 1–3. Read 1–4 in memory without writes and save representable changes in their original format. New worksheet facts require explicit copy upgrade; cancellation/source/history remain unchanged. Old readers reject schema 5 as newer; rollback uses original folder. Import clears confirmations as before. No automatic migration or reclassification.

## 4. Tax boundary
Extend the rule-owned numeric contract with an explicitly versioned annual table, source references and review gates rather than embedding 2026 constants in UI. Pure integer/BigInt engine handles reviewed per-type caps, combined life/health and retirement limits, staged donation caps, brackets, rounding and withholding settlement. Keep evidence amount, requested contribution and allowed deduction distinct. Non-supported/ambiguous products (notably ThaiESGX carry-forward versus new money, annuity allocation, generic e-Donation) block until an unambiguous reviewed rule is supplied. Classification alone never determines entitlement.

Production 2026 bundle currently contains coverage only; it is NOT reviewed and has no numeric table. Research official Revenue Department sources, record evidence and gaps. Do not mark it reviewed or reuse 2025 constants merely to make a result appear. If complete 2026 applicability/eligibility/rounding/settlement cannot be proved, deliver collection, confirmation and rule-blocked calculation UI; report the missing official rule signoff as a remaining release condition. Engine tests with synthetic reviewed fixtures are not legal signoff.

## 5. Execution
1. Record baseline tests and approved plan.
2. Refactor category chooser/list navigation; verify draft/focus/mobile behavior.
3. Introduce schema 5 + frozen schema 4 reader/writer and compatibility tests.
4. Add explicit annual worksheet rows/source selection, validation and fingerprint confirmation. Reuse saved form and storage actions; no new dependency/service.
5. Add annual rule contract and pure gated engine; research notes; result view explains blockers and unsupported cases, shows settlement only with trusted matching-year rules and current confirmed complete inputs.
6. Run focused tests, full unit/integration, typecheck, build and Chromium lifecycle tests; update README and this record. No commit/push/deploy in this task.

## 6. Acceptance proof
- Category choice shows only focused list; change-category/return preserves draft; canceled incompatible change preserves scope/draft; keyboard focus moves appropriately; 375px no overflow.
- Add uses selected parent/type; select never writes. Existing lifecycle, trash, backup and old-format edit tests pass.
- No auto selection when opening a year or adding documents. Explicit linked rows are editable, no duplicate/wrong-year/trashed/excluded sources, no hidden data loss. Manual rows labeled and completeness/no-overlap acknowledged.
- Source/worksheet/rule changes remove confirmation and hide settlement immediately, including async hash windows; pending/read-only/write failure retain draft and never claim success.
- Pure engine covers unknown/zero, eligibility, unsupported taxpayer/types, individual/shared/donation caps, deterministic ordering, integer overflow, rounding, positive/zero/negative settlement, wrong-year/untrusted/missing rules.
- Schemas 1–4 remain original-format editable; schema 4 rejects new donation worksheet fields; copy to 5 preserves source/history, JSON/ZIP round trips and imported confirmation resets.
- Production 2026 never shows numeric tax totals without reviewed matching-year tables. Current missing rule data is visible, not silently replaced with another year.

## 7. Non-goals / stop
No business/freelance/married/dependent cases, OCR, investment recommendations, filing, cloud, new dependencies, automatic legal eligibility, or tax-rule trust bypass. No redesign of existing saved health-plan behavior. Stop once the end-to-end approved UI and safety gates pass; clearly report any official-rule or native browser/manual accessibility verification still outstanding.

## 8. Execution evidence
- Baseline: 29 files / 227 unit/integration tests at `e7658d4`, clean working tree before the plan.
- Implemented focused category navigation with mounted hidden editor/list while choosing, explicit return action, keyboard focus and existing dirty guard. Existing records still open directly for editing; new empty workspaces start at categories.
- Added year-2026 annual worksheet with row-preserving edits, explicit source selection, manual rows, amount/type/eligibility review, completeness/no-overlap acknowledgement, save/readback and fingerprint confirmation. Descriptive edits invalidate annual review without altering the frozen 2025 fingerprint contract. Async hashes are bound to exact synchronous state, so stale hashes cannot expose totals on an intervening render.
- Schema 5 adds worksheet deduction categories only. Schemas 2/3 keep their original category/subtype vocabulary; schema 4 keeps its previous categories and expanded subtypes. Original-format writes reject unsupported facts before writes. Explicit copy 4→5, source/history preservation, JSON/ZIP round trips and import confirmation clearing have dedicated integration proof.
- Permanent purge now detaches affected worksheet source IDs atomically, preserving amounts while clearing confirmation/completeness and affected eligibility. This is required by the new source-selection path; it does not silently retain a trusted orphaned result.
- Added rule-schema-3 parser and integer annual engine with reviewed per-type/shared caps, deterministic allocation, staged donations, final-tax rounding and withholding balance. Synthetic fixtures exercise this contract only. No production rule bundle/catalog, dependency or deployment workflow changed.
- **Material limitation:** official 2026 rule verification is NOT complete. Production collection/review works, but annual numeric totals stay blocked. See [official evidence and release gates](2026-10-25-no-issue-tax-2026-rule-evidence.md). ThaiESGX carry-forward/new-money, annuity allocation and generic e-Donation remain unsupported unless sufficient reviewed rules and unambiguous persisted facts exist; no guessed eligibility or wrong-year fallback.
- `rtk npm run typecheck` passed. `rtk npm test -- --run` passed 32 files / 250 tests. Production build passed as part of `rtk proxy env LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:e2e`; all 23 Chromium E2E tests passed. Existing large-chunk warning remains.
- Existing salary-slice/health-plan proof remains in 2025; separate annual E2E covers 2026 selection/save/reopen/confirmation invalidation. Existing 2026 health plans have a secondary legacy entry rather than being deleted or flattened.
- Mobile screenshot inspected for geometry; environment still lacks Thai glyph fonts. Native Chrome/Edge folder picker, human Thai typography and screen-reader signoff remain manual/unperformed. OPFS automation is not evidence for those checks.
- No commit, push or deployment requested in this implementation step.
