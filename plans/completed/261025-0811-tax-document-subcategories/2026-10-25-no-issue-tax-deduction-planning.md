# NexTHTax — ประเภทย่อยเอกสาร คำนวณภาษี และเปรียบเทียบแผนลดหย่อน

**Date**: 2026-10-25 (Asia/Bangkok)
**Complexity**: Complex compatibility/calculation change; หนึ่ง primary plan พร้อม sequential approval gates
**Status**: EXECUTE PARTIAL (Keep in active/testing) — items 1-10 done with tests; 11 BLOCKED for final numeric (concrete missing facts below); 12 partial (worksheet persists via App, fingerprints and gate partial); 13 partial (intermediate calc and gated comparator; no final ranking); 14 verification green in headless chromium, real Chrome/Edge pending. Not archived.

## Overview

เพิ่มประเภทย่อยกองทุน/ประกัน พร้อมคำนวณภาษีเงินได้บุคคลธรรมดารายปีตามกฎที่ยืนยัน เปรียบเทียบภาษีปัจจุบันกับแผนสมมติ และอธิบายทางเลือกที่ประหยัดที่สุด **ในกลุ่มที่ประเมินได้ครบ** จะอ้างดีที่สุดทั้งชุดที่ผู้ใช้ยืนยันได้เฉพาะทุกทางเลือกประเมินครบหรือพิสูจน์ infeasible แล้ว ไม่รับรอง globally optimal allocation หรือผลตอบแทนลงทุนดีที่สุด

**Scope amendment**: คำขอล่าสุดให้เพิ่มการคำนวณ/คำแนะนำ supersede ข้อห้าม net-tax ของ original plan เฉพาะ follow-up นี้ เอกสาร original ที่ review แล้วไม่ถูกแก้ Core local-only/privacy/capacity/safe migration ยังบังคับเหมือนเดิม การเพิ่มคำขอไม่ได้อนุมัติ implementation หรือ deploy

แผนนี้เป็น follow-up ต่อแอปที่มีแล้ว ไม่เปิด original umbrella plan ใหม่ ไม่แตะโค้ดจนได้รับ `ENTER EXECUTE MODE` พร้อมเลือก anchor นี้

สารบัญ: [Baseline](#repository-baseline) · [Contract](#public-contracts) · [Migration](#compatibility-and-migration) · [Checklist](#implementation-checklist) · [Tests](#acceptance-criteria-and-test-procedure) · [Handoff](#resume-and-execution-handoff)

## Repository Baseline

- Read-only inspection: Git HEAD `29face3` (`ci: deploy to GitHub Pages`), working tree clean เมื่อเริ่มวางแผน มีแอป React/TypeScript/Vite และชุดทดสอบแล้ว
- `src/domain/documents.ts`: `CATEGORIES` 15 หมวดแบน รวม `deduction_retirement`/`deduction_insurance`; `RecordDraft` ไม่มี subtype; `invalidatesReview` เปรียบเทียบ meaningful fields
- `src/domain/schema.ts`: `SCHEMA_VERSION = 1`, strict record/manifest schema; field ใหม่ใน schema เดิมถูก reject
- `src/storage/manifest.ts`: `decodeManifest` ตรวจ version ก่อน strict parse; `encodeManifest` จำกัด 20 MiB; `decodeManifest` ถูกเรียกจาก workspace/recovery/transfers ไม่ใช่เฉพาะ current data
- `src/App.tsx`: `saveRecord` map draft fields แบบ explicit; `addRecord` สร้าง object เอง ต้องเพิ่ม field ทั้งสองจุด ไม่อาศัย object spread ให้ผ่านโดยบังเอิญ
- `DocumentEditor.tsx`: `toForm`/`parseForm`/autosave/raw-dirty guards; `DocumentList.tsx`: exact-category/status/trash filters และ search title/issuer/notes; `YearOverview.tsx`: ใช้ `summarizeYear`
- `src/domain/rules.ts`: rule-bundle schemaVersion **1 แยกจาก manifest version** มีเฉพาะ coverage metadata ไม่มี numerical engine tables และ coverage ต้องตรง 15 category IDs; shipped 2025/2026/catalog ยัง unreviewed ใช้คำนวณไม่ได้
- `src/transfer/json.ts`: decode→write เฉพาะ empty folder; `zip.ts`: inventory/hash validation→write data last→reopen; `.recovery/` snapshots ใช้ manifest decoder และ retirement ตรวจ attachment refs
- CSV ปัจจุบัน 10 columns, BOM/CRLF/`escapeCell`; export non-trashed records ของปี รวม excluded โดยมี status ส่วน summary ไม่รวม excluded/trash และใช้ checked sums
- ไม่มี `process/context/all-context.md` หรือ test router ใน project root ที่ตรวจพบ ใช้ไฟล์จริงข้างต้นและ tests ปัจจุบันเป็นหลัก
- Parent-reported baseline ก่อน task นี้: `rtk npm run test -- --run` ผ่าน **16 files / 83 tests** ไม่ได้รันซ้ำโดย planning agent; ไม่มี build/typecheck/E2E baseline ที่ยืนยันในรอบนี้

## Scope and Non-goals

**In scope**
- Stable parent-scoped subcategory registry, validation, nullable unclassified state และ schema compatibility ที่ไม่ทำข้อมูลหาย
- Subtype selector ใน editor; subtype label ในรายการ; subtype filter + search; grouped year overview และ CSV columns
- Explicit legacy migration/import conversion ไปโฟลเดอร์ว่างใหม่ โดยรักษาต้นฉบับ เอกสารแนบ pinned rules และ historical recovery
- Annual Thai PIT worksheet สำหรับบุคคลธรรมดาเงินเดือนและหลักฐานลงทุนในประเทศเท่าที่ rule coverage ยืนยันครบ: expenses/exemptions/allowances/shared caps/donations/brackets/credits/elections/withholding แยกหน้าที่
- เปรียบเทียบ baseline กับ finite user-confirmed fund/insurance scenarios ตามงบ/eligibility/holding/liquidity/risk constraints และ existing contributions พร้อม reasons/citations/unknowns
- Focused tests และ regression เฉพาะ seams ที่ได้รับผล ไม่มี dependencies ใหม่

**Non-goals**: เพิ่ม broad category IDs, เดาประเภทจากชื่อไฟล์, custom taxonomy, portfolio tracker/ผลตอบแทน, จัดประกันชีวิตเป็นกองทุน, เปลี่ยน `income_investment`, OCR, joint filing/business/foreign-income calculator, named fund/policy recommendations, automatic purchases/trades/filing, guarantees ผลตอบแทน/ความถูกต้องทางกฎหมาย, unrestricted/global portfolio optimization, generic expression engine/optimizer library, refactor storage/ZIP ทั้งระบบ, deploy/workflow changes

## Architecture Decisions

1. **Extend responsible domain owner**: registry ใน `documents.ts` เป็นแหล่งเดียวของ IDs/parent/labels และ helpers ที่ schema/editor/filter/summary/CSV ใช้ร่วมกัน ไม่เพิ่ม enum ซ้ำหลายชั้น
2. **Preserve broad category contract**: ใช้ `deduction_retirement` กับกองทุน และ `deduction_insurance` กับประกันตามเดิม ไม่เพิ่ม IDs เข้า `CATEGORIES` เพราะทำให้ strict pinned-rule coverage ไม่ compatible
3. **Manifest schemaVersion 2**: current record มี required nullable `subcategory`; current year เพิ่ม required nullable `taxInputs` และ `scenarios` array; schema1 frozen reader รับ legacy shapeจริง ไม่แอบใส่ fields ใหม่ใน1
4. **Minimal explicit conversion**: upgrade current v1 workspace/import v1 JSON/ZIP โดย consent แล้วสร้าง current v2 ใน empty new folder เท่านั้น ใช้ version-dispatched decoder อ่าน historical v1 snapshots โดยไม่ rewrite snapshot bytes หรือแก้ digest ไม่มี generic migration framework/provider
5. **Reuse behavior**: subtype totals ใช้ existing `summarizeYear` บน partition ที่กำหนด; subtype UI ใช้ native `<select>` และ state เดิม; money/privacy/offline/backup owners เดิมไม่ถูกแทนที่
6. **One numeric rule format**: extend existing RuleBundle เป็น strict version1|version2 union;1เป็น coverage-only,2เพิ่ม typed numerical parameters/coverage สำหรับ engineVersion1 ใช้ catalog/path/digest/pinning owners เดิม ไม่เพิ่ม catalog/service/provider แยก
7. **Finite exact comparison**: เปรียบเทียบ complete feasible scenarios ทุกตัวในชุดผู้ใช้ รายงาน unknown/unsupported ที่ยังเปรียบเทียบไม่ได้แยก ไม่ใช้ greedy/sample allocation หรือ incomplete set แล้วอ้างทั้งชุด optimal; ใช้ pure typed calculator กับ existing integer/BigInt helpers ไม่มี dependency ใหม่

## Official Source Map and Release Evidence Gate

Parent primary-source research ตรวจ **2026-10-25** ได้แหล่งต่อไปนี้ ไม่เท่ากับตรวจ verified numerical fixtures/กฎหมายทุกกรณีครบแล้ว:
- [2025 annual forms](https://www.rd.go.th/67335.html) และ [2026 forms](https://www.rd.go.th/68191.html):2025มี90/91;2026หน้า updated01-07-2026มี93/94 ยังไม่มี year-end90/91 จึงห้ามอ้าง full2026 final-rule confidence จากวันที่ crawl
- [2025 PND91 p2](https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/241268PIT91.pdf):ลำดับ exemptions→expenses→allowances→double-donation limit→ordinary donation remaining limit→tax→withholding/payable/refund
- [2025 PND90 instructions pp2–5](https://www.rd.go.th/fileadmin/tax_pdf/pit/2568/Ins90_241268.pdf):final-tax elections ต้องกลุ่มครบไม่ cherry-pick receipts, dividends บางกรณี gross-up/credit และ final-tax income ยังนับในฐานเปอร์เซ็นต์ของ RMF/ThaiESG/annuity บางสิทธิ **ฐาน cap ไม่ใช่ progressive-tax income เพียงยอดเดียว**
- [Salary expenses](https://www.rd.go.th/556.html) และ [progressive tax table applicable2017+](https://www.rd.go.th/fileadmin/user_upload/borkor/tax121260.pdf):ใช้แหล่งไทยที่ period ถูกต้อง ไม่ใช้ stale English overview แทน salary expense/allowance tables
- [Insurance guidance](https://www.rd.go.th/60058.html) และ [RMF/annuity/shared retirement guidance](https://www.rd.go.th/62777.html):life+health shared limits, annuity ใช้ life headroom ก่อนส่วนเพิ่มเติมและ retirement share; ห้ามคำนวณ independent minimum caps แล้วบวกกัน
- [Consolidated MR126 clause2(105), including MR395/2567 and MR398/2568](https://www.rd.go.th/2502.html) และ [DG458](https://www.rd.go.th/fileadmin/user_upload/kormor/newlaw/dg458A.pdf):ThaiESG purchase-period/holding conditions ต่างจาก ThaiESGX new money/LTF-switch/carryovers; prior DG442 ถูกแทน ไม่ใช้ชื่อคล้ายกันเป็นสิทธิเดียวกัน
- [Deduction summary280168](https://www.rd.go.th/fileadmin/download/tax_deductions_update280168.pdf) มี2024 promotions บางรายการ ไม่ใช่ complete2025/2026 law table; [English overview](https://www.rd.go.th/english/6045) มี allowance/expense ตัวเลข stale แม้ crawler ใหม่

**Precedence/coverage gate**: enacted law+effective purchase/tax period → annual Thai instructions/forms → compatible official guidance; หน้า overview/update date อย่างเดียวไม่ยืนยัน applicable law ต้อง resolve source conflicts ก่อน publish numeric rule ไม่มี fixed target2025/2026ตลอดไป: Y=Bangkok release year,Y−1เป็น annual review targets พร้อม documented partial/unavailable status

**Initial numerical release scope**: implement supported salary case และ fund/insurance/donation interactions เฉพาะที่ผ่าน independent official numeric fixtures/eligibility/basis review;2025เป็น annual-instruction-backed starting target ไม่ใช่อ้างว่ายืนยันทุกข้อแล้ว2026ให้ partial/unavailable จน essential components ผ่านครบ Foreign/business/joint filing และ ThaiESGX/LTF legacy/carryovers ไม่อยู่ใน supported scenario model; ถ้าผู้ใช้มี interaction เหล่านี้ต้อง unsupported/partial ไม่แสดง numeric final PIT หรือ optimal-tax-savings claim

ผู้ดูแลต้องทบทวน Y/Y−1ทุก release/ต้นปีและเมื่อประกาศเปลี่ยนพร้อม checked-date/changelog; ไม่ scrape/upgrade assumptions เงียบ ๆ Release อาจแสดง2026เอกสาร/verified component headroomได้ แต่ไม่แสดง final tax/scenario saving ถ้า annual case essential coverage ยังไม่ครบ

## Public Contracts

### Stable Registry

| Parent category | Persisted subcategory ID | Thai label |
|---|---|---|
| `deduction_retirement` | `fund_rmf` | RMF |
| `deduction_retirement` | `fund_thai_esg` | ThaiESG |
| `deduction_retirement` | `fund_other` | กองทุนอื่น ๆ |
| `deduction_insurance` | `insurance_life` | ประกันชีวิต |
| `deduction_insurance` | `insurance_annuity` | ประกันบำนาญ |
| `deduction_insurance` | `insurance_health` | ประกันสุขภาพ |
| `deduction_insurance` | `insurance_other` | ประกันอื่น ๆ |

- Current v2 `subcategory` เป็นหนึ่งใน IDs ด้านบนหรือ null; parent-scoped validation บังคับ cross-parent invalid; parent อื่นต้อง null เสมอ
- Null ในสอง parent แสดง **“ยังไม่ระบุประเภท”** แยกจาก `fund_other`/`insurance_other` ซึ่งเป็นการเลือก explicit ไม่ใช้ empty string/unknown token เป็น persisted value
- `subcategory` required ใน v2: missing/undefined/unknown ID ไม่ถูก normalize เป็น null ระหว่าง import; version1 strict reader ต้องไม่มี field นี้เช่นเดิม
- `RecordDraft` และ valid form draft มี field เดียวกัน `SubcategoryId | null`; form select ใช้ empty option→null ผ่าน parser ไม่มี duplicate boolean fields
- Helpers ที่ระบุให้เพิ่ม: `SUBCATEGORIES`, `SubcategoryId`, `subcategoriesFor(category)`, `subcategoryLabel(value)`, `isSubcategoryApplicable(category,value)`; null ใช้ได้กับทุก parent ไม่รวม null ไว้เป็น registry ID

### Editing and Review

- เพิ่ม subtype ใน `toForm`, `parseForm`, `saveRecord` mapping และ new-record defaults (`null`)
- เปลี่ยน broad parent และ clear subtype ที่ไม่ applicable ใน **raw state update เดียวกัน** เพื่อไม่ให้ autosave เห็น transient invalid pair; ไม่ auto-select first subtype
- เปลี่ยน subtype, clear subtype หรือเปลี่ยน parent ถือ meaningful edit: `reviewed` กลับ `waiting-review` ตาม existing rule; เลือกค่าเดิมไม่ invalidates; status-only behavior เดิมคงอยู่
- ข้อมูลเก่าที่ converted null ไม่เสีย reviewed status เพราะไม่มีการตีความเอกสารใหม่ ผู้ใช้เลือก subtype ภายหลังจึง invalidates review
- Selector มี label “ประเภทเอกสารย่อย” และ unclassified option แสดงเฉพาะสอง parent; parent อื่นไม่มี selector และ field คง null; accessible errors/keyboard/autosave/navigation guards เดิมต้องไม่ regress

### Filters, Search and Year Totals

- DocumentList แสดง subtype label ต่อท้าย broad category เฉพาะ applicable parent ไม่เปลี่ยนหมวดรายได้ลงทุน
- Subtype filter แสดงเมื่อเลือกหนึ่งในสอง broad parents มี “ทุกประเภท”, “ยังไม่ระบุประเภท” และ child options ของ parent นั้น; เปลี่ยน parent/reset all categories reset subtype filter พร้อมกันไม่ทิ้ง hidden stale filter
- Search ขยาย existing title/issuer/notes ให้รวม **broad/subcategory display labels** แบบ lowercase existing behavior ไม่เพิ่ม fuzzy engine; RMF/ThaiESG ค้นจาก label ได้แม้ชื่อเอกสารไม่มีคำนี้
- `summarizeSubcategories(records,taxYear)` ใน `summary.ts` สร้าง partition สำหรับสอง parent แยก child IDs + null ด้วย existing `summarizeYear`; แต่ละ record อยู่หนึ่ง child เท่านั้น ไม่ deduplicate record จาก shared attachment และไม่ double-count parent/subtype totals
- แสดง parent subtotal และ subtype rows ในปีที่เลือก กำกับว่า child breakdown เป็นส่วนประกอบของ parent ไม่บวกซ้ำใน grand total ข้อมูลรวมรายปีเดิมและหมวดอื่นไม่เปลี่ยน; child rows ไม่มีข้อมูลแสดง count0/amount0 ส่วน null amounts ใน records ไม่แปลงให้เป็นจำนวนที่รู้แล้ว
- ส่วน document grouping นี้ใช้ semantics เดิม: live/non-excluded totals, reviewed-only claim subtotal, unknownClaimCount, statuses/excluded/trash counts และ `{ok:false,error:"overflow"}`; ไม่แทน legal calculator ด้านล่าง ไม่แสดง overflow เป็น0 และรักษา disclaimer
- Registry label ไม่ใช่ verified tax eligibility; broad category coverage ไม่ยกระดับเป็น calculation coverage/subtype eligibility กฎ1ที่ unavailable/unreviewed ยังคงแสดงตรงตามเดิม

### CSV

- คง10 columns เดิมตามลำดับ แล้ว **append** `รหัสประเภทเอกสารย่อย`, `ประเภทเอกสารย่อย`; typed records ส่ง stable ID+label; unclassified applicable parent ส่ง ID ว่าง+“ยังไม่ระบุประเภท”; parent อื่นส่งว่างทั้งคู่
- คง UTF-8 BOM/CRLF/`escapeCell` ทุก cell และ current row scope (selected year, non-trash, excluded ยังอยู่พร้อม status) ไม่เปลี่ยน CSV ให้เท่ากับ totals โดยเงียบ ๆ
- เป็น additive report columns แต่ผู้ใช้ parser ที่บังคับ column count ต้องปรับ README ระบุ contract change ไม่อ้าง byte-for-byte CSV compatibility

## Typed Tax Worksheet and Numerical Engine

### Minimal Local Data Contract

- `year.taxInputs` default null: user-confirmed filing/income/eligibility worksheet ไม่ใช้ `summarizeYear().claimedTotal` เป็นฐานคำนวณโดยตรง; `year.scenarios` default[]; new year constructors ทุกจุดต้องใส่ defaults ไม่มี automatic inference จาก category label
- Worksheet เก็บ `incomeItems` แบบ explicit financial-event ID, sourceRecordIds, kind (`salary`, `domestic-interest`, `domestic-dividend`), gross/withholding satang, tax treatment (`progressive`, `final`, `exempt`, `unknown`) และ election-group identity/required legal facts หากเกี่ยวข้อง; `income_other`/unsupported kind ไม่แปลงเป็นsalary
- Salary slip และ50ทวิที่ยืนยัน event เดียวกันต้อง link เป็น worksheet event เดียว sourceRecordId ไม่ซ้ำข้าม events; withholding อยู่ใน event แยก field ไม่เอา certificate evidence amount มารวมรายได้ซ้ำ User ยืนยัน completeness/event mapping ไม่เดาว่าไฟล์ชื่อคล้ายกันคือรายได้เดียวกัน
- Eligibility facts เก็บเฉพาะที่ supported law ต้องใช้: age-at-year-end/elderly-or-disability facts, marital/separate-filing/spouse-income facts, dependent claims, tax residence และ contribution/holding/policy facts ตาม line ที่เลือก ใช้ yes/no/unknown หรือ nullable value ไม่เก็บบัตรประชาชน/รายละเอียดสุขภาพเกินจำเป็น; no claim กับ unknown ต้องแยก
- Fixed deduction worksheet ใช้ sourceRecordIds และ selected contribution base/existing contributions/eligibility แยก allowances ที่ไม่มี receipt; reviewed included evidence กับ user-confirmed no-evidence fact จึงเป็น eligible input ได้ ไม่เอารายการexcluded/trash/unknownเข้าฐานเงียบ ๆ ป้องกัน recordเดียวถูกนับซ้ำ และตรวจ source amounts กับ event/claim allocations
- User attestations เรื่อง income/withholding/claimed-deductions complete และ final-tax group complete เป็น tri-state ไม่ default yes; `confirmedSourcesDigest` เป็น hash ของ canonical year-record projection (IDs/year/date/category/subcategory/status/trash/amounts/attachment IDs) ไม่รวม worksheet/scenario fields การแก้ source ทำ worksheet **needs-reconfirmation** ไม่ autosync ยอดที่ยืนยันโดยเงียบ ๆ
- `confirmedWorksheetDigest` ครอบคลุม normalized substantive worksheet (income/treatment/election/eligibility/fixed contributions/completeness answers) + source digest + tax year/pinned rule digest/engine identity โดยไม่รวม confirmation fields/timestamps/results เปลี่ยน worksheet อย่างเดียวจึง invalidate ได้โดยไม่ self-invalidate เมื่อยืนยัน
- แต่ละ scenario มี `confirmedChoiceDigest` ครอบคลุม normalized additional amounts/budget/feasibility constraints + worksheet basis digest/year/rule/engine; เปลี่ยนตัวเลือก/เงื่อนไขทำ scenario needs-reconfirmation; label-only metadata ไม่จำเป็นต้อง invalidate ต้องยืนยันล่าสุด explicit ก่อน numeric final/rank
- Fingerprints ตรวจ drift ไม่ authenticate user consent; imported confirmations/hash ที่ปลอมให้ตรงไม่เป็นหลักฐานยินยอม JSON/ZIP import reset confirmations เป็น null และ **ทุก workspace open มี session confirmation gate** ให้ผู้ใช้ตรวจและยืนยัน latest worksheet/scenario values ก่อน final output/rank ไม่ auto-yes จากไฟล์/persisted hash; source-record review statuses ไม่ถูกเปลี่ยนเพียงเพราะเปิดใหม่
- `scenarios` เก็บ label/optional budget, per-subtype `additionalContributionSatang` และ declared eligibility/holding/liquidity/risk facts เท่าที่ต้องใช้ ไม่มี persisted computed totals; results derived จาก current validated basis+trusted rule/engine ไม่ใช้ cached import results

### Annual Rule Bundle2 and Execution Trust

- Keep existing `ruleBundleSchema`1 frozen; เพิ่ม `ruleBundleV2Schema` และ version dispatcher โดย2คง identity/sources/broad coverageเดิม เพิ่ม typed `calculation`: engineVersion1, component-level coverage, legal effective periods, supported-input constraints และ numerical tables ของ brackets/expenses/allowances/eligibility bases/shared limits/donation ordering/credits/rounding รวม applicable alternative/minimum-tax method; ถ้า applicable component ไม่รองรับต้อง fail closed
- ไม่รับ expressions/scripts/formulasจาก JSON; table keys/structuresเป็น finite known typesที่ pure engine branchรองรับ เช่น salary basisกับcontribution-cap basisแยก, shared retirement vs life/health/annuity allocation, ordered donation limits ต้องมี verified source refsต่อ component/parameters
- Catalog schema1/path conventionเดิมใช้ต่อได้ เพิ่ม entryใหม่สำหรับ annual bundle2เมื่อ legal evidence gate ผ่าน; existing1 bundle bytes/entries digestsห้ามแก้ Rule bundle version2≠workspace schema2 และ≠backup-inventory1; old1ใช้ coverage displayได้แต่ **ห้าม execute numeric tax**
- `loadPinnedBundle`/fetch/RuleReview/YearOverview รองรับ1|2และ engine compatibility; numeric trustต้อง exact year/version/content digest match **trusted app-published catalog** +officialReviewed+supported engineVersion+component completeness ไม่เชื่อ imported bundle flags/citationsเพียงอย่างเดียว
- Tax computation pin annual bundle digest+engineVersion; changesต้อง user consent/impact previewและ reconfirm assumptions ไม่ mix different-year caps/brackets; offline ใช้ pinned compatible trusted snapshotพร้อม reviewed date ไม่อ้างล่าสุด; old1/unreviewed/unsupported engine→numeric unavailable

### Calculation Flow and Completeness

`reviewed source events + tax facts + fixed contributions + candidate scenario` → typed TaxCase → annual/basis/election/eligibility completeness → exemptions → expenses → allowances/shared caps → ordered donations → taxable income/brackets/applicable statutory alternative-tax comparison → verified credits → withholding settlement

- `calculateTaxCase` pure in `src/domain/tax.ts` returns discriminated `complete | incomplete | unsupported | overflow` with line-item trace/source refs/input IDs; completeคือ **estimate under declared facts**, ไม่ใช่รับรองยื่นถูกต้อง บาง componentคำนวณได้ไม่ทำให้whole-casecomplete
- ถ้า essential income/election/allowance/basis/credits/social-security/donation ruleหรือinputunknownต้องไม่มี final numeric tax/refund/payable/scenario saving แสดงเฉพาะ known intermediate linesแยกพร้อม omissions; no numeric0 fallback
- Income electionเป็น legal groupไม่ได้เลือกreceiptที่ประหยัดเฉพาะใบ; eligible dividends gross-up/creditต้องมีครบsourcefactsและverified algorithmไม่เช่นนั้นunsupported Final-tax-excluded receiptsอาจยังเข้า specific contribution cap bases; เก็บgross progressive basisและcap-income basesแยกโดย source-law rule
- Basic supported caseใช้salary income; domestic-interest/dividend final-tax electionหรือprogressive inclusion/creditเปิดได้เฉพาะwhole relevant componentผ่านfixtures Legal-evidence gate หากยังไม่verifiedต้องunsupported ไม่ใช้คำว่า supported เพราะเก็บเอกสารได้
- BigInt/checked integer rational roundingใช้existing money helpers ไม่ floating-point intermediates; all derived amounts safe serialize; roundingตามannualofficialworksheet ไม่ใช้arbitrary roundingหลักเดียวทั้งengine
- Withholdingคือtax paid/creditสำหรับsettlementไม่ใช่ลดtaxableincome;แยก assessed progressive tax/eligible credits/final-tax obligations/withholding/netpayable/refund ไม่มีการหักcertificatesซ้ำหรือรวมfinal-tax withholdingเป็นcreditผิดกลุ่ม

## Finite Scenarios and Recommendations

- User สร้าง contribution scenarios (ไม่ทำ automatic allocation): baseline existing contributions + per-subtype additional deltas ของ supported RMF/ThaiESG/life/annuity/health; `fund_other`/`insurance_other` classifyได้แต่ scenario unsupported เว้นแต่ไม่มีเพิ่มและไม่มี interaction ที่ engine ต้องใช้ Donations/other deductions held fixed แต่ engine ต้องคำนวณ verified interactions เมื่อ donation-limit basis เปลี่ยน
- Persisted `additionalContributionSatang` เป็น **nonnegative delta**; `candidateTotal = existingContribution + delta` แบบ checked integer; budget ใช้ `sum(delta)` เท่านั้น ส่วน legal caps/policy limits ตรวจ candidate totals ไม่บวก existing ซ้ำ ตัวอย่าง existing100k,budget50k,delta30k → total130k ใช้งบ30k; delta60k infeasible เพราะเกินงบ
- ผู้ใช้ยืนยัน delta/premium ว่า feasible/purchasable จริงตาม discrete choices/min/max ไม่สมมติซื้อกรมธรรม์ได้ทุกสตางค์; budget optional ถ้าไม่ให้เปรียบเทียบ confirmed plans ได้แต่ไม่อ้าง budget-optimal
- Scenario eligibility/holding/age/policy/liquidity/risk constraints yes/no/unknown; proven violation → infeasible ไม่ rank; unknown/unsupported → ยังประเมินไม่ได้ **ไม่เท่ากับ infeasible** ไม่เลือกผลิตภัณฑ์เสี่ยงกว่า/lockเงินนานกว่าแทนผู้ใช้
- Baselineกับscenarioต้องyear/rules/election/income/credits/otherfixedfactsเดียวกันเปลี่ยนเฉพาะadditionalsupportedcontributions หากเปลี่ยนassumptionsต้องสร้างbaselineใหม่ชัดเจน ห้ามเลือกelectionแทนผู้ใช้
- Evaluate **ทุกfeasible complete scenarioในfiniteuser-declaredset** (สูงสุด20 scenarios,ไม่รวมbaseline) ด้วย calculatorเดียวกัน Objective `taxSaving = baseline.taxAfterCreditsBeforeWithholding − scenario.taxAfterCreditsBeforeWithholding` โดย annual engine จัด credit/refund semanticsที่verifiedแล้วและfinal-tax groupsคงที่ ค่า signed pre-withholdingนี้อาจติดลบได้เฉพาะ refundablecreditที่supportชัด ไม่ใช่withholdingrefund;แสดงgrossbracket-tax reductionแยกและต้องมี `0 ≤ taxSaving ≤ baseline.progressiveTaxBeforeCredits` สำหรับ deduction-only domain ถ้าละเมิดinvariantต้องunsupportedไม่rank กรณีcredit/finaltaxที่ยังไม่verifiedไม่เปิดnumericrecommendations ไม่ใช้netpayableเป็นcapเพราะwithholdingไม่ใช่taxliability
- Baseline ต้อง complete ก่อนเสมอ; รายงานทุก candidate เป็น complete-feasible/proven-infeasible/incomplete/unsupported พร้อม counts/reasons ถ้าทุกตัว complete-feasible หรือ proven-infeasible และมี complete-feasible จึงอ้าง winner ทั้ง declared set ได้
- ถ้ามี M incomplete/unsupported ให้ข้อความ **“ดีที่สุดใน N ทางเลือกที่ประเมินได้ครบ; M ทางเลือกยังประเมินไม่ได้”** พร้อม evaluated-subset ties ห้ามอ้าง optimum ของทั้งชุด Unknown อาจดีกว่าแผนที่คำนวณได้; N=0 หรือทุกตัว infeasible → no winner/ไม่แนะนำแผนซื้อ แสดง baseline แยกเมื่อ complete
- ไม่ตัดสิน risk/product จาก ties ไม่เพิ่ม allocation ที่ไม่ได้ประเมินครบ และไม่อ้าง global optimum/upper-bound นอกจากมี proof สำหรับ supported domain
- คำแนะนำเป็นrule-based trace: candidate amount/remaining cap/shared cap, marginal benefit/zero benefit, bindingbudget/eligibility, reasons/source+date, unknown/unsupported lines, sensitivityเมื่อผู้ใช้ปรับscenarioที่confirmแล้ว ตัวเลขsavingแสดงเฉพาะbaseline+candidatecomplete;ไม่มีenginecoverage→อธิบายข้อมูลขาดแทนตัวเลขชวนซื้อ
- UIย้ำว่าtaxsavingไม่ใช่netinvestmentreturn;ไม่รวมfees/returns/marketlosses/insurance suitability/earlyexitpenalties เว้นแต่lawmodelต้องใช้eligiblecondition ไม่แนะนำnamedfund/policy ไม่executeorders ไม่แนะนำเต็มเพดานเสมอและไม่มีguarantee

## Compatibility and Migration

### Versioned Readers and Writers

- `schema.ts`: freeze `legacyRecordSchema`/`legacyYearSchema`/`legacyManifestSchema` v1 ตาม shape ปัจจุบัน; current `recordSchema`/`yearSchema`/`manifestSchema` v2 พร้อม parent subtype refine และ strict typed taxInputs/scenarios; validate sourceRecordIds/election groups/year/source allocation references/amounts/20-scenario limit; current `Manifest`/`RecordEntry` types เป็น v2 เพิ่ม `LegacyManifest` และ `StoredManifest` union เฉพาะ persistence boundary
- `decodeManifest(bytes)` dispatch ด้วย exact integer version→strict v1/v2 schema แล้วคืน `StoredManifest` โดยไม่ mutate/normalize; >2 เป็น `newer-schema`; malformed/missing/unsupported version เป็น invalid; `encodeManifest` รับ validated stored v1/v2 เพื่อ export preserved historical bytes ไม่บังคับ upgrade
- `decodeCurrentManifest(bytes)` ใช้ v2 เท่านั้นและส่ง upgrade-required เมื่อพบ v1; current `validateManifest`/WorkspaceSession writes เป็น v2 เท่านั้น; audit callsites ทุกจุด ไม่ cast legacy object เป็น current type
- `openWorkspace` ที่อ่าน current v1 คืน discriminated **upgradeRequired** โดยไม่สร้าง editable session/rotate recovery/write directories; UI แสดงชื่อ/จำนวนรายการและ action “สร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่าง” พร้อม “ยกเลิก” ไม่ autoconvert on open
- V1 data ยังอ่านเพื่อ conversion/inspection ได้ทั้งหมด แต่ต้องสร้างสำเนา v2 ก่อนแก้ไขด้วยแอปรุ่นใหม่ ไม่สร้าง legacy editor แยก; ผู้ใช้ยกเลิกแล้ว original เปิดด้วยแอปเดิมได้ตามเดิม
- New empty workspace สร้าง v2 โดยตรง; JSON/ZIP current v2 round-trip subtype และ reject invalid pair ก่อน writes; current manifest v2 + recovery snapshots v1/v2 เป็น supported mixed history
- Historical `.recovery/prev-*`/`post-*` validation ใช้ versioned decoder อ่าน attachment references ได้ทั้งสองรุ่นโดยไม่ rewrite fields/digests; current/pending candidates ที่สร้างโดย v2 session ต้อง v2;ไม่ apply historical v1 เป็น current editable manifest โดยตรง ต้องผ่าน explicit new-folder conversion เดิม
- Rule bundle schema1|2 และ backup inventory schemaVersion1 เป็น **independent formats** ไม่ bump ตาม workspace; `CATEGORIES`, existing rule1 bytes/catalog entries digests, rulesVersion/rulesDigest/pinned paths ต้องไม่เปลี่ยนโดยmigration; numericalbundle2/catalogentryใหม่เพิ่มเฉพาะเมื่อlegalreleasegateผ่านและuserconsentpin

### Minimal Source-to-New-Folder Conversion

เจ้าของ `src/storage/migration.ts`: pure `upgradeManifestV1` + operation `migrateWorkspaceIntoEmptyFolder`; ใช้ filesystem/hash/capacity/validation owners เดิม ไม่สร้าง background job หรือ generic migration registry

1. User อ่านผลกระทบและยืนยัน เลือก target ใหม่ที่ว่าง ตรวจ source/target ไม่ใช่ directory เดียวกัน; source workspace ต้องไม่มี unresolved pending candidates, orphan ambiguity หรือ missing required attachments ก่อน full-folder conversion ถ้ามีให้หยุดและแสดง existing recovery/backup limitation ไม่เดา replay history
2. Acquire **existing** workspace writer lock ของ source ID ชั่วคราวเพื่อกัน cooperating tabs ใน origin/profile เดียวกัน; ถ้าล็อกไม่ได้หรือไม่มี capability ให้ยกเลิก conversion ไม่เพิ่ม lock mechanism ใหม่ ไม่อ้างว่ากัน external editors/cross-profile ได้
3. Validate source current/recovery/rules/attachment inventories และ byte limits ใช้ existing canonical namespaces/checksums ทำ source current hash baseline ก่อน copy; ไม่เขียนอะไรใน source รวม `.recovery/`
4. Pure conversion: current schemaVersion1→2; แต่ละcurrentrecordเพิ่ม `subcategory:null`; แต่ละyearเพิ่ม `taxInputs:null, scenarios:[]`; preserve workspaceId/taxpayer/record+attachmentIDs/status/trashedAt/existingyearfields/amounts/text/date/recordtimestamps/pindigests; bump currentmanifest revision1ครั้ง/updatedAt ด้วยmigrationtime (checkedoverflowreject) ไม่classify/สร้างtaxfactsจากtitle/notesหรือเลือกelectionเอง
5. Copy managed attachments/rules/validated historical recovery เป็น **bytes เดิม** ไป target; ใช้ existing capacity limits รวม converted current และ preserved recovery ใน peak-budget preflight ไม่ import source pending candidates ให้เป็น v2 pending; target current เขียนสุดท้ายหลัง read-back verification ของ copied files
6. Recheck source current hash/revision ก่อน finalize; mismatch → abort ไม่เขียนทับ source ไม่ประกาศสำเร็จ Source lock ป้องกันเฉพาะ cooperating app; residual external race เดิมต้องเปิดเผย ไม่อ้าง atomic snapshot ระหว่างหลายโปรแกรม
7. Validate target current2 + all preserved recovery1 refs/files, rules hashes, IDs, record count, sums และทุก subtype null; release source lock ก่อนเปิด target session ใหม่ซึ่งใช้ workspaceId เดิม ถ้ามีอีกแท็บจับ lock ขณะเปิด target ให้ target read-only ไม่ override lock; original/converted copies share lock ID จึงอาจแก้พร้อมกันไม่ได้ เป็น behavior เดิมที่ต้องอธิบาย
8. Failure/cancel ก่อน commit: original bytes unchanged; target partial ไม่นับพร้อมใช้ ใส่ existing `.restore-incomplete.json` marker เมื่อทำได้และรายงาน written paths; retry ต้องเลือก empty target ใหม่ ไม่ wipe/merge target เก่าหรือสร้าง duplicate records ไม่ cleanup files นอก managed target โดยปริยาย

**JSON import v1**: parse/validate→show explicit upgrade confirmation→convert current2→write empty target data; ไม่มี attachment/rule bytes ใน JSON อยู่แล้ว ต้องคง missing-attachment/pinned-rule-not-present warnings และไม่เรียกว่า full backup ผู้ใช้ cancel ไม่มี target writes

**ZIP import v1**: verify original inventory/hash ก่อน conversion; ตรวจ current1/recovery1 และ pending/recovery preconditions; explicit confirmation→copy bytes อื่นเดิม→write converted current2 last→reopen; backup inventory ของ source ใช้ validate input เท่านั้นไม่ copy stale hashes ของ current1 มารับรอง current2 New backup ต้องสร้าง inventory ใหม่จาก target2; ZIP current2 ไม่ convert ซ้ำ

**Tax confirmations on all imports**: คง entered facts/scenario deltas/budget/constraints แต่ reset current worksheet/choice confirmation digests เป็น null หลัง validate source ไม่เชื่อ matching hashesจาก input; UI แจ้งว่าต้อง reconfirm ก่อน final/rank ทั้ง JSON/ZIP กรณี v1รวมการinitializeในconversion revisionครั้งเดียว;v2ที่ต้องclearconfirmation bump target current revision/updatedAtครั้งเดียวแบบchecked ไม่แก้ source/historyหรือชี้ stale inventory hashesมารับรองcurrentใหม่ ทุกworkspaceopenมีsessiongateตามcontractข้างต้น

**Rollback**: ไม่มี automatic v2→v1 strip-subtype exporter แอปเดิมมี schemaVersion>1 gate จึงต้องปฏิเสธ2ก่อน parse ไม่ลบ field; rollback ใช้ preserved original v1 folder/backup กับแอปเก่า โดยแจ้งว่าการแก้ใน target2 หลัง migration จะไม่อยู่ใน original ห้ามอ้างว่าย้อนกลับพร้อม edits ใหม่ครบ หาก service worker ยังเสิร์ฟ old build ให้ update แอป ไม่ downgrade data

## Touchpoints

| Planned file changes | เจ้าของและขอบเขต |
|---|---|
| `src/domain/documents.ts` | registry/helpers/RecordDraft/validateDraft/invalidatesReview |
| `src/domain/schema.ts` | strict v1 frozen reader + v2 current schema/parent validation/versioned types |
| `src/storage/manifest.ts` | exact version dispatch/current decoder; no silent normalization |
| `src/storage/migration.ts` **new** | bounded explicit conversion into empty target only |
| `src/storage/workspace.ts`, `src/storage/recovery.ts` | current2 session, upgradeRequired open result; version-aware read-only historical snapshot checks/retirement |
| `src/App.tsx`, `src/ui/WorkspaceScreen.tsx`, `src/ui/BackupPanel.tsx` | migration confirmation/target selection, discriminated open-result handling, subtype mapping/defaults; no change to permissions/privacy |
| `src/ui/DocumentEditor.tsx` | parent-scoped subtype selector/form parsing/atomic parent clear/autosave guards |
| `src/ui/DocumentList.tsx` | subtype labels/filter/search and reset semantics |
| `src/domain/summary.ts`, `src/ui/YearOverview.tsx` | reuse checked summaries per partition and year/print breakdown |
| `src/domain/taxInputs.ts`, `src/domain/tax.ts`, `src/domain/scenarios.ts` **new** | strict minimal worksheet/facts/reference validation, pure PIT line-item calculation, exact finite-scenario comparison/trace |
| `src/domain/rules.ts`, `src/storage/pinnedRules.ts`, `src/ui/RuleReview.tsx` | frozen rule1 + typed rule2 union, numeric trust/engine compatibility/pinned version/consent |
| `src/ui/TaxWorksheet.tsx`, `src/ui/TaxScenarios.tsx` **new**, `src/App.tsx` | local taxpayer inputs/event de-dup confirmation, scenario entry/results/unknown/stale guards;เอกสารยอดรวมไม่ใช่numericreturn |
| `src/transfer/csv.ts`, `src/transfer/json.ts`, `src/transfer/zip.ts` | additive CSV columns, explicit v1 conversion and current2 round-trip, mixed historical schemas |
| `tests/unit/{documents,schema,editorForm,summary,csv,app}.test.*`, new `tests/unit/documentList.test.tsx`, `tests/integration/{migration,transfer,workspace,faults}.test.ts`, `tests/e2e/subcategories.spec.ts` | exact applicable existing paths/extensions to retain; add narrowly named tests where missing |
| `tests/fixtures/samples.ts`, `README.md` | synthetic v1/v2 fixture helpers; migration/report disclaimer/browser-version docs |
| `tests/unit/{taxInputs,tax,scenarios}.test.ts`, `tests/fixtures/tax/`, `tests/e2e/tax-planning.spec.ts`, `public/rules/<year>/<new-version>.json` + catalog appended entries when verified | independently derived official fixtures, supported year coverage/trace; existing rule1 files/digests preserved |

**No changes permitted**: existing shipped rule1 bundle bytes/catalog entry digests, broad category IDs, hosting/workflow/dependencies unless concreteblockerreturnedtoPLAN; newnumericrule2/catalogentries are allowed only afterlegalgate Existingreviewedplans และ unrelatedparallelworkไม่แก้สำหรับtaskนี้

## Implementation Checklist

1. [x] Done. HEAD 29face3 unchanged. Pre-EXECUTE state: tsc clean, vitest 16 files/83 tests (Codex work-in-progress). Consumers audited via rg. Item: Re-read current HEAD/diff and all manifest decode/schema consumers (`rg` current helpers/RecordDraft/RecordEntry construction) before edits; confirm baseline and stop if research assumptions changed
2. [x] Done. Registry, helpers, parent validation, invalidatesReview. Tests in tests/unit/documents.test.ts. Item: Add registry/helpers + parent-null validation and meaningful subtype review invalidation in `documents.ts`; cover all7 IDs/null/cross-parent/unchanged value
3. [x] Done. legacy v1 readers frozen, v2 strict schemas, decodeManifest version dispatch, decodeCurrentManifest. Tests in tests/unit/schema.test.ts. Note: taxInputs.ts schema-only (item 3 contract), no engine. Item: Freeze exact v1 schemas, introduce v2 schemas/types and versioned decode/current decode in schema/manifest; update strict validation tests including unknown fields and >2 rejection
4. [x] Done. upgradeManifestV1 pure; revision overflow rejected. Tests in tests/integration/migration.test.ts. Item: Implement `upgradeManifestV1` pure conversion, preserve fields/rules/record statuses, revision-overflow guard; test old values unchanged except explicit root version/revision/time and new null field
5. [x] Done with deviation: src/storage/recovery.ts NOT edited. decodeManifest version dispatch covers historical snapshot reads (tested: v1 snapshot readable and byte-identical after conversion). openWorkspace returns upgradeRequired before writes/locks. Item: Add minimal new-folder migration and `upgradeRequired` open path using existing writer lock/copy/hash/capacity primitives; adapt historical recovery decode and failure tests without source writes
6. [x] Partial coverage: JSON v1 consent/cancel/invalid pair and v2 round-trip tested; ZIP v1 confirm/decline, ZIP v2 subtype round-trip and pending-candidate restore tested. ZIP mid-write faults now tested (data.json commit failure and attachment write failure leave marker, never open as ready). Item: Wire workspace-entry/BackupPanel confirmation paths and v1 JSON/ZIP conversion before target current writes; cover cancel/partial/fault/source conflict/nonempty destination and version2 round-trip
7. [~] Partial. Browser e2e (tests/e2e/subcategories.spec.ts) proves subtype persistence after reopen and parent-change clear. Canceled-navigation guard with unsaved input is NOT tested. Item: Wire App defaults/save mapping + editor subtype UI, atomic clear on parent change and existing raw-dirty/autosave guards; test subtype-only edit persists and invalidates review, canceled navigation preserves input
8. [x] Done. Filter/search/reset tests in tests/unit/documentList.test.tsx. Item: Add list subtype label/filter/search/reset behavior using domain registry; test null and distinct “other” across two parents without affecting other categories/status/trash/year constraints
9. [x] Done. summarizeSubcategories partition tests in tests/unit/summary.test.ts. YearOverview rendering not component-tested. Item: Add pure year/subtype partition summary + overview/print rows using existing sums/status semantics; test partition identity and parent/global no double count/unknown/overflow
10. [x] Done. CSV 12 columns, escapeCell kept, tests in tests/unit/csv.test.ts, README section added. Item: Append CSV subtype columns with existing safe cell formatting and row scope; document additive CSV contract and classification≠tax eligibility
11. [~] BLOCKED for final numeric. Sourced facts missing: (1) no fetched official text states how satang fractions of progressive tax are rounded for ปีภาษี 2568 (grep across all 12 fetched documents); (2) Y=2026: fetched forms page lists only ภ.ง.ด.93/94 for 2569, no 2569 year-end ภ.ง.ด.90/91 or instructions, so 2026 allowances, caps and brackets are unconfirmed; (3) life, annuity, retirement funds, donations, credits, final-tax income and withholding settlement have no sourced numeric tables. Verified for Y-1=2025 slice: progressive brackets, 50% expense cap 100,000, personal allowance 60,000, health cap 25,000 (no life premium). Social security 9,000 is partial (FAQ only). Shipped rule2 2025 unreviewed (officialReviewed false). Item: **Legal gate before numeric coding/publication**: derive annual support matrix/sourceprecedence, typed rule2tables/enginecontract และ independent numericfixturesของsupportedcases;นำเสนอ missingcoverageให้reviewและอนุมัติก่อนengine ไม่เปิดnumeric2026เพราะมีแต่metadata/yearlabel
12. [~] Partial. Done: persisted worksheet via App save (taxInputs), salary/deduction/facts mapping with completeness-gated sums, confirmation fingerprints (canonical projections exclude confirmations), confirm button, JSON/ZIP import reset of confirmations, tests in tests/unit/taxInputs.test.ts, tests/unit/taxWorksheet.test.tsx, tests/integration/transfer.test.ts. Not done: per-event source de-dup UI (all live salary records of the year are linked to one salary item), session-open confirmation gate (final output is blocked, so the gate is not yet reachable). Item: Implement taxInputs/schema2year constructors/UI/source-event de-dup+reconfirmation และ rule1|2/pinnedtrust/engineVersion; JSON/ZIP round-tripinputs/scenarios ข้อมูลเดิมnull ไม่มีinferredfacts
13. [~] Partial. Done: intermediate calculator with hand-computed fixtures (tests/fixtures/tax/2025-slice.ts, tests/unit/tax.test.ts), gated finite comparator (src/domain/scenarios.ts, tests/unit/scenarios.test.ts), health-premium scenario panel with blocked reasons and caveats (TAX_CAVEATS). Not done: final tax and any product ranking (blocked by item 11 rounding), persistence of scenarios, scenarios beyond health premium (RMF, ThaiESG, annuity, life, donations are unsupported). Item: Implement pure supported PIT flow/line-trace plus finite-scenario comparator/UI explanation; budget ใช้ nonnegative deltas/caps ใช้ totals; worksheet/choice fingerprints+session reconfirm gate; fail closed unknown/unsupported/overflow และ distinguish evaluated-subset winner vs whole-declared-set optimum
14. [~] Ran: tsc clean, vitest 23 files/174 tests, vite build, playwright chromium 5/5 (entry-offline x3, subcategories x2). Not run: real Chrome/Edge, native folder picker, branded browser evidence (manual, pending). Rule data invariant: public/rules rule1 bytes unchanged; index.json gained one rule2 entry. Item: Run focused/fullsuite/typecheck/build และtargetedChrome/Edge; verify existingrule1bytes/entriesdigests + originalv1 unchanged, new2rulesผ่านofficialfixtures/consentreview;บันทึกpartialcoverageและscopeproofจริง ไม่deploy

## Acceptance Criteria and Test Procedure

| ID | Planned proof | Expected result |
|---|---|---|
| S01 registry/schema | `documents.test.ts`, `schema.test.ts`:7IDs,2parents,null/unknown/cross-parent, v1 input extra subtype field, v2 missing field | registry single source; only valid pairs accepted; v1 no field remains strict; v2 null explicit; no extra CATEGORIES |
| S02 edit/autosave | `editorForm.test.ts`, App/component test + targeted browser: new record→parent→RMF/ThaiESG/insurance subtype→reload | saved subtype persists through explicit App mapping; parent change atomically clears; status invalidates only meaningful edits; invalid/raw navigation guards unchanged |
| S03 filter/search | new `documentList.test.tsx`/E2E: titles lack RMF/ThaiESG but subtype label matches; parent/subtype/status/trash combos; parent switch | label searchable; no hidden stale filter; null unclassified distinct from selected other; no cross-parent matches |
| S04 grouping | `summary.test.ts`:2years,7subtypes+null, reviewed/waiting/excluded/trash, null/zero/overflow amounts, two records share one file | one child per record; partition sum equals parent for valid totals; no parent-child double addition; reviewed/unknown/excluded/trash semantics preserved; sharing bytes doesn't dedupe records; overflow unavailable not0 |
| S05 CSV | `csv.test.ts`:existing10 positions+2tail columns, label/ID/null/out-of-parent, Thai quotes/newlines/formula text | BOM/CRLF/escapeCell retained; nontrash/excluded row policy unchanged; subcategory text adds no executable formula;0 vs null amounts preserved |
| S06 legacy pure upgrade | new `migration.test.ts`:v1 records live+trash+reviewed arbitrary notes/titles, revisions near max | subcategories null,year taxInputsnull/scenarios[]ไม่มีguessedfacts;existingmetadata/recordIDs/status/amounts/pinsuntouched;onlyexplicitnewfields+rootversion/revision/time differ;overflowfailsbeforewrites |
| S07 source safety | `migration.test.ts` + memoryFs/faults:nonempty/same target, lock denied, source bytes changed, pending candidates, missing/foreign data, write failure at each copied/current stage | no source writes/hash changes or silent recovery; target not ready if partial; safe newempty retry no merge/wipe; no new lock protocol |
| S08 transfers/history | `transfer.test.ts`:v1 JSON consent/cancel/missing-file warnings; v1 ZIP verified original inventory→target2; v2 subtype JSON/ZIP round-trip; recovery1/current2 backup/restore/retirement | subtype exact round-trip; source input unchanged; historical bytes/digests unchanged/readable; all current refs preserved; untrusted pair/unknown ID fails prewrite; no stale backup inventory for converted current |
| S09 old-reader/rollback | frozen v1 decoding fixture/old-version compatibility test: v2 subtype payload plus old schema-version gate; preserved source1 opens with legacy reader | old reader rejects2 as newer, never strips field; original1 remains usable; updates in2 not promised in old1; new app refuses applying1 history as current without explicit conversion |
| S10 rules/regression | `rules.test.ts`, pinned-load fixture, `workspace.test.ts`/`faults.test.ts`; compareexistingrule1bytes/catalogentrydigests | strict15-categorymetadata retained;rule1/unreviewed/forgedrule2/unknownengine cannotcompute;trustedannual2mustmatchcatalog+digest+engine+calculationcoverage;newpinrequiresconsent;existingstorage/backup/privacy preserved |
| S11 PIT official math | `tax.test.ts` independentofficialfixtures:bracketboundaries,zero/salaryexpenses/exemptions/allowances,life-health-annuity/retirementshare,RMF/ThaiESGbases,ordered donations,credits/electioncases,rounding/overflow | expectedvalues derivedindependentlyfromperiod-applicableofficialsources;includingfinaltaxincomeincapbasiswhenlawrequires;withholdingseparaterefund/payable;nocherrypickreceipts/doublecountincome+50ทวิ |
| S12 incompleteness/versioning | `taxInputs.test.ts`/`tax.test.ts`:unknown essentials,rule1/unreviewed/partial2026; source unchanged แต่แก้ income/election/eligibility/contributions; source/year/rule/engine switch | no final numeric PIT/refund/saving เมื่อ stale/unknown; worksheet fingerprint ครอบคลุม substantive edits และไม่ self-invalidate จาก confirmation metadata; explicit reconfirm latest values;ไม่ยืมกฎข้ามปี |
| S13 finite scenarios | `scenarios.test.ts`:existing100k/budget50k/delta30k→total130k;delta60k infeasible;scenario-only amounts/budget/constraints edit;ties;1complete+1unknownที่อาจดีกว่า;allinfeasible/nonecomplete | budget นับ delta ไม่บวกexistingซ้ำ; capsตรวจtotals;choice digest stale→ไม่rankจนreconfirm;subset winner แสดง N/M ไม่อ้าง full-set optimum;no winnerเมื่อไม่มีcompletefeasible;0≤saving≤baselineprogressivetax;holding/riskไม่ถูกเลือกแทน |
| S14 advice/UI | tax-planningE2E:localfacts→baseline→candidateamounts→explanation/trace→editdocument/year/pin→reconfirm | labelsestimate/taxbeforewithholding/actualpayable/refunddistinct;recommendationreasons+citations/date/unknowns/sensitivity;noclaimfullcapbest/namedproducts/globaloptimal;nooutboundpersonaldata |
| S15 persistence/security | transfer/migrationtests:taxInputs/scenarioJSON/ZIProundtrip,forged matching confirmation fingerprints,unknownfield/crossyear/refduplicate/oversize/partialwrite,old1readeragainst2 | facts/scenario deltas/budget/constraints preservedแต่import confirmation null/session gateต้องexplicitreconfirm;hashไม่ใช่consent;ทุกopenไม่auto-yes;old1rejects2;importedrules/citationsไม่ยกระดับtrust;original1untouched |

### Planned Commands — Not Run by This Planning Task

- Focused: `rtk npm run test -- --run tests/unit/documents.test.ts tests/unit/schema.test.ts tests/unit/editorForm.test.ts tests/unit/summary.test.ts tests/unit/csv.test.ts tests/unit/rules.test.ts tests/integration/migration.test.ts tests/integration/transfer.test.ts tests/integration/workspace.test.ts tests/integration/faults.test.ts` แล้วรัน new component tests ที่เพิ่มแยกตาม actual filenames
- Regression: `rtk npm run test -- --run`, `rtk npm run typecheck`, `rtk npm run build`
- Numeric focused: `rtk npm run test -- --run tests/unit/taxInputs.test.ts tests/unit/tax.test.ts tests/unit/scenarios.test.ts`
- E2E: current config มี project `chromium` เท่านั้น; planned `rtk npm run test:e2e -- tests/e2e/subcategories.spec.ts tests/e2e/tax-planning.spec.ts --project=chromium` ไม่ถือแทน native folder/migration proof บน branded Chrome/Edge
- Rule-data invariant: review `rtk git diff -- public/rules` อนุญาตเฉพาะ verified new bundle2/catalog entries; compare existing rule1 bytes/entry digests ผ่าน fixtures ไม่เพียง assert ว่า broad labels เท่าเดิม

### Phase Completion Rules

แต่ละช่วง schema/migration/UI ต้องผ่าน focused integration/unit tests, manual flow, Data Verification บน source+target directories, fault handling และ User Confirmation ก่อนใช้ ✅ VERIFIED ไม่มี code exists/build green แทน end-to-end proof ค่าเริ่มต้นทุกงานยัง ⏳ PLANNED ไม่มี tests/runtime ที่ทำผ่านในเอกสารนี้

## Blast Radius

- Public persisted contract เปลี่ยน currentmanifest1→2 (subtypes+localtaxfacts/scenarios), CSVadditive2columns และnumericrulebundle2แบบexplicitunion;legacyoriginals/history/rule1bytesไม่เปลี่ยน
- Type changes กระทบ record constructors/fixtures/forms/explicit App mapping และทุก decoder consumer ต้อง audit ทั้งหมด ไม่ใช้ `as` ปิด compatibility errors
- Privacy unchanged: ไม่มี account/cloudprocessing/upload/dependencyใหม่ ไม่มีworkflow/deploychange ไม่reclassifyข้อมูลเก่าหรือสร้างtaxfactsเอง;factcollectionเฉพาะsupportedlawจำเป็น
- Migration คง workspaceId ทำให้ source/target ถูก lock ร่วมตาม existing implementation; ไม่แก้ folder identity redesign ใน feature นี้

## Risks, Rollback and Stop Conditions

- **Incorrect dual-schema consumer**: ถ้า v1 history ถูก current2 parser reject จะทำ purge/backup/recovery พัง → version-aware reference validation + mixed history regression ก่อน UI shipping
- **Silent import rewrite**: JSON/ZIP v1 conversion ต้อง explicit confirmation และ empty target; never transform original raw file/archive; cancel/no consent ไม่มี writes
- **Incomplete copied source**: writer lock + source-baseline checks และ verified inventory; หากมี unresolved pending/invalid source หยุด ไม่สร้าง recovery engine เพิ่มหรือเลือก candidate เอง
- **Capacity growth**: new field/converted JSON/extra migration bytesต้องผ่าน existing limits ก่อน target writes; over budget rejected ไม่ trim notes/records/recovery เพื่อให้ผ่าน
- **Semantic mislabel/incomplete law**: subtype≠eligibility,metadata coverage≠numericengine coverage,finaltaxelection≠excludedfromcapbasis;unsupportedessentialinteractionต้องfailclosed Numericreleaseต้องofficialindependentfixturesไม่ใช่แค่passingcode
- **Misleading optimization**: comparatorcompleteเฉพาะdeclaredfinitefeasibleset;deductiontaxsavingไม่ใช่returnหรือwithholdingrefund ไม่มีproductrecommendation/automatictransaction;ties/unsupported/unknownsชัดเจน
- หาก new schema migration ต้องขยาย safety/backup primitives เกิน seams ข้างบน ให้หยุดและกลับ PLAN พร้อมหลักฐาน ไม่แอบ in-place upgrade หรือ silently drop recovery/history
- Rollback app = original v1 folder with old reader; v2 source preserved separately; ห้าม auto-strip subtype/overwrite downgrade และห้าม deploy เพื่อทดสอบโดยไม่มี approval

## Verification Evidence

- **Document review 2026-10-25**: independent review2รอบ พบและแก้3ประเด็น (worksheet/scenario confirmation fingerprints+import consent, delta-vs-total budget, incomplete-set winner claim); scoped re-review CLEAN ไม่มี material findings ค้าง เป็น document-only ไม่ใช่ legal/runtime verification
- Focused document checks ผ่าน:1newprimaryplan,6headinglinks/fragments,requiredsections,S01–S15 และ taxonomy/migration/calculation/confirmation contracts; tracked Git diff ว่างในการตรวจของ parent และ unrelated UI/UX plan ถูกเก็บไว้ไม่แก้
- **ทำแล้วใน planning**: read-only initialHEAD/status/codetrace;existing schema/recovery/import/rules seams;parentprimary-sourcemap checked2026-10-25 ไม่ใช่fulllegalverification;documentsections/links/expandedscopecheck
- **Parent-reported เท่านั้น**: baseline16files83tests ผ่านก่อน planning task; planning agent ไม่อ้างว่าได้ rerun
- **ยังไม่ทำ**: implementation/migration/test/build/E2E/manualUI/dependency/Git/deploy;numericlegalfixtures/fullannualcoverageยังpending ทุกacceptanceS01–S15planned Workingtreeอาจมีunrelatedparallelplansห้ามแก้/นับว่าเป็นงานนี้หรือclaimcleanจากinitialsnapshot
- Old global plan validator บังคับ `process/.../active/` และ `_PLAN_` ไม่รองรับ mandated plan directory/naming ของ session นี้ จึงไม่อ้างว่าผ่าน; ใช้ focused Markdown structure/links/contract check และรายงานข้อจำกัดเดิม

## Resume and Execution Handoff

- **Selected anchor**: `plans/261025-0811-tax-document-subcategories/2026-10-25-no-issue-tax-deduction-planning.md` เป็นแผนเดียวของ follow-up นี้ ไม่มี supporting phase files ต้องเดาเอง
- Work context: `/home/san/workspace/NexTHTax`; read latest instructions/status/diff และไฟล์ Touchpoints ก่อนลงมือ เพราะ HEAD อาจเปลี่ยนหลังวางแผน
- Relevant skills: lean-build, migration; safe-refactor เฉพาะ code movement ที่จำเป็น; vercel-react-best-practices สำหรับ React implementation ไม่ใช้เป็นเหตุขยาย scope
- ตอนนี้ **planning only** ห้ามแก้ app/tests/config/workflow/dependencies/old plans, init/commit/push/deploy เพียงเพราะ user ตอบ proceed ต่อข้อเสนอสร้างแผน
- Next valid action: user review และอนุมัติ `ENTER EXECUTE MODE` โดยเลือก exact anchor นี้ก่อนเริ่ม Step1; approval ของ original plan ไม่แทน approval ของ public schema2 change นี้
- Unresolved user preference: ไม่มีสำหรับการสร้างแผนนี้;legal-releasegateต้องsettleexactannualsupportedcomponents/tables/independentfixturesก่อนnumericimplementation ขอบเขตที่ยังunsupportedต้องแสดงตรงไม่ถือว่าrequestfinalcalculationผ่านแล้ว;runtime migration/filesystem/UI/numericalproofยังpending
