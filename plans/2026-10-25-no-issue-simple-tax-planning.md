# Simple tax calculation and follow-through

Date: 25 Oct 2026 · Status: phase 1 and the single-health-action phase-3 slice implemented; phase 2 legally gated; broader investment categories remain unsupported

## Agreed outcome

Help a Thai-resident, single salaried individual compare affordable, legal tax-saving actions with doing nothing, then follow one saved plan. Optimize the user's financial outcome, not deduction size. New planning targets 2026; each year's rules stay independent.

## Phase 1 — simplify the existing app (implemented)

- Three destinations: calculation/planning, documents, tools. One shared tax-year selector. No nested navigation.
- Open on calculation/planning. Separate tax inputs, saved calculation results, and optional comparison. Show the supported scope and blocked final-tax status immediately; disclose detailed caveats on demand.
- Documents remain editable with existing evidence, review statuses, search and trash. Move lengthy yearly reports behind a disclosure instead of putting them above every task.
- Put rule management and backup/restore in tools. Keep save failures, conflicts, read-only state and backup guidance visible.
- Preserve existing UI/modal work, folder storage, schema, rules, migration, transfers and arithmetic. Guard worksheet drafts on navigation, including year/folder changes. Disable writes while read-only or saving.
- Remove absolute privacy marketing: local storage does not prevent OS/cloud-folder synchronization.

Done when task navigation, draft guards, save/reopen, rule/backup access, keyboard/mobile layout, unit tests, typecheck, build and Chromium flows pass. Native Chrome/Edge folder picking remains a manual check. No new dependency or persisted contract.

## Phase 2 — trusted annual calculation (planned, legally gated)

Use the existing domain engine and pinned rules. Verify period-specific 2026 salary rules, eligibility, limits and rounding against official sources; record citations and independently calculated boundary fixtures. Show unsupported cases explicitly. Never infer eligibility, interpret blank as zero, borrow 2025 rules, or publish savings/final payable/refund with unresolved rules. Keep withholding separate from deductions.

Done when supported annual cases have independently verified fixtures and incomplete/unsupported cases fail closed. This phase is not delivered by phase 1.

## Phase 3 — one plan and a simple checklist (health slice implemented)

### Approved implementation slice (follow-up)

Implement one health-premium action per year's selected scenario, matching the existing engine's only supported planning category. Keep other saved scenarios intact. Manifest schema 3 adds an optional nullable `plan` to each year: selected scenario ID, actual amount, payment declaration, baseline-exclusion declaration, one evidence record ID, and a completion digest. Existing scenario owns amount, budget, eligibility and liquidity/holding constraints; no duplicate financial inputs. Deadline remains visibly unknown until sourced annual deadline data exists. Investment categories remain unsupported rather than guessed.

Frozen schema 1/2 readers remain available. Opening either prompts an explicit copy into a different empty folder using existing inventory, lock, capacity, read-back and incomplete-marker safeguards. Source and historical snapshot bytes stay unchanged; old apps can still open the original, not the schema-3 copy. JSON/ZIP imports require upgrade consent for either old version and clear all imported confirmation/completion hashes. Old readers reject schema 3 as newer. No in-place upgrade.

Completion is derived, not a freely editable status: paid + eligible + explicit confirmation that this expense is additional to the worksheet + actual amount matching one reviewed, same-year health evidence record + verified attachment bytes + current context digest. The digest covers saved worksheet, selected scenario, annual rule identity, action and evidence/attachment metadata. Changes invalidate completion. Actuals never mutate worksheet amounts automatically or get added twice; a record already linked into the worksheet cannot also support this additional action. Purge/year-move clears its plan evidence link atomically. Unverified rules prevent both projected and completed savings even when an action is completed. Missing dates/eligibility/budget are never invented.

Reuse existing scenarios and document evidence. Store one selected plan per year, a spending limit and explicit liquidity/holding constraints. Compare only verified, supported categories, including doing nothing. Show outlay, tax saving, invested assets and lock-up separately; insurance is not an investment return. No fund/product recommendations or global-optimum claims.

Each action has amount, verified deadline (unknown when unsourced), evidence links and status: planned / needs review / completed. Completion requires explicit payment, eligibility and evidence confirmation. Uncertain actions stay out of confirmed estimates. Recalculate when income, evidence, rules or actual amounts change; invalidate stale confirmation. Projected and completed estimates remain separate, never labelled authority-approved.

Persist through the workspace mutation/validation path, not browser storage. Before adding fields, specify a versioned compatibility-safe migration, preserved-original rollback and JSON/ZIP round-trip tests; existing readers use strict schemas. Do not smuggle tracking fields into scenario labels or notes.

Done when save/reopen, cross-year isolation, evidence invalidation, stale rules, insufficient budget, unknown eligibility, failed writes and transfer/rollback tests pass end to end.

## Non-goals

Accounts, cloud services, purchases, filing, reminders, multiple dashboards, financial-product selection, unsupported family/business tax cases and new frameworks.

## Baseline and verification ledger

### Initial simplification pass

- Existing uncommitted changes: App, stylesheet, worksheet, modal component and a separate design-review plan. Preserve rather than reset them.
- Initial check: 172 tests passed; App suite/typecheck could not parse the partially edited shell (duplicate closing markup at its end). Shell integration is part of phase 1; do not count the starting tree as a passing baseline.
- Final evidence: `npm test -- --run`: 23 files / 180 tests passed. `npm run typecheck`, `npm run build`, and `git diff --check` passed. Build retains the existing large-chunk warning; no bundling/dependency expansion in this task.
- Chromium: 8/8 E2E tests passed, covering task navigation, one year selector, disclosures, discard/cancel draft guards, year isolation, worksheet save/reopen, document subtype save/reopen, search, and entry/offline/privacy behavior. A 375px worksheet viewport has no horizontal overflow.
- Browser runtime required the already-installed libraries via `rtk proxy env LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:e2e`. The initial plain browser run could not launch because libatk was not on the library search path. No OS packages were installed.
- Screenshots: `test-results/simple-workflow-mobile.png` and `test-results/simple-workflow-desktop.png`. Headless environment lacks Thai fonts; these prove layout geometry, not final Thai typography. Native Chrome/Edge folder picker, full keyboard/screen-reader review and human Thai-font visual signoff remain manual checks.
- Confirmed no changes to domain math, persisted schema, storage or public rule bundles. Existing unrelated plan moves and UI/modal work remain intact.
- Scope delivered: simplified existing UI and budgeted experimental health comparison with a do-nothing baseline and cash-cost explanation. Verified 2026 calculations and saved checklist tracking are still pending phases, not shipped capabilities.

### Follow-up implementation — 25 Oct 2026

- Replaced the unsaved experimental comparison with one saved health plan per year and an expandable payment/evidence checklist. Draft guards aggregate worksheet and plan edits. Unknown eligibility and constraints require review; incomplete payment/evidence cannot count as completed.
- Added schema 3 with frozen v1/v2 readers, explicit preserved-original folder-copy migration, numeric-rule snapshot validation, old-version JSON/ZIP upgrade consent and completion-hash clearing on imports. Pinned-rule updates retain plans; permanent deletion/year moves unlink plan evidence safely. No dependency or cloud storage added.
- Completion is rechecked against current context and verified attachment bytes on reopen. Changing salary, selected scenario, evidence, attachment metadata or annual rules invalidates the digest. Actual spending never changes worksheet amounts automatically, and linked worksheet evidence cannot be counted again.
- Projected and completed estimates have separate amounts and trust gates, include outlay/net cost, and leave unavailable savings unknown rather than zero. A zero-outlay do-nothing baseline stays visible. Only user-declared additional health spending is supported; no product ranking or investment return claims.
- **Phase 2 evidence:** checked the [official 2569 forms page](https://www.rd.go.th/68191.html) on 25 Oct 2026: it lists PND 93/94 and half-year instructions, not year-end PND 90/91 instructions (page updated 01 Jul 2026). The [general calculation guidance](https://www.rd.go.th/555.html) describes the overall tax/withholding sequence but does not resolve this release's missing annual tables and fractional rounding contract. This is insufficient verification for enabling 2026 numeric savings or final payable/refund output. Public rule bundles remain unchanged and blocked; no 2025 rules are copied into 2026.
- Unit/integration proof: 26 files / 198 tests passed, including plan status/context invalidation, unknown eligibility, budget/overflow gates, safe v2 copy and partial-failure marker, frozen history, v2 JSON/ZIP consent, current-plan transfer hash resets, purge detachment, rule-pin preservation and refusal to flatten richer imported worksheet data/evidence links. Typecheck and production build passed (existing large-chunk warning remains).
- Final rerun: 198 tests and all 10 Chromium tests passed after the preservation guard cleanup; E2E rebuilt production assets with typecheck. Browser coverage includes saved-plan draft protection, one scenario retained on edit/reopen, year isolation, payment plus evidence confirmation, ordinary reopen revalidation, and automatic needs-review status after editing evidence. `git diff --check` passed. Public rule bundles remain unchanged.
- Manual limitations remain: native Chrome/Edge picker and Thai-font visual/accessibility signoff. Numeric legal verification and fund/investment planning are not delivered by this slice.
