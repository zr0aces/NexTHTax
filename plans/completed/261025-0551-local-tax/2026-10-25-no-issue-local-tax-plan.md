# NexTHTax — แผนพัฒนาเว็บจัดเก็บเอกสารภาษีบนเครื่อง

**Date**: 2026-10-25 (Asia/Bangkok)
**Complexity**: Complex — หนึ่งเว็บแอป หนึ่ง execution stream
**Status**: ⏳ PLANNED / Document review clean; รอ user implementation approval อนุมัติเฉพาะการสร้าง/ตรวจแผน ยังไม่มี code verification

## Overview

เว็บภาษาไทยสำหรับบุคคลธรรมดาที่มีเงินเดือนและการลงทุน เปิดใช้โดยไม่สมัครสมาชิก เก็บข้อมูลและเอกสารในโฟลเดอร์ที่ผู้ใช้เลือก ไม่ส่งข้อมูลส่วนบุคคลไป cloud ช่วยจัดเอกสาร ตรวจรายการค้าง และสรุปยอด/ข้อจำกัดสิทธิที่ตรวจสอบได้ ไม่คำนวณภาษีสุทธิหรือยื่นแทน

**Hosting ที่เลือก: GitHub Pages** สำหรับเผยแพร่เฉพาะ public static app/assets/rules ผ่าน HTTPS ไม่มี application server ส่วนข้อมูลผู้เสียภาษียังคงอยู่เฉพาะโฟลเดอร์บนเครื่อง การใช้ Pages คือ cloud hosting ของตัวแอป ไม่ใช่ zero-cloud infrastructure; GitHub ระบุว่าบันทึก IP ผู้เข้าชมเพื่อความปลอดภัยแม้ไม่ login ข้อจำกัด infrastructure logs นี้ยอมรับได้ แต่แอปห้ามส่ง taxpayer payload ผู้ใช้งานแอปไม่ต้อง login; GitHub authentication ใช้เฉพาะผู้ดูแล repository/deployment

เอกสารประกอบที่เป็นส่วนหนึ่งของข้อกำหนด:
- [Requirements and Architecture](2026-10-25-no-issue-requirements-architecture.md)
- [Acceptance and Verification](2026-10-25-no-issue-acceptance-verification.md)

สารบัญ: [ขอบเขต](#scope) · [ลำดับงาน](#implementation-checklist) · [ข้อสัญญา](#public-contracts) · [หลักฐาน](#verification-evidence) · [ส่งต่องาน](#resume-and-execution-handoff)

## Repository Baseline

- ตรวจแล้วว่าโฟลเดอร์โปรเจกต์ว่างก่อนสร้างแผน ไม่มี source, package manifest, Git repository, test runner หรือ knowledge graph ให้ reuse
- ไม่มี `process/context/all-context.md` และ `process/context/tests/all-tests.md`; ห้ามอ้างว่ามี stack หรือคำสั่งทดสอบของโปรเจกต์อยู่แล้ว
- เว็บอ้างอิงใช้ยืนยันแนวคิดไม่ล็อกอิน/เก็บ local เท่านั้น ไม่กำหนดหน้าตา และไม่เพิ่มระบบออกเอกสารธุรกิจ
- ยังไม่ได้ตรวจสอบกฎภาษีจริงหรือทดลอง File System Access API; ทั้งสองเป็น prerequisite ของงานที่เกี่ยวข้อง
- แผนเก็บที่ `plans/261025-0551-local-tax/` ใช้ชื่อ `{date}-{issue}-{slug}` และ `no-issue` เพราะไม่มี issue

## Scope

**Must ship ทั้งหมด**
- Chrome/Edge desktop; HTTPS หรือ localhost; เลือกโฟลเดอร์เอง; offline หลัง app shell พร้อมใช้งานครบ
- หนึ่งผู้เสียภาษีต่อโฟลเดอร์ หลายปีภาษี; manual entry และ PDF/JPEG/PNG; รายได้/หัก ณ ที่จ่าย/ลดหย่อน/ลงทุน/บริจาค
- ค้นหา กรองหมวด/ปี/สถานะ ดูไฟล์แนบ และเช็กรายการที่ยังขาด
- แยกยอดเอกสาร/ยอดขอใช้สิทธิ; ตรวจเงื่อนไขและเพดานแบบมีแหล่งอ้างอิง; ไม่รับรองสิทธิหรือความครบถ้วนการยื่น
- JSON metadata + ไฟล์แนบที่คัดลอกและอ้างอิงแบบ relative path; autosave; conflict protection; recovery
- โหลด JSON; ZIP backup/restore และเตือนสำรองข้อมูล; print/save PDF; CSV; duplicate warning; trash/restore/permanent-delete confirmation
- กฎรายปีมีเวอร์ชัน/แหล่งทางการ/วันที่ตรวจสอบ; อัปเดตโดยไม่เปลี่ยนแฟ้มเดิมเงียบ ๆ
- ไม่มี login, analytics, remote OCR, data backend หรือ sensitive telemetry; ไม่มี app-level encryption
- เผยแพร่ public app/static rules ด้วย GitHub Pages โดยไม่ใส่ข้อมูลผู้เสียภาษีใน Git, build artifacts หรือ Actions logs; deployment จริงยังต้องอนุมัติแยก

**Non-goals**: portfolio tracking, ราคาหุ้น, OCR, ภาษีนิติบุคคล/VAT, ระบบใบเสนอราคา/ใบกำกับภาษี, คำนวณภาษีสุทธิ, เชื่อมส่งแบบสรรพากร, cloud sync, account sharing, Safari/Firefox/mobile editing, รับประกันการล็อกข้ามโปรไฟล์หรือเครื่อง

## Architecture Decisions

1. **Static client-only app**: Vite + TypeScript strict + React + CSS ภายในโปรเจกต์ ใช้ React เพื่อให้แบบฟอร์ม/สถานะบันทึก/รายการ/ตัวกรองมีเจ้าของ state ชัดเจน ไม่เพิ่ม Next.js, server, router หรือ global state library
2. **Native browser ownership**: File System Access API เป็น persistence boundary, Web Crypto SHA-256 ตรวจเนื้อหา, Web Locks ประสานแท็บ origin เดียวกัน, browser print สร้าง PDF ไม่เพิ่ม PDF generator
3. **Boundary validation**: Zod ใช้ schema เดียวตรวจ JSON, ZIP manifest และ rule bundle ก่อนเข้าสู่ domain; fflate สำหรับ ZIP แบบ incremental จำกัดขนาดระหว่างคลายไฟล์ ห้ามใช้ ZIP parser ที่ไม่จำกัดทรัพยากร; `pdfjs-dist` แบบ local canvas-only preview เพื่อปิด active PDF actions/document network ไม่ใช้ native PDF plugin เป็น security boundary
4. **Offline**: vite-plugin-pwa แบบ prompt update ใช้ precache app/static rules เท่านั้น ไม่ runtime-cache เอกสารหรือ JSON ของผู้ใช้ ไม่เก็บ sensitive data ใน localStorage/IndexedDB/Cache API ไม่จำ directory handle ข้าม session ในรุ่นแรก
5. **Rules เป็นข้อมูลที่ตรวจทานแล้ว ไม่ใช่ scraping runtime**: แจกพร้อมแอป/ไฟล์ static same-origin; ไม่ส่งข้อมูลผู้เสียภาษีเพื่อเช็กสิทธิ ผู้ใช้ยินยอมก่อนเปลี่ยน rules snapshot ของปีเดิม
6. **Storage ไม่ใช่ database transaction**: คัดลอกไฟล์แนบให้เสร็จก่อน commit manifest; เก็บ recovery manifest; ตรวจ revision/hash ก่อนเขียน; หาก runtime ไม่ทำตาม invariant ได้ให้หยุดและกลับมาทบทวนแผน ไม่แอบเปลี่ยนไปใช้ cloud หรือ local daemon
7. **GitHub Pages production target**: ใช้ static build ผ่าน GitHub Actions ไม่ใช้ backend หรือ Sites plugin; `base`, manifest, service worker scope และ rules URLs ต้องสอดคล้องกับ public repository path ที่ยืนยันใน execution preflight

Dependency ทั้งหมดเป็นข้อเสนอสำหรับการอนุมัติแผน ยังไม่ติดตั้ง รุ่น stable ที่เข้ากันและ security/license review ต้องยืนยันก่อนสร้าง lockfile ไม่มี plugin/provider อื่นนอกที่ระบุ

## Touchpoints

เส้นทางต่อไปนี้คือไฟล์ที่จะสร้าง **ภายหลังได้รับอนุมัติ implementation** ไม่ใช่ไฟล์ที่มีอยู่แล้ว:

| เจ้าของ | Planned files | ความรับผิดชอบ |
|---|---|---|
| App entry/UI | `src/main.tsx`, `src/App.tsx`, `src/ui/{WorkspaceScreen,YearOverview,DocumentList,DocumentEditor,BackupPanel,RuleReview}.tsx`, `src/styles.css` | ฟอร์ม/สถานะ/keyboard และ user intent เท่านั้น |
| Domain | `src/domain/{schema,documents,money,years,summary,rules}.ts` | validation, บาท/สตางค์, สถานะ, ปี, ยอดและเงื่อนไข |
| Workspace | `src/storage/{workspace,manifest,attachments,locking,recovery}.ts` | โฟลเดอร์ permission, single writer, verified writes, copied attachments |
| Capacity/preview | `src/storage/capacity.ts`, `src/ui/{PdfPreview,ImagePreview}.tsx`, `src/domain/imageHeaders.ts`, bundled PDF.js worker/font/cmap assets | whole-workspace backup envelope, controlled PDF canvas renderer, pre-decode image pixel limits; ไม่เปิด document-driven actions/network |
| Transfer | `src/transfer/{json,zip,csv,print}.ts` | import/export และ trust boundaries |
| Rules data | `public/rules/index.json`, `public/rules/<CE-year>/<version>.json` | official references, coverage, compatible version |
| Offline/build | `package.json`, lockfile, `index.html`, `vite.config.ts`, `tsconfig.json`, `src/offline.ts` | bundled assets, update prompt, CSP/build |
| Pages deployment | `.github/workflows/deploy-pages.yml`, `.gitignore`, `README.md` | future workflow/build allowlist, Pages owner setup, base/origin และ privacy boundaries; ยังไม่สร้างไฟล์เหล่านี้ในงาน planning |
| Tests | `tests/{unit,integration,e2e}/`, `playwright.config.ts`, `vitest.config.ts` | focused proof ตาม supporting test document |
| User guide | `README.md` | เปิดใช้, privacy, backup/restore, browser limits และ recovery |

ไม่มี interface/provider layer สำหรับ implementation เดียว; UI เรียก workspace operations ที่เป็นผู้เดียวที่เขียนลงดิสก์

## Data Flow and Invariants

1. เปิดแอป → capability check → เลือกโฟลเดอร์ → permission → validate manifest → lock/read-only → แสดงปีภาษี
2. เพิ่มไฟล์ → ตรวจชนิด/ขนาด → hash/duplicate warning → copy to managed attachments → ตรวจ bytes/hash → เพิ่ม record ใน memory → workspace commit
3. แก้ raw input → unsaved-draft guard ทันที → schema/domain validation (invalid ยังเก็บ memory) → capacity preflight → serialize ผ่าน write queue → revision/hash check → recovery + manifest close/read-back/reconcile uncertain commit → saved เฉพาะเมื่อ persisted revision ตรงกับ latest valid memory และไม่มี invalid raw edits
4. Summary อ่านเฉพาะ records ปีที่เลือกและ pinned rules snapshot; excluded/trashed ไม่ถูกนับ; unknown eligibility แสดงแยก ไม่ยืนยันพร้อมยื่น
5. Export อ่าน consistent saved snapshot; ถ้ายัง dirty ต้องบันทึกก่อน หรือให้ผู้ใช้เลือก emergency metadata export ที่ระบุว่าไม่ใช่ full backup
6. Rule update โหลดเฉพาะ static bundle → validate → แสดง diff/ผลต่อสรุป → consent → pin version ใหม่และบันทึก ไม่เปลี่ยน entered amounts

รายละเอียด schema, commit/recovery, race limitations และ trust boundaries อยู่ใน [architecture](2026-10-25-no-issue-requirements-architecture.md)

## Implementation Checklist

ทุกข้อยัง ⏳ PLANNED; ลำดับเป็น milestones ของแผนเดียว ไม่ใช่การอนุมัติให้รันอัตโนมัติข้าม gates

**สถานะการดำเนินการ (EXECUTE, 2026-10-25, อัปเดตโดย execute-agent)**: ผู้ใช้สั่งข้าม manual feasibility gates (ข้อ 1–2 และ headed-browser items 1–6) และให้ implement ตั้งแต่ Phase 4 เป็นต้นไป โดยไม่ทำ git/GitHub/Pages/process docs ผลจริงมีเพียงการทดสอบอัตโนมัติ (Vitest 16 ไฟล์ / 83 tests, Playwright headless 3 tests, typecheck, production build) ยังไม่มีการยืนยัน Chrome/Edge จริงหรือ native picker
- ข้อ 3 (tax-source research) ยังไม่ทำ: rule bundles 2025/2026 เป็น `officialReviewed: false` และทุกหมวด `unavailable` จึงไม่มียอดสิทธิหลังกฎ
- ข้อ 14 (GitHub Pages) ไม่ทำตามคำสั่ง; ไม่มี `.github/workflows/deploy-pages.yml`
- ดู [README](../../README.md) สำหรับข้อจำกัดที่ยังค้าง

1. [ ] ⏳ PENDING MANUAL (ข้ามตามคำสั่ง) **Feasibility research ก่อน product coding**: ตรวจ official browser docs และทดลองใน disposable folder หลังอนุมัติ บันทึก permission persistence/revocation, `createWritable` commit/abort, `isSameEntry`, Web Locks, disk-full/disconnect, multiple-tab behavior ใน README/หลักฐานทดสอบ ห้ามสรุปจาก mocked filesystem อย่างเดียว
2. [ ] ⏳ PENDING MANUAL (ข้ามตามคำสั่ง; README ระบุข้อจำกัดแล้ว) **ยืนยันข้อจำกัด single-writer**: อธิบาย residual external check-write race และขอบเขต origin/profile ให้ผู้ใช้รับทราบก่อนเปิดแก้ไขจริง หากต้องการ exclusive lock ข้ามทุกโปรแกรมถือเป็น architectural blocker ต้องกลับ PLAN
3. [ ] ⏳ PENDING (ยังไม่ได้ research; bundles ยังไม่ยืนยัน) **Tax-source research**: กำหนด Y = ปี CE ใน Asia/Bangkok ณ release แล้วตรวจกรมสรรพากรและกฎหมาย/ประกาศสำหรับ Y และ Y−1 จัด coverage/source/date/test examples และ maintainer annual/release review; 2025/2026 เป็น dated regression examples ไม่ใช่ค่าคงที่ ไม่กำหนดตัวเลขจากความจำ ปี/หมวดที่ยืนยันไม่ได้ต้อง unknown ไม่แสดงเหมือน verified
4. [~] 🧪 TESTING (scaffold, build, smoke e2e ผ่าน) **Scaffold เมื่อผ่าน gate และได้ approval**: สร้าง build/test setup ที่ Touchpoints ระบุ ใช้ static assets ทั้งหมดจาก same origin; smoke test หน้าเริ่มโดยไม่ login และ production build
5. [~] 🧪 TESTING (unit tests ผ่าน) **Domain contracts**: สร้าง schema/money/year/status/summary และ unit tests สำหรับ integer satang + BigInt aggregate/multiplier overflow checks, BE/CE, eligibility unknown, reviewed-only totals, ปีไม่ตรง, shared caps และ exact rounding ของ rules ที่ตรวจแล้ว
6. [~] 🧪 TESTING (integration ด้วย memory-folder fake; ยังไม่มี real FS) **Workspace persistence**: สร้าง workspace/manifest/locking/recovery/capacity และ integration tests สำหรับเปิด/สร้างโฟลเดอร์, read-only, raw-draft/save/error/retry, persisted validated pending candidate ก่อน current write, uncertain commit + startup operation-kind reconciliation, serialized writes, external changes, malformed/newer schema, whole-workspace peak budget และ safe recovery
7. [~] 🔨 CODE DONE (purge แบบย่อ; ไม่มี journal stage; preview ยังไม่ทดสอบ hostile PDF) **Attachment lifecycle**: สร้าง import/native whole-buffer per-file hash/controlled PDF+image preview/reference/trash operations และ tests ที่ยืนยัน canonical managed ownership, copy ก่อน manifest, image header/pixel budget ก่อน decode, live+trash reference safety, explicit recovery retirement ก่อน purge bytes, orphan recovery, duplicate warning, input/aggregate limits และไม่แก้ต้นฉบับ
8. [~] 🔨 CODE DONE (ไม่มี keyboard E2E / component test เต็ม) **Thai document workflow**: สร้าง UI รายการ/ฟอร์ม/ปี/สถานะ/ค้นหา/กรอง/preview พร้อม raw-unsaved navigation guards, component tests และ keyboard E2E ไม่มีการบังคับเลียนแบบเว็บอ้างอิง
9. [~] 🔨 CODE DONE (consent pin ทำแล้ว; ไม่มี eligibility UI) **Year-specific rules workflow**: สร้าง RuleReview และ version pinning; tests สำหรับ offline, unavailable/future year, consent/reject, source dates และไม่เปลี่ยน historical amounts
10. [~] 🧪 TESTING (ZIP round-trip + adversarial ผ่าน; ไม่ใช่ streaming) **Backup/import/restore**: สร้าง JSON/ZIP operations และ round-trip/adversarial tests; restore เฉพาะ empty new folder; backup ต้องมี checksums/file inventory และไม่แสดงครบหากมีไฟล์หาย
11. [~] 🔨 CODE DONE (CSV ทดสอบ; print view ขั้นต่ำ) **Reports**: สร้าง CSV และ print view/PDF ผ่าน browser พร้อม tests สูตร CSV, ภาษาไทย, แยก claimed/evidence/unknown/excluded และคำเตือนรายงานไม่ใช่ไฟล์ยื่น
12. [~] 🧪 TESTING (offline reload e2e ผ่าน; ไม่มี network audit ระหว่างใช้งาน) **Offline/privacy**: สร้าง app-only precache และ update prompt; ทดสอบ network offline + cache inspection + no sensitive outbound; ห้าม reload update ขณะ dirty/import/backup/write
13. [ ] ⏳ PENDING (automated เท่านั้น; manual/acceptance ยังไม่ทำ) **Release acceptance**: รัน test matrix ทั้ง Chrome/Edge จริง, typecheck/build, permission/error/recovery tests, ตรวจ accessibility, ให้ผู้ใช้ตรวจ flow และบันทึกผลจริง ไม่ deploy หรือ commit โดยปริยาย
14. [ ] ⏳ NOT STARTED (ข้ามตามคำสั่ง) **GitHub Pages release เมื่อได้อนุมัติแยก**: ยืนยัน owner/repository/default branch/canonical URL และสิทธิ Pages ก่อนสร้าง workflow ตาม section ด้านล่าง; ทดสอบ build ภายใต้ base จริง ตรวจ artifact ไม่มีข้อมูลส่วนบุคคล แล้วจึงขออนุมัติ deploy และตรวจ Chrome/Edge บน actual Pages HTTPS origin

## GitHub Pages Deployment Plan

- **Execution preflight ไม่ใช่ข้อเท็จจริงปัจจุบัน**: ยังไม่มี Git remote/repository/default branch ให้ยืนยัน `<OWNER>`, `<REPO>`, `<DEFAULT_BRANCH>` และ Pages eligibility/visibility ก่อน setup ไม่สร้าง account/repo, เปลี่ยน billing หรือ assume custom domain; ประเมิน free Pages ตามแผน/visibility ที่เลือก ไม่อ้างว่าใช้ฟรีได้ทุกกรณี
- ผู้ดูแลตั้ง Repository Settings → Pages → Source เป็น **GitHub Actions** และอนุญาต environment `github-pages` เฉพาะ branch ที่เลือก การอนุมัติงาน planning ไม่ใช่การอนุมัติตั้งค่า repository หรือ publish
- **Public URL/base**: project site `https://<OWNER>.github.io/<REPO>/` ใช้ Vite base `/<REPO>/`; owner site repository `<OWNER>.github.io` ใช้ base `/` โดยไม่มี custom domain ในแผนแรก จัด origin/path ให้คงที่ก่อนแจกผู้ใช้
- **Future workflow เท่านั้น**: `.github/workflows/deploy-pages.yml` ใช้ official `actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages` ที่ supported release และ pin immutable commit SHA หลังตรวจ provenance; ไม่ใช้ third-party deployment action หรือ long-lived deploy token
- **Build gate**: checkout → Node version ที่ล็อกไว้ → `npm ci` จาก committed lockfile → typecheck/tests/build → inspect publish artifact → upload เฉพาะ `dist/` ไม่อัปโหลด repository/workspace ทั้งหมด ไม่มี user folder mounts หรือ real fixtures ใน CI
- **Least privilege**: workflow/build default ให้ `contents: read`; เฉพาะ deployment job ให้ `pages: write` และ `id-token: write` พร้อมสิทธิอ่านที่จำเป็น ใช้ environment `github-pages` และ OIDC ไม่แจก write permissions ให้ PR/build jobs
- **Branch/PR isolation**: publish เฉพาะ push บน `<DEFAULT_BRANCH>` ที่เลือกไว้ หรือ `workflow_dispatch` ซึ่ง deploy job ต้องตรวจว่า ref เป็น branch นั้นเช่นกัน; PR ทำ validation เท่านั้น ไม่ deploy ไม่ใช้ `pull_request_target` เพื่อรันโค้ด PR ไม่รับ privileged secrets/artifacts จาก untrusted PR ไป deploy
- **Concurrency**: ใช้ Pages deployment concurrency group และไม่ cancel deployment ที่เริ่มแล้ว (`cancel-in-progress` เป็น false); deployment serialization ไม่แทน workspace storage locks และไม่ทำให้ unsaved edits ปลอดภัยเอง
- **Privacy boundary**: ห้าม commit/upload taxpayer JSON, documents, backups, recovery directories, browser profiles, real fixtures หรือ screenshots/logs ที่มีข้อมูลจริง ใช้ synthetic fixtures และ artifact file allowlist เป็น gate ก่อน publish; `.gitignore` เป็นเพียงชั้นช่วย ไม่ใช่หลักประกันเพียงอย่างเดียว
- **Rollback**: rebuild/redeploy known-good static commit หลังอนุมัติ ไม่ rollback ข้อมูลในเครื่องอัตโนมัติ; older app ต้องปฏิเสธ newer schema รักษา folder เดิมและเสนอ restore ไป folder ใหม่ Service worker อาจยังเสิร์ฟ build เก่าระหว่างรอ update จึงต้องแสดง app/rules versions และทดสอบ stale-cache/update path ไม่มี forced reload ตอน dirty
- **Hosted acceptance**: HTTPS เป็น prerequisite ไม่ใช่หลักฐานว่า API ทุกตัวทำงาน ต้องทดสอบ actual Pages origin หลัง explicit deploy approval ตาม T13/T14 ก่อนกล่าวว่าเผยแพร่สำเร็จ

**Official references — ตรวจสอบ 2026-10-25**:
- [Vite: GitHub Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages): project/owner-site base และ Pages Source = GitHub Actions
- [GitHub: Custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): build dependency, `github-pages` environment และ deployment permissions
- [GitHub: What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): visitor IP logging สำหรับ security แม้ไม่ login

supported action releases/immutable SHAs ต้อง resolve อีกครั้งตอน implementation ไม่ล็อกเลขเวอร์ชันจากตัวอย่างเอกสารในแผนนี้

## Execution Brief and Gates

| ช่วงงาน | สิ่งที่ functional เมื่อผ่าน | Test Procedure / Data Verification | Done when |
|---|---|---|---|
| 1–3: evidence gates | ความสามารถ browser และขอบเขตกฎมีหลักฐาน; ยังไม่มี product | รายงาน API experiments บน folder ทิ้งได้; official source matrix; ไม่มี user data | ผู้ใช้ยืนยันข้อจำกัดที่กระทบ Q21 และ scope rules |
| 4–7: data foundation | สร้าง/เปิดแฟ้ม เก็บข้อมูลและไฟล์อย่างปลอดภัย | เปิดใหม่ตรวจ JSON+hash; inject write failure; สองแท็บ; recovery | integration/manual/error tests ผ่านและผู้ใช้ยืนยัน |
| 8–9: usable workflow | จัดเอกสารและตรวจยอดตามปีได้ | Thai E2E เพิ่ม/ค้นหา/แก้/ตรวจ; independently recompute examples | UI/summary/pinning ถูกต้องและไม่มี unknown ที่ถูกแสดงเป็น verified |
| 10–14: complete acceptance/release | ย้าย/กู้คืน/รายงาน/offline ใช้ได้ครบ; Pages พร้อมเผยแพร่เมื่ออนุมัติแยก | ZIP round trip ใน folder ใหม่, original untouched, network/cache evidence, production-base/artifact/workflow checks; hosted tests หลังอนุมัติ deploy | acceptance matrix ที่เกี่ยวข้องผ่านและ User Confirmation; หากยังไม่ deploy ต้องระบุ hosted proof pending |

### Phase Completion Rules

งานแต่ละช่วงไม่ครบจน integration, manual flow, data verification บนดิสก์, error handling และ **User Confirmation** ผ่านครบ สถานะใช้ ⏳ PLANNED → 🔨 CODE DONE → 🧪 TESTING → ✅ VERIFIED; blocked ใช้ 🚧 BLOCKED พร้อมเหตุผลและ safe next action ไม่มีคำว่า VERIFIED จาก build ผ่านอย่างเดียว

ก่อนเริ่มแต่ละช่วงอ่าน code/หลักฐานล่าสุด ตรวจ assumptions นำเสนอ findings และหยุดรอ approval ก่อน implementation ห้ามรวม research กับ implementation ที่ยังไม่อนุมัติ หลังจบต้องรายงาน What's Functional Now / What Was Tested / What You Can Test / Ready For และ regression ของ storage/privacy/rules ที่กระทบ

## Public Contracts

- JSON schema version, workspace ID, monotonic revision, relative attachment paths และ pinned rules snapshots เป็น portability contract; รายละเอียดอยู่ใน architecture
- Unsupported newer schema/rules ห้าม downgrade หรือเขียนทับ; อ่านได้เฉพาะ safe supported fields หากพิสูจน์ได้ มิฉะนั้นปฏิเสธพร้อมแจ้งเวอร์ชันที่ต้องใช้
- Imported rules ไม่สามารถรับรองตนเองผ่าน coverage/source/version/hash ในไฟล์นำเข้า; ป้าย officially reviewed ใช้เฉพาะเนื้อหาและเวอร์ชันที่ตรงกับ trusted app-shipped static catalog ส่วน unmatched snapshots เก็บหลักฐานเดิมได้แต่ต้อง unverified/unknown
- ZIP full backup ต้อง round-trip JSON+ไฟล์แนบ+trash/recovery/rule snapshots; JSON-only import ต้องแสดง missing attachments
- Save indicator แปลว่า browser close สำเร็จและอ่านกลับตรวจได้ ไม่อ้างรับประกัน physical power-loss durability ของ OS/disk
- หนึ่ง writer ต่อแฟ้มภายใน origin/profile ที่ประสานได้; ตรวจ conflict ภายนอกก่อนเขียน ไม่กล่าวอ้าง distributed lock
- ทุก admitted mutation ต้องคง whole-workspace backup envelope รวม trash/recovery/metadata/ZIP overhead; ownership ตรวจ canonical generated namespace + ID/type/bytes ไม่เชื่อ arbitrary manifest paths; raw invalid edits ไม่หายจาก navigation โดยไม่ยืนยัน
- ไม่มี financial data ใน URL, remote logs, analytics หรือ browser persistence นอก selected folder
- GitHub Pages เผยแพร่เฉพาะ public app/rules; ไม่มี taxpayer-data upload โดยแอป แต่ GitHub บันทึก visitor IP เพื่อความปลอดภัย และ Pages/CDN อาจมี request metadata ของการโหลดแอป ห้ามสื่อว่าไม่มี cloud hosting หรือ infrastructure logs

## Acceptance Criteria

ทั้งหมดใน [Acceptance and Verification](2026-10-25-no-issue-acceptance-verification.md) ต้องผ่าน ไม่มีการตัด backup, offline, unknown rules, conflicts หรือ accessibility ออกจาก MVP เพื่อให้สถานะดูเสร็จ

## Dependencies, Risks and Rollback

| Risk | Mitigation / stop condition |
|---|---|
| Browser ไม่รองรับ semantics ที่คาด | feasibility gate; แสดงหน้าข้อจำกัดและ browser ที่รองรับ ไม่เปิดเขียนแบบไม่ปลอดภัย; ไม่ติดตั้ง daemon แทนเงียบ ๆ |
| Race จาก external editor/cross-profile | revision+hash check, retained manifests, explicit limitation; strong exclusivity requirement → return PLAN |
| Crash/multi-file partial writes | immutable attachments before manifest, prior manifest recovery, no orphan auto-delete |
| กฎปัจจุบันยังไม่ยืนยันหรือเปลี่ยนกลางปี | explicit coverage/unknown, official citations, pinned snapshots, no false verified total |
| malicious JSON/ZIP/PDF/CSV | validation/limits, path containment, safe rendering, formula mitigation; ดู tests |
| uncertain commit/oversized growth/permanent purge | candidate-vs-prior reconciliation ก่อน retry; precommit capacity budget; retain current+recoverable manifest ก่อน retire old snapshots/purge bytes |
| disk full/permission lost | never overwrite prior good backup, dirty/error state, retry/emergency export |
| unencrypted/synced folder | clear warnings; user disk encryption/backup responsibility; cannot detect all OS sync |
| app update/schema migration | explicit approval, backup before migration, keep original folder; old app must reject newer schema |
| Pages base/origin หรือ service worker scope ผิด | base-aware production tests, fixed canonical URL, actual-origin manual proof; เปลี่ยน origin ให้ reselect folder โดยไม่แก้ข้อมูลเดิม |
| Pages owner origin ใช้ร่วมกับ untrusted repositories | project subpaths ไม่ใช่ security boundary; ห้าม co-host untrusted apps ใต้ owner origin เดียวกัน; ยืนยัน owner trust ก่อน release |

Rollback app build ไม่แปลว่า rollback data schema; restore ลงโฟลเดอร์ใหม่จาก validated backup และให้ผู้ใช้เลือกเปิด ไม่มี automatic destructive rollback ระหว่าง partial import ให้เหลือ failed-import marker และแสดงรายการที่เขียนแล้ว ไม่ลบไฟล์ภายนอกหรือข้อมูลก่อนหน้า

## Blast Radius

ปัจจุบันเปลี่ยนเฉพาะเอกสารแผน ไม่มี code/runtime/dependency/data change อนาคต implementation กระทบเว็บ static และโฟลเดอร์ที่ผู้ใช้อนุญาต; การตั้งค่า GitHub repository/Actions/Pages และเผยแพร่ public assets อยู่ใน release scope ที่ต้องอนุมัติแยก ไม่แตะข้อมูลภาษีบน cloud หรือไฟล์ต้นฉบับนอก workspace

## Verification Evidence

- **ทำแล้ว**: ตรวจ empty directory/no Git/no existing code/context; อ่าน scope ที่ผู้ใช้ตกลง Q1–Q23 และ correction ของ Q17
- **ยังไม่ทำ**: browser feasibility, tax research, automated/manual product tests, dependency/build/deploy, GitHub owner/repository setup และ actual Pages origin tests
- ก่อน close implementation ต้องแนบ exact command, browser/OS/version, test output, expected/actual disk contents, failure recovery result และ redacted screenshots ไม่มีเอกสารจริงของผู้ใช้ใน repository
- Global validator `/home/san/.claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs` hard-code `process/.../active/` และ `_PLAN_` ไม่รองรับ developer naming/path ของ session นี้ ต้องรายงาน incompatibility แทนเปลี่ยน validator หรือทำ duplicate plan; ตรวจ sections/links/coverage แยก

### Planning Review History

- **2026-10-25 / Round 1 corrected**: uncertain-commit retry, whole-workspace backup budget, canonical attachment ownership, untrusted citation links, controlled PDF rendering, rolling release-year coverage, aggregate money overflow, invalid-draft/navigation loss และ permanent-delete/live+trash/recovery consistency
- **2026-10-25 / Round 2 corrected**: startup recovery แยก operation kind/stage ไม่ rollback committed candidate, native whole-buffer WebCrypto hashing ไม่กล่าวอ้าง streaming hash, JPEG/PNG pre-decode dimension/pixel limits และ cleanup
- **2026-10-25 / Round 3 corrected**: persist/read-back validated pending candidate bytes ก่อน current write เพื่อให้ restart retry มีข้อมูลจริง; missing/corrupt pending bytes ไม่อ้าง recoverable และ raw newer edits ไม่อยู่ใน crash guarantee
- **2026-10-25 / Final review PASS — document-only**: independent architecture reviewer Round 4 และ acceptance reviewer ตรวจ latest candidate/startup changes รวม full flow แล้ว CLEAN ไม่มี material findings ค้าง; focused structural check ผ่าน: 3 Markdown files, 8 relative-file links, 6 heading-fragment links, required sections, Q1–Q23, T01–T14 และ R01–R10
- การผ่าน review หมายถึงความสอดคล้องของแผนเท่านั้น ไม่มี runtime/financial/browser/deployment proof; filesystem feasibility, official tax coverage และ actual Pages-origin gates ยัง pending ต้องดำเนินตาม approval เดิม Legacy validator ยังมี naming/path incompatibility ไม่อ้างว่าผ่าน

## Change Management

เมื่อจำเป็นต้องเปลี่ยน scope, dependency, storage guarantee, public schema หรือ supported browser: หยุดส่วนที่ได้รับผล ระบุเหตุ/ทางเลือก/ผลต่อข้อมูลและ tests อัปเดตทั้งสามเอกสารแล้วขออนุมัติ ห้ามแก้ข้อจำกัดด้วย cloud หรือ silently weaken safety

## Resume and Execution Handoff

- **Primary execute anchor**: `plans/261025-0551-local-tax/2026-10-25-no-issue-local-tax-plan.md`
- Supporting files: requirements/architecture และ acceptance/verification ที่ลิงก์ต้นเอกสาร ไม่ใช่แผน execute แยก
- อ่าน anchor + supporting ทั้งสอง + code/context ล่าสุดถ้ามี ก่อนเลือก milestone แรกที่ยังไม่ผ่าน
- วันนี้ user อนุมัติ **planning only** ห้าม scaffold, install, Git init, prototype, tax scraping, deploy หรือ product implementation ต่อเอง
- Next valid action: ผู้ใช้ review แผน แล้วอนุมัติ `ENTER EXECUTE MODE` พร้อม exact anchor และขอบเขตงาน; เริ่มที่ feasibility evidence ไม่ใช่ข้ามไปสร้าง UI
- Unresolved questions: ไม่มี product preference ค้าง; execution preflight ต้องยืนยัน GitHub owner/repository/default branch/Pages visibility/canonical origin และ technical evidence gates (browser filesystem/concurrency, official year-rule coverage, production base/hosted API behavior) ก่อนกล่าวอ้างว่าทำได้ครบ ไม่ต้องขอรายละเอียด setup เหล่านี้เพื่อแก้แผนรอบนี้
