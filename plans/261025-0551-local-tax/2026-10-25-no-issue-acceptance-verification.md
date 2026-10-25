# NexTHTax — Acceptance and Verification

**Date**: 2026-10-25
**Status**: Reviewed acceptance specification; tests planned, not run — ยังไม่มีแอปหรือการทดสอบ runtime
**Primary plan**: [Local Tax Plan](2026-10-25-no-issue-local-tax-plan.md)
**Specification**: [Requirements and Architecture](2026-10-25-no-issue-requirements-architecture.md)

## Proof Boundaries

- ใช้ synthetic/redacted fixtures เท่านั้น ไม่อัปโหลดเอกสารจริงของผู้ใช้
- Unit/integration mocks ใช้จำลองความผิดพลาดได้ แต่ไม่พิสูจน์ filesystem semantics ของ Chrome/Edge ต้องทดสอบ real browser + disposable OS directory
- Playwright Chromium ไม่แทน Chrome/Edge branded channels หรือ native directory permission flows; native picker ที่ automation ควบคุมไม่ได้ต้องมี manual evidence
- ไม่มี backend/database query; Data Verification คือเปิด JSON/bytes/files/hash ใน selected directory แล้ว reopen app เปรียบเทียบ
- ไม่มี automated test ที่พิสูจน์ทางกฎหมายว่ายื่นถูกต้องทั้งหมดได้ ต้องแสดง official coverage/unknown และ disclaimer
- Pages production tests แยกจาก localhost: local prefix simulation ไม่พิสูจน์ permission/service worker behavior บน actual Pages origin; hosted proof ต้องรอ explicit deployment approval ไม่มีการ deploy ในงาน planning นี้

## Planned Commands — Not Run

หลัง implementation approval ให้สร้าง scripts และ config ตามนี้ ก่อนมี scripts ห้ามรายงานว่ารันผ่าน:
- `rtk npm run typecheck` → TypeScript strict ไม่มี errors
- `rtk npm run test -- --run` → Vitest unit/integration/component tests ทั้งหมดผ่าน
- `rtk npm run test:e2e -- --project=chrome` และ `rtk npm run test:e2e -- --project=edge` → branded desktop browser flows ผ่าน
- `rtk npm run build` → production static bundle สำเร็จ
- `rtk npm run preview -- --host 127.0.0.1` → ใช้ตรวจ production service worker/offline/cache โดยตั้ง build base ให้ตรง `/<REPO>/` หรือ `/` และเข้า URL prefix ที่ตรงกัน ไม่ใช้ dev-server หรือ root-only test เป็นหลักฐาน project-site production

Dependencies/test scripts เป็น planned contracts ไม่ใช่คำสั่งที่มีอยู่แล้ว การติดตั้ง browser binaries/dependencies ต้องได้รับ implementation approval ก่อน

## Acceptance Matrix

| ID / planned tests | Test Procedure | Data Verification / pass criteria |
|---|---|---|
| **T01 Entry/capability/offline** `tests/e2e/entry-offline.spec.ts` | เปิด Chrome/Edge ไม่มี login; เลือกแฟ้ม; ปิด network หลัง offline-ready; reopen และเลือก folder ใหม่ | อ่าน/เพิ่ม/แก้/ค้นหา/preview/backup/report ได้ offline; first-ever offline ไม่อ้างว่าพร้อม; unsupported browser ไม่มี unsafe fallback |
| **T02 Workspace/schema** `tests/integration/workspace.test.ts` | สร้าง empty folder; เปิดหลายปี; สลับผู้เสียภาษี; non-empty unrelated folder; invalid/newer manifest | original folders ไม่เปลี่ยนจาก failed open; schema/IDs/paths ตรวจครบ; newer schema ไม่ถูก downgrade; no cloud/browser-storage data |
| **T03 Domain/summary** `tests/unit/{money,years,summary,rules}.test.ts` | decimal/blank/zero/unsafe integers; aggregate sum/multiplier overflow; 31 Dec–1 Jan Bangkok; release Y/Y−1 และ 2026/2569–2025/2568 dated fixtures; reviewed/unreviewed/excluded/trash; official rule examples | integer satang exact ด้วย BigInt intermediates; serialize ผลเกิน safe range ไม่ได้และต้อง unavailable/validation ไม่ wrap; เลือกปีไม่ปน; claimed/evidence แยก; unknown ไม่เป็น verified; exact cited rounding |
| **T04 Rule lifecycle** `tests/integration/rule-updates.test.ts` | valid/invalid/newer bundles; absent future year; offline; accept/reject update; changed historic rules; forged imported rules ที่แก้ source/coverage/version/hash ใน JSON/ZIP | pinned snapshot/version/source/date อยู่ใน folder/backup; reject แล้วคงเดิม; accept ไม่แก้ entered amounts; unsupported coverage เตือนตรง; officially reviewed เฉพาะ version/content ตรง trusted app catalog; unmatched snapshots เป็น unverified/unknown และไม่ override catalog |
| **T05 Document/attachment UI** `tests/e2e/documents.spec.ts` | เพิ่ม salary/50ทวิ/investment/deduction/donation; drag/drop+file picker; manual fields; status transitions/search/filter; duplicate bytes ต่างชื่อ; one file many records | verified copy ก่อน success; originals unchanged; reference integrity; reviewed invalidated on meaningful edits; missing file visible; no OCR/outbound |
| **T06 Save/concurrency/recovery** `tests/integration/{manifest,locking,recovery}.test.ts` + `tests/e2e/save-states.spec.ts` | rapid edits during save; close succeeds/read-back fails/retry; permission revoked; disk-full/disconnect; interrupted copy/manifest; two tabs/external edit; switch year/record/folder/taxpayer ขณะ saving/error/invalid/import | pending candidate/prior/other reconciliation ถูกต้องและเก็บ newer edits; saved เฉพาะ latest verified revision; prior recovery preserved; second tab read-only; no overwrite/auto-merge; raw invalid draft ไม่หาย; emergency valid JSON เตือน raw omissions; no cross-taxpayer contamination |
| **T07 JSON portability** `tests/integration/json-transfer.test.ts` | round-trip metadata; malformed JSON; duplicate IDs; unknown refs; invalid paths/amounts; newer version; JSON without attachments | import ไป folder ใหม่เท่านั้น; input rejected ก่อน writes; missing attachment explicitly shown; no false full-backup claim |
| **T08 ZIP backup/restore** `tests/integration/zip-transfer.test.ts` | save → ZIP → restore new empty folder → reopen; include shared attachments/trash/rules/recovery; failed extraction/manifest write; backup reminder visible | all hashes/metadata match; source untouched; non-empty destination rejected; partial restore not ready; incomplete source not labeled complete backup; reminders never auto-upload |
| **T09 Trash/reference safety** `tests/integration/attachment-lifecycle.test.ts` | shared file → trash both → permanent-delete one → restore other; final reference purge; interruption ทุก purge stage; hard-delete → backup → restore | live+trash referenced bytes survive; confirmed retirement of affected recovery snapshots precedes byte deletion; current+retained recovery remain valid; no dangling refs/false complete backup; cancel/foreign originals untouched |
| **T10 Privacy/security/offline update** `tests/e2e/privacy-update.spec.ts` + `tests/integration/import-security.test.ts` | capture network/cache/storage before and after edits/import/backup; crafted ZIP traversal/bombs/symlinks/duplicate paths; text HTML payload; update while dirty | no taxpayer/bytes in network or browser persistence; only app/rules cached; all adversarial archives rejected with no escape; no scripts from notes/rules; update waits safely |
| **T11 Reports** `tests/unit/csv.test.ts` + `tests/e2e/reports.spec.ts` | CSV Thai/quotes/newlines/formula prefixes; print/save PDF selected year; unknown/unreviewed totals | correct escaping and formula mitigation; year/rules/status/disclaimer present; no net-tax/filing claim; report agrees saved snapshot |
| **T12 Accessibility/limits** `tests/e2e/accessibility.spec.ts`, `tests/integration/capacity.test.ts` + manual | keyboard/screen reader/zoom; grow notes/records/files/trash/rules/recovery just below/at/above manifest/per-file/aggregate/count/ZIP-overhead limits; legacy oversized folder; growth → backup → restore | every accepted mutation remains backupable; over-budget rejected before writes without auto-delete; old bytes safe; bounded inspection/read-only for legacy oversize; OS-copy/replan limitation explicit; no fake complete ZIP |
| **T13 Pages base/origin/offline** `tests/e2e/pages-base.spec.ts` + actual-origin manual | production build ภายใต้ project prefix และ owner root; เปิด entry/assets/rules/icons/manifest; ตรวจ start_url/scope/SW registration/cache; offline reload; old cache/update/rollback; เลือก folder บน actual Pages HTTPS หลังอนุมัติ deploy | ไม่มี asset/rules 404 หรือ URL หลุด base; SW ไม่คุม unrelated paths; app-only cache; dirty tab ไม่ forced reload; stale build/version แสดงตรง; newer local schema ไม่ถูก downgrade; origin change ให้ reselect folder โดยข้อมูลเดิมไม่เสีย |
| **T14 Pages release/privacy isolation** `tests/integration/publish-artifact.test.ts` + workflow review/manual | ตรวจ dist allowlist และ synthetic fixtures; workflow branch/dispatch/PR guards, official pinned actions, lockfile/npm ci/gates, permissions/environment/concurrency; audit owner-origin trust และ Pages Settings | ไม่มี personal JSON/เอกสาร/recovery/backups/profiles/real screenshots ใน Git/artifact/logs; upload เฉพาะ dist; PR ไม่ deploy/รับ secrets; pages/id-token write มีเฉพาะ deploy job; canonical owner/repo/branch ยืนยันแล้ว; hosting logs/limitations ระบุตรง |

## Review Regression Cases — Planned, Not Run

| Case / owner | Focused proof |
|---|---|
| R01 / T06 | candidate bytes ต้อง persist/close/read-back/hash ก่อน current write และรวม peak budget; close สำเร็จแต่อ่านกลับพังทั้ง session/restart: current ตรง candidate จึง finalize/preserve ไม่ default rollback; current ตรง prior+pending bytes valid จึง explicit safe retry; current ตรง prior+pending bytes missing/corrupt รักษา prior/แจ้ง candidate unavailable ไม่อ้าง recovered; current ต่างทั้งคู่ conflict; unreadable ไม่ rotate/overwrite; newer raw edits crash-loss limitation ชัด; invalid journal stage read-only |
| R02 / T08,T12 | ใกล้/เท่ากับ/เกิน 768 MiB managed bytes, 8,000 files, 20 MiB manifest และ projected ZIP overhead; รวม live+trash+rules+recovery+inventory/journal; notes-only growth ผ่าน budget เดียวกัน; ทุก admitted state ZIP STORE backup → restore ได้ภายใน 1 GiB/10,000 entries |
| R03 / T02,T07,T09,T10 | attachment declarations ชี้ `data.json`, `rules/`, `.recovery/`, foreign root file, wrong UUID/extension/content, namespace collision ต้อง reject ก่อน writes/deletion; extension/declared hash ไม่ทำให้ foreign bytes เป็น app-owned |
| R04 / T04,T10 | forged imported citations: `javascript:`, `data:`, malformed URL, credential/host confusion, spoof official source/version/coverage/hash; plain text เท่านั้นเมื่อ untrusted, clickable links เฉพาะ catalog-matched HTTPS exact official hosts ไม่มี request จากการ render |
| R05 / T05,T10,T12 | synthetic hostile PDF มี script/OpenAction/URI/form/XFA/embedded file/remote font/cmap references → local PDF.js canvas preview ไม่มี actions/link/form UI และไม่มี document-triggered outbound; assets local/base-aware/offline; >500 pages/>16M pixels/timeout cancel มี safe error และ worker cleanup |
| R06 / T03,T04 | advance release clock จาก 2026 เป็น 2027: targets ต้อง Y=2027,Y−1=2026; 2025/2026 ยังคง historical fixtures; absent/partial legal coverage fail closed พร้อม checked date ไม่ใช้ปีเก่าแทนปีใหม่ |
| R07 / T03 | valid safe individual amounts ที่ sum/multiply เกิน safe range → BigInt calculation exact และ serialization unavailable/validation; ไม่มี floating-point loss, silent wrap หรือ rounded invalid totals |
| R08 / T06,T11 | raw invalid edit แล้ว switch taxpayer/year/record/folder/close editor/update; saving/save-error/active import → guard ไม่ทิ้งข้อมูล รอ finish/cancel safe และ save-or-explicit-discard; reports/full backup ต้อง correction/discard; emergency JSON omitted-invalid warning ชัด ไม่มี draft format ใหม่ |
| R09 / T08,T09 | shared live+trash refs รักษา bytes จนครบ final reference; purge current commit → verified post-delete recovery copy → explicit retire affected history → delete bytes; inject fault ทุก stage แล้ว restart dispatch pending-purge stage ไม่ใช้ generic rollback → backup/restore ได้โดย current+retained recovery ไม่มี unexplained missing refs |
| R10 / T05,T12 | JPEG/PNG huge dimensions/small compressed bomb, corrupt/truncated headers, unknown SOF/over header budget, dimension-product overflow: no decoder call เมื่อ preflight ไม่ผ่าน; valid oversize image stored ได้แต่ preview unavailable; one active preview/URL+buffer cleanup; raw unsaved draft ไม่หาย; native digest whole-buffer sequential ≤100 MiB และ peak-memory benchmark ไม่อ้าง streaming hash |

## Mandatory Real-Browser Feasibility Evidence

ก่อน product implementation ต้องบันทึก OS/browser version, API docs URL/date, exact steps และผลจริงของ:
1. directory picker/permission denied, revoke/regrant, close/reopen, moved directory และ removed external drive
2. writer open/write/close/abort; read-back; failed write ว่าต้นฉบับ/previous recovery ยังอยู่หรือไม่
3. Web Locks + two tabs, terminated owner, copied workspace IDs, `isSameEntry`, BroadcastChannel identity behavior
4. external editor เปลี่ยน bytes/revision ก่อน check, ระหว่าง check/write และ different browser profile; รายงานว่าอะไรตรวจพบและอะไร guarantee ไม่ได้
5. bounded ZIP/copy processing และ sequential whole-buffer native digest ตาม per-file limits พร้อม peak-memory evidence ไม่อ้าง WebCrypto incremental streaming; no nested archive execution
6. production offline app shell, local PDF.js canvas/JPEG/PNG previews, hostile-PDF network/resource tests และ app-update waiting behavior; native browser PDF plugin ไม่ใช่ security proof
7. หลังอนุมัติ release เท่านั้น: repeat permission/reopen/save/two-tab/offline tests บน actual GitHub Pages origin พร้อม canonical base; ตรวจว่าไม่มี untrusted co-hosted project ภายใต้ origin เดียวกัน ห้ามใช้ HTTPS URL อย่างเดียวเป็นหลักฐาน API support

หาก Q21 ต้องตีความเป็น exclusive lock ต่อทุกโปรแกรมในเครื่อง ผลการศึกษาต้องรายงาน **BLOCKED / return PLAN** ไม่ใช้ Web Locks เป็นหลักฐานแทน file-system-wide lock

## Official Rule Verification Fixtures

แต่ละ supported year/category ต้องมี fixture ระบุ source URL/title/legal publication/effective dates, checked date, required inputs, expected warning/amount และ reasoning ที่ผู้ตรวจทานตรวจย้อนกลับได้
- boundary: ต่ำกว่า/เท่ากับ/เกินเพดาน และ shared group combined cap
- missing income/eligibility, false eligibility, unknown eligibility
- donation multiplier/ordering/rounding เฉพาะที่มี source ยืนยัน
- tax-year effective range และ special measure expiry
- ไม่มี rule = unavailable; partial rule = partial; ห้ามทดสอบผ่านด้วย guessed historical values

Coverage ของ Y = ปี CE ตาม Asia/Bangkok ณ release และ Y−1 ต้องเผยแพร่ในหน้า rules พร้อมข้อที่ยังตรวจไม่ได้; 2025/2026 เป็น dated regression fixtures ของวันจัดทำแผน ผู้ดูแลตรวจใหม่ทุก release/ต้นปีและเมื่อกฎหมายเปลี่ยน ไม่กล่าวอ้าง “ทันปีปัจจุบันครบถ้วน” หรือ automatic legal correctness จาก year label/clock เพียงอย่างเดียว

## Recovery and Rollback Drills

1. จัดแฟ้ม synthetic พร้อมเอกสารหลายไฟล์และ hash baseline
2. fault-inject ทุกจุด: copy, backup old manifest, manifest write, close, verify, ZIP restore, migration
3. reopen ตรวจ current/retained recoverable manifests พร้อม inventory ว่าไม่มี reference ไปไฟล์ที่ยังไม่สำเร็จ/ถูก purge; historical snapshots ที่ affected ถูก retire หลัง explicit confirmation ไม่แก้ historical manifest เงียบ ๆ
4. กู้คืนลง empty new folder; compare hashes/records/rules/trash; เปิดแก้ไขและบันทึกครั้งใหม่
5. เก็บ source folder เดิมไว้ ไม่มีการล้างเพื่อให้ test ดูผ่าน
6. Static rollback drill: ใช้ known-good build กับ local manifest ที่ schema ใหม่กว่า ต้องปฏิเสธการเขียน; ทดสอบ old SW cache และ waiting new worker ว่าไม่มี forced reload/data downgrade; การ redeploy จริงต้องอนุมัติแยก

## GitHub Pages Release Review — Planned Only

1. Confirm `<OWNER>`, `<REPO>`, `<DEFAULT_BRANCH>`, public URL/base และ Pages plan/visibility eligibility; user-facing app ไม่มี login แต่ maintainer มี GitHub auth
2. Review future `.github/workflows/deploy-pages.yml`: official actions supported immutable SHAs; contents-read build; deploy-only pages-write/id-token-write; npm ci/test/build before artifact; Source GitHub Actions และ environment branch protection
3. Review push/default-branch และ workflow_dispatch/ref guards, PR validation-only isolation, no untrusted secrets/artifacts, deployment concurrency ไม่ cancel active deploy
4. Inspect repository/build artifact/logs using synthetic data only; artifact allowlist ไม่พึ่ง `.gitignore` เพียงอย่างเดียว; ไม่มี user-selected directories ใน CI
5. ทดสอบ matching project prefix บน production preview ก่อนขอ deploy; หลังอนุมัติจึง deploy และบันทึก actual URL/build SHA/browser/SW scope/network/cache/permission results
6. ตรวจ security expectations: HTML meta CSP เท่าที่ Pages รองรับ ไม่อ้าง `frame-ancestors`/`X-Frame-Options`; same-origin paths ไม่ใช่ isolation; GitHub/CDN อาจมี public asset request logs โดยแอปไม่ส่ง personal data

## Completion Evidence Template

เก็บหลักฐานหลังอนุมัติ implementation ในพื้นที่ reports ที่ผู้ควบคุม session เลือก ไม่สร้างรายงาน execution เปล่าในงาน planning นี้:
- Selected anchor + milestone + commit/build identifier ถ้ามี
- What changed / What's Functional Now
- Exact commands/manual steps, OS/browser versions และผล PASS/FAIL/BLOCKED
- Data Verification: manifest revision, file counts, relevant hashes และ recovery results
- Regression: storage/privacy/rules/transfer ที่ได้รับผลกระทบ
- Known limitations รวม external races และ unsupported rule coverage
- Pages release evidence เมื่อได้รับอนุมัติ: repo/branch/canonical origin+base, reviewed workflow permissions, publish artifact inventory, build/deploy identifiers และ actual-origin browser results; ถ้ายังไม่ deploy ให้ระบุ hosted tests pending
- User Confirmation และขั้นถัดไปที่ได้รับอนุมัติ

## Verification Evidence for This Planning Task

ทำได้เฉพาะตรวจ Markdown structure, relative links, traceability Q1–Q23 และไม่มี product files ไม่ถือเป็น evidence ว่าระบบทำงานจริง Global plan validator มี path/naming contract คนละแบบกับ developer ของ session นี้ ต้องบันทึก expected incompatibility ไว้ใน closeout ห้ามอ้างว่าผ่าน validator

## Unresolved Questions

ไม่มีคำถาม product ค้าง; owner/repo/default branch/Pages setup รอยืนยันใน execution preflight; feasibility, source-review และ actual-origin hosting gates ยังไม่ได้ทำ การผ่านเอกสารแผนไม่ทำให้ gate เหล่านี้ผ่านหรืออนุมัติ deployment โดยอัตโนมัติ
