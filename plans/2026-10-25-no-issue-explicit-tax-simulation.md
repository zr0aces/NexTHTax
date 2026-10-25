# Explicit unreviewed 2026 simulation

User approved an opt-in simulation with visible assumptions, not a false tax-rule certification.

## Scope and invariants
- Reuse the annual engine and worksheet. Keep normal reviewed-rule calculation/catalog/pins unchanged and blocked until real review.
- Add one bundled, schema-validated provisional 2026 table, separate from the trusted catalog. No production dependency on tests or silent previous-year fallback. All supported entries remain partial/unreviewed.
- Expose an unchecked, session-only acknowledgement next to results. Show table version, source context, assumptions, shared limits and an unmistakable 'กฎยังไม่ตรวจรับ—ห้ามใช้ยื่นภาษี' warning with every simulated result. Reset opt-in on input/source/rule changes and navigation/reopen. Never persist simulation as rule approval or tax eligibility.
- Retain schema, correct year, amount/overflow, completeness, user eligibility, duplicate source, unsupported-case, current confirmation, dirty/read-only and compatibility protections.
- Support basic salary, personal allowance, eligible life/health, salary-employee social security (provisional full-year M.33 cap), RMF and ThaiESG. Keep ambiguous annuity, ThaiESGX, generic donation and other fund cases blocked rather than invent eligibility or silently omit them.
- Sources inform assumptions only; older official guides are explicitly labeled as background, not certified 2026 law. Social-security annual cap inference and applicability limits are disclosed. No officialReviewed flag or trusted catalog digest is changed.

## Proof and stop
Unit proof: opt-in simulation computes with provisional table; default path still blocks that same table; positive/zero/refund and cap examples; all invalid/incomplete/unsupported/duplicate/wrong-year/overflow paths remain blocked; simulated results identify their basis and version. UI/browser proof: default off, warning and assumptions, opt-in totals, no writes from toggling, immediate hide/reset after data changes, reopen off, and existing lifecycle/legacy rules unchanged. Run typecheck, focused/full unit tests, build and relevant Chromium E2E. No commit/push/deploy unless separately requested.

## Source context (25 Oct 2026)
- RD updated deduction guide (2024): https://www.rd.go.th/fileadmin/download/tax_deductions_update30072567.pdf — historical background for personal/life/health/RMF limits, not complete 2026 signoff.
- RD 2025 filing instructions explicitly discuss ThaiESG purchases in 2024–2026: https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins91_241268.pdf — background for provisional ThaiESG limit; no certification of other current-year interactions.
- Government news on proposed M.33 wage-base transition: https://www.1111.go.th/Home/Newsdetails/C16D5995C48940EC8C825C72223EE9F4 — describes 875/month for 2026–2028. Provisional annual bound inferred as 875×12=10,500; proposal/news is not a complete tax entitlement review. No M.39/M.40 or contribution-rate exceptions assumed supported.
- RD settlement background: https://www.rd.go.th/1778.html — provisional floor of calculated annual tax to whole baht before exact withholding subtraction; no final filing/refund precision certification.

## Execution
Completed locally; no commit/push/deploy in this task.
- Added `src/domain/taxSimulation.ts`: dedicated schema-validated table, unreviewed/partial statuses, assumptions rendered from actual calculation values, background/source links. No trusted catalog/pin/schema/dependency change and no production import of test fixtures.
- Annual engine reuses its existing validation/math through private shared evaluation. Reviewed entry still requires trust; simulation entry accepts only the bundled table, returns explicit simulation basis + version, and retains all input/source/year/eligibility/overflow/unsupported gates.
- Worksheet opt-in is unchecked and session-only, bound to exact confirmed saved inputs/source/rule identity. It does not write metadata, approve rules, or persist results. Edits and navigation/reopen revoke it; every result carries warning and simulated labels. Default reviewed path stays blocked as before.
- `rtk npm run typecheck` passed; `rtk npm test -- --run` passed 33 files / 259 tests.
- `rtk proxy env LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:e2e` rebuilt production successfully and passed all 24 Chromium E2E tests. Existing chunk-size warning remains.
- Browser regression ledger: first run found 375px overflow in the added consent panel. A desktop→375px probe with confirmed inputs reproduced document width 403px. Unconfirmed empty inputs did not reproduce it. Scoped wrapping reduced width to 375px, ruling out tax math/record storage as causes. The reused `.notice` flex strip was inappropriate for multi-paragraph consent; scoped `.simulation-panel` block flow + text wrapping fixed both closed and expanded assumptions views. Full E2E retained (not weakened) width assertions and passed. Diagnostic style injection used a temporary browser context only; product CSP is unchanged.
- Manual native folder-picker, Thai-font and screen-reader signoff remain outside this automated proof. Calculation results remain unreviewed assumptions, not legal certification; ambiguous unsupported deductions still block.

