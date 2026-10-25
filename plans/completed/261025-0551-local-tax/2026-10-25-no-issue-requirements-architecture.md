# NexTHTax — Requirements and Architecture

**Date**: 2026-10-25
**Status**: Reviewed supporting specification — document-only; ไม่มี implementation หรือ runtime verification
**Primary plan**: [Local Tax Plan](2026-10-25-no-issue-local-tax-plan.md)

## Approved Requirements Traceability

| Interview | ข้อกำหนดที่ตกลง | เจ้าของ / acceptance group |
|---|---|---|
| Q1 | เก็บเอกสาร สรุปสิทธิ/เตือนเพดาน ไม่คำนวณภาษีสุทธิ | domain rules / T03 |
| Q2 | โหลด app/rules ได้ ไม่มี sensitive outbound; offline | offline/privacy / T01,T10 |
| Q3 | Chrome/Edge desktop โฟลเดอร์จริง ไม่ใช้ localStorage เป็นคลัง | workspace / T01,T02 |
| Q4 | แยกปีภาษี/ปีที่ยื่น รองรับหลายปีและ historical rules | years/rules / T03,T04 |
| Q5 | บุคคลธรรมดาเงินเดือน+ลงทุน ไม่รวมนิติบุคคล/VAT | taxonomy / T03 |
| Q6,Q7 | JSON + ไฟล์แนบ relative paths; ZIP backup ทั้งชุดและเตือนสำรอง | transfer / T07,T08 |
| Q8 | ไม่มี app password/encryption; disk security เป็นหน้าที่ผู้ใช้ | privacy guide / T10 |
| Q9 | manual entry ยังไม่มี OCR | editor / T05 |
| Q10 | หนึ่ง taxpayer ต่อ directory เปิดสลับได้ | workspace / T02 |
| Q11 | กฎมี version/source/date; consent update; unknown warning | rules / T04 |
| Q12 | รวมรายได้และหนังสือรับรอง 50 ทวิ | taxonomy/editor / T03,T05 |
| Q13 | investment tax evidence ไม่ทำ portfolio/market prices | taxonomy / T03 |
| Q14 | autosave honest state; permission failure/retry/emergency JSON | persistence / T06 |
| Q15 | validate import; new empty restore directory; missing-file visibility | transfer / T07,T08 |
| Q16 | duplicate warning; trash; confirm hard delete; protect originals | attachments / T05,T09 |
| Q17 corrected | เว็บอ้างอิงหมายถึง no login/local only ไม่ใช่ UI parity | app entry/privacy / T01,T10 |
| Q18 | evidence/claimed แยก; unknown eligibility; reviewed-only ready total | summary / T03 |
| Q19 | waiting-document/waiting-review/reviewed/excluded; shared attachments | documents / T05,T09 |
| Q20 | print/PDF + CSV เป็นรายงานไม่ใช่ไฟล์ยื่น | reports / T11 |
| Q21 | one writer, read-only second window, external-change detection | locking / T06; limitations ด้านล่าง |
| Q22 | app ไม่ sync cloud; เตือน selected folder/OS sync limitations | privacy / T10 |
| Q23 | copy+verify ก่อน import success ไม่ย้าย/แก้ original | attachments / T05 |

## Domain and Initial Taxonomy

UI ภาษาไทย; ID ในข้อมูลคงที่ไม่ผูกข้อความแสดงผล:
- **รายได้**: เงินเดือน/โบนัส, เอกสารรายได้จากการลงทุน (ดอกเบี้ย/เงินปันผล), รายได้อื่นเพื่อเก็บหลักฐานโดยไม่อ้าง coverage การคำนวณ
- **ภาษีหัก ณ ที่จ่าย**: หนังสือรับรอง 50 ทวิ และหนังสือรับรองจากการลงทุน; เชื่อมเอกสารรายได้ได้แต่ห้ามรวมยอดซ้ำจากการเชื่อม
- **ค่าลดหย่อน**: ส่วนบุคคล/ครอบครัว, ประกัน, ออม/เกษียณและกองทุนที่มีสิทธิ, ประกันสังคม, ดอกเบี้ยที่อยู่อาศัย, มาตรการเฉพาะปี
- **เงินบริจาค**: ทั่วไป, กลุ่มที่มีเงื่อนไข/ตัวคูณเฉพาะกฎหมาย, หลักฐาน e-Donation; แยกประเภทตามกฎปีจริง ไม่อนุมานสิทธิจากชื่อผู้รับ
- **อื่น ๆ / รอจำแนก**: เก็บเอกสารได้โดยไม่มีการคำนวณสิทธิจนยืนยันหมวด/ปี/เงื่อนไข

มีหมวดให้เก็บไม่ได้แปลว่ามี verified tax rule; index รายปีต้องระบุ coverage ต่อ category เป็น verified/partial/unavailable พร้อมเหตุผล ไม่มี fabricated rates หรือการใช้กฎปีเก่าแทนปีใหม่อัตโนมัติ Release acceptance ใช้ Y = ปี CE ตาม Asia/Bangkok ณ วัน release และตรวจทั้ง Y กับ Y−1; 2025/2026 เป็น dated examples/regression fixtures ของแผนนี้ ไม่ใช่ปีเป้าหมายคงที่ arbitrary historical/future year เก็บได้ แต่ไม่แสดงกฎเป็นยืนยันเมื่อไม่มีข้อมูล ผู้ดูแลต้องทบทวน official coverage ทุก release/ต้นปีและเมื่อประกาศเปลี่ยน พร้อม checked date/changelog; ไม่รับรองการอัปเดตกฎหมายอัตโนมัติ

วันเริ่มต้น default ปัจจุบันตาม Asia/Bangkok: ในวันจัดทำแผนเป็นปี CE 2026 / พ.ศ. 2569; ปีที่มักยื่นใน 2026 คือ tax year 2025 / 2568 UI ต้องให้เลือกเอง ไม่เปลี่ยนปีเอกสารเดิมเมื่อข้ามปีใหม่

## Public Data Model

ไฟล์ `data.json` เป็น manifest UTF-8; ไม่มี embedded Base64 หรือ absolute machine paths:
- Root: `schemaVersion`, `workspaceId` (UUID), `revision` (incrementing integer), `createdAt`, `updatedAt`, `taxpayer`, `years`, `records`, `attachments`
- taxpayer: display name และ optional identifier ที่จำเป็นต่อเอกสารเท่านั้น ไม่บังคับเลขบัตร/บัญชี/วันเกิดหากไม่ใช้ตรวจเงื่อนไข ห้ามมีข้อมูลของคนที่สองใน root เดียว
- Year: CE `taxYear`, `rulesVersion` หรือ null, relative path/hash ของ pinned rule snapshot, user-entered eligibility facts แบบ yes/no/unknown และ checklist items ของปีนั้น
- Record: UUID, CE taxYear, category/subcategory, document date แบบ `YYYY-MM-DD` ที่ไม่แปลงวันด้วย UTC, title/issuer/notes, `evidenceAmountSatang`, `claimedAmountSatang`, `withheldAmountSatang` เมื่อเกี่ยวข้อง, currency คงที่ THB, review status, attachment IDs, timestamps, optional `trashedAt`
- Amount: non-negative safe integer satang; แยก blank/unknown จาก zero; ไม่ใช้ floating-point money ไม่ยอมรับ malformed/infinite/negative values ไม่มี auto-cap ที่เปลี่ยนยอดกรอกเอง `claimedAmountSatang` คือยอดฐานที่ผู้ใช้เลือกใช้สิทธิก่อนตัวคูณ/เพดาน ส่วนยอดสิทธิหลังใช้กฎเป็น derived value ที่แสดงแยก ไม่เขียนทับยอดฐาน
- การบวก/ลบ/คูณ/หาร/เปรียบเทียบเงินรวมและตัวคูณใช้ BigInt ภายในกับ rational integer rounding ตามกฎ ห้ามผ่าน floating-point intermediate; serialize เป็น Number เฉพาะผลที่อยู่ใน safe-integer range หาก input/ผลเกิน range ให้ validation/unavailable warning ไม่ wrap/truncate หรือแสดงยอดที่ precision หาย
- Attachment: UUID, safe original display name, generated managed relative path, media type ที่ตรวจแล้ว, byte size, SHA-256; หลาย record อ้าง ID เดียวกันได้; ไม่ใช้ original filename สร้าง paths
- Rules bundle: schema version, CE year, immutable version, `reviewedAt`, official source URLs/title/publication/effective dates, category coverage, supported conditions/limit groups/rounding และ explanatory text; ไม่ยอมให้ bundle มี executable expressions หรือ HTML

สถานะ `waiting-document`, `waiting-review`, `reviewed`, `excluded` เป็นสถานะงาน ไม่ใช่คำรับรองสิทธิ Records ใหม่ไม่เป็น reviewed อัตโนมัติ; การแก้ year/category/amount/attachment ทำให้ reviewed กลับ waiting-review; attachment ที่หายทำให้รายการไม่พร้อม หากเลือก reviewed โดยไม่มีไฟล์ให้ต้องยืนยันเหตุผลว่าเป็นข้อมูลที่ไม่ต้องมีเอกสารแนบ เช่น checklist fact

Readiness แสดงเฉพาะ “รายการที่ตรวจสอบแล้วตามข้อมูลที่บันทึก” ไม่แสดง “เอกสารครบสำหรับยื่น” เป็นการรับรองทางกฎหมาย การตรวจ checklist อาจเพิ่มรายการตามผู้ใช้และกฎ แต่ห้ามตีความรายการที่ไม่มีว่าไม่เกี่ยวข้องโดยอัตโนมัติ

## Workspace Layout and Ownership

- `data.json`: current manifest
- `attachments/<attachment-id>.<validated-extension>`: immutable copied bytes
- `rules/<taxYear>/<version>.json`: pinned static rule snapshots ใช้งาน offline/restore ได้
- `.recovery/`: previous valid manifests, validated pending candidate manifest bytes และ pending-operation metadata สำหรับ crash recovery เก็บ current และ previous validated manifests อย่างน้อยหนึ่งชุดก่อนแทนที่
- Trash เป็น `trashedAt` ใน manifest ไม่ย้าย/ลบไฟล์แนบที่ยังมี live หรือ trash references; full backup รวม trash และ retained recovery inventory
- Permanent delete นับ references จาก **ทั้ง live และ trash records** ที่ยังไม่ลบถาวร; ลบ record หนึ่งไม่ลบ attachment bytes/map entry ที่ record อื่นรวม trash ยังใช้ เมื่อ final reference หายจึง prune attachment map ใน candidate current manifest และทำ purge protocol ด้านล่าง
- Purge ต้องยืนยันพร้อมเตือน backup และเปิดเผยว่า recovery snapshots เก่าที่อ้างไฟล์นี้จะถูก retire ถาวร ไม่อ้างว่าการ purge ย้อนกลับได้: journal ระบุ canonical managed targets/affected snapshot IDs → commit+read-back current manifest ที่ลบ refs แล้ว → สร้าง/read-back recovery copy ของ post-delete manifest → retire เฉพาะ affected historical snapshots จาก validated recovery inventory → ลบ bytes ที่ไม่มี refs จาก current live+trash และ retained recovery ทั้งหมด หากขั้นใดไม่สำเร็จหยุดก่อนขั้นถัดไป เก็บ journal/recovery และไม่ย้อน manifest ให้ชี้ไฟล์หาย
- หลัง purge ต้องมี current และอย่างน้อยหนึ่ง validated recoverable snapshot ที่อ้างเฉพาะ bytes ที่ยังมีอยู่ (post-delete snapshot อาจ revision เดียวกับ current เป็นข้อยกเว้นของ historical recovery retention ที่ผู้ใช้ยืนยันไว้); ไม่แก้ historical manifests เงียบ ๆ Partial purge reconcile จาก journal ก่อน mutation/complete backup; retry ใช้ validated actual state และไม่ลบ bytes ก่อน retirement verified ครบ ไม่มี dangling recovery refs ที่ถูกเรียกว่า backup complete

เปิดโฟลเดอร์ใหม่ต้องไม่มีข้อมูลอื่น; โฟลเดอร์ non-empty เปิดได้เฉพาะ manifest ที่ validate ผ่าน ห้ามยึด/ลบไฟล์ที่ไม่ใช่ของแอป Reject symlinks/unsupported directory entries ถ้า browser เปิดเผยไม่ชัด ห้าม resolve references ออกนอก selected root

- ทุก path ต้องตรง canonical namespace และ identity/type ไม่ใช่เพียง relative: attachment เป็น `attachments/<lowercase-UUID>.<pdf|jpg|png>` ที่ ID ตรง registry และ validated bytes/media/hash; rules เป็น `rules/<CE-year>/<safe-version-token>.json` ที่ตรง snapshot identity; recovery เป็นชื่อที่ recovery module สร้างใน `.recovery/` เท่านั้น
- Attachment declaration ที่ชี้ `data.json`, `rules/`, `.recovery/`, root files หรือชื่อ generated ไม่ตรง ID/type ต้อง reject แม้ schema/hash อื่นดูถูกต้อง; ไม่อ้าง ownership จากนามสกุลหรือ manifest declaration เพียงอย่างเดียว
- Onboarding ว่าง → app-generated namespaces → copied bytes verified → registry จึงถือเป็น managed lifecycle; reopen ตรวจ inventory จริง/canonical path/content/hash พร้อม reject foreign entries/collisions ก่อนแก้ไขหรือลบ ไม่ adopt/overwrite foreign files ให้เป็นของแอปโดยเงียบ ๆ การลบใช้ validated managed inventory + reference check + explicit confirmation ไม่ iterate ลบตาม paths ใน untrusted import โดยตรง

## Whole-Workspace Capacity and Backup Invariant

- แฟ้มที่ app ยอมเขียนต้อง backup+restore ได้ภายใน envelope เดียวกันเสมอ: managed uncompressed bytes ทั้งชุดไม่เกิน **768 MiB**, ไม่เกิน **8,000 file entries**, แต่ละ attachment ไม่เกิน **100 MiB**, แต่ละ metadata JSON (current/candidate/recovery manifest, rule snapshot, inventory/journal) UTF-8 ไม่เกิน **20 MiB** รวม live/trash/recovery/rules/orphans ที่ app เป็นเจ้าของและ backup inventory/journal ทั้งหมด ห้ามนับเฉพาะ live records
- ZIP exporter ใช้ STORE (ไม่บีบอัด) แบบ bounded streaming เพื่อตัดความเสี่ยง compression expansion; canonical path UTF-8 ≤240 bytes/entry ไม่มี comments/extra entries ที่ไม่คาดคิด จอง overhead **1,024 bytes/entry + 1 MiB** ภายใน ZIP budget **1 GiB / 10,000 entries**; actual emitted bytes/count ต้องตรวจระหว่างเขียนด้วย ไม่เชื่อ estimate อย่างเดียว
- ทุก mutation/import/restore preflight prospective peak managed inventory (candidate manifest + previous valid recovery + pending journal + attachments/rules/trash/orphans + ZIP inventory reserve) ก่อนเขียน รวม record/notes growth ที่ไม่มีไฟล์ใหม่; reserve snapshot/recovery budget ก่อน commit ถ้าเกินให้ปฏิเสธ mutation คงข้อมูลเดิม ไม่มี auto-delete/trash purge เพื่อเปิดพื้นที่
- Copy/ZIP ใช้ bounded chunked buffers ไม่โหลดทั้ง backup เข้า memory ส่วน native `crypto.subtle.digest` **ไม่ใช่ streaming hash**: อ่าน whole ArrayBuffer ทีละไฟล์ได้สูงสุด 100 MiB สำหรับ attachment, 20 MiB สำหรับ manifest, hash ครั้งละหนึ่งไฟล์และ release buffer เมื่อจบ ไม่ implement custom crypto; ปิด/release active preview ก่อนเริ่ม whole-buffer hash/import และ benchmark peak browser/worker memory ตาม workload จริง fault/partial import ที่เหลือไฟล์ค้างต้อง inventory/reconcile ก่อน mutation ถัดไป ไม่สะสม orphan จนหลุด budget; OS/browser hidden temporary writes และพื้นที่ดิสก์จริงอาจยังล้มเหลว ต้องใช้ save-error/recovery ไม่อ้างว่า logical budget รับประกัน disk capacity
- Existing/legacy workspace เกิน envelope ให้ bounded inspection/read-only ไม่ bulk-parse เกิน JSON limit และไม่ auto-truncate; แสดงชัดว่า full ZIP ของรุ่นนี้ทำไม่ได้ คง original files และแนะนำ OS-level byte-preserving folder copy พร้อมตรวจ inventory ก่อนกลับ PLAN เพื่อจัดการ oversized migration ไม่มี fake complete backup หรือการลบข้อมูลเพื่อให้ผ่าน limit

## Persistence State Machine and Recovery

สถานะ UI: no-folder → opening → ready/read-only; editor: saved/dirty/saving/save-error/conflict/recovery-required
- ทุก raw edit รวม invalid fields ทำให้ unsaved-draft guard ทำงานทันที เก็บ raw input ใน memory ไม่เขียน invalid manifest; valid domain draft แยกจาก raw form เพื่อแสดง validation errors โดยไม่หายเงียบ ๆ
- debounce autosave 500 ms หลังหยุดแก้; หนึ่ง serialized write queue ต่อ workspace; revision ใหม่ที่เกิดระหว่าง saving ยัง dirty จน revision ล่าสุดบันทึกจริง
- ก่อน commit ตรวจ current manifest revision และ raw-byte SHA-256 ตรงกับ loaded baseline; mismatch → conflict/read-only ไม่มี automatic overwrite/merge
- ตรวจ permission และ previous recovery copy ให้สำเร็จก่อนเปิด writer; write+close manifest แล้วอ่านกลับ validate/hash จึงเปลี่ยนเป็น saved
- ก่อนแตะ current manifest ต้อง serialize/validate candidate เป็น immutable snapshot แล้วเขียน `.recovery/pending-<lowercase-UUID>.json`, close/read-back/hash ให้ตรงก่อน จากนั้นบันทึก validated journal ที่อ้าง canonical candidate path/revision/hash กับ prior baseline revision/hash; candidate เป็น metadata JSON ≤20 MiB และนับรวม whole-workspace peak budget ถ้า candidate/journal verification ล้มเหลวห้ามเริ่มเขียน current
- ถ้า close current สำเร็จแต่อ่านกลับล้มเหลว ห้าม retry เขียน/rotate recovery จาก baseline เก่าทันที ต้องอ่าน current bytes ให้ validate สำเร็จก่อน: ตรง candidate → ยอมรับว่า candidate commit แล้วและ update baseline; ตรง prior → retry ได้เฉพาะ persisted pending candidate bytes ที่ validate/hash ตรง journal (restart ต้องให้ผู้ใช้ยืนยัน safe retry); ต่างทั้งคู่ → conflict/read-only ไม่มี overwrite; อ่านไม่ได้ยัง save-error และคง prior recovery
- Restart ที่ current ตรง prior แต่ pending candidate bytes หาย/เสียต้องรักษา prior ไว้และแจ้งว่า unsaved candidate กู้ไม่ได้ ห้ามสร้าง candidate จาก hash/revision หรืออ้างว่ากู้คืน edits แล้ว; raw/newer edits หลัง persisted candidate อยู่ใน memory เท่านั้น อาจหายเมื่อ browser crash และไม่เป็นส่วนของ recovery guarantee
- การ reconcile candidate ที่ commit แล้วแสดง saved เฉพาะเมื่อ memory revision ล่าสุดตรง candidate; ถ้ามี edits ใหม่ให้ยัง dirty และบันทึกลำดับใหม่จาก reconciled baseline ห้ามทิ้ง edits ใหม่/คืน old candidate เข้า form
- close สำเร็จไม่ได้รับประกัน flush ถึง hardware เมื่อไฟดับ; คำว่า saved หมายถึง browser-verified persisted bytes ไม่ใช่ physical durability guarantee
- exception ใด ๆ → save-error เก็บ latest edits ใน memory พร้อม retry/reselect และ emergency JSON download; emergency JSON ไม่รวมแนบและไม่ควรเรียกว่า full backup
- Navigation guard ครอบคลุมเปลี่ยน taxpayer/year/record/folder, ปิด editor และ app update: ให้ pending write/import จบหรือยกเลิกอย่างปลอดภัยก่อน แล้วแก้ validation+save หรือ explicit discard เท่านั้น ไม่มี silent loss/cross-taxpayer draft carryover Emergency JSON ส่งออก latest valid draft/snapshot ได้แต่ต้องเตือนว่า invalid raw fields ถูกละไว้ ไม่ใช่ full recovery; ไม่เพิ่ม persisted raw-draft format Ordinary reports/full backup ต้องแก้ invalid draft หรือยืนยัน discard ก่อน
- beforeunload เตือน best effort; browser ไม่รับประกัน prompt/async flush เมื่อปิดเครื่อง จึงไม่รับประกันกู้ unsaved edits หลัง process ตาย
- partial attachment import: commit manifest หลัง copied attachment verified เท่านั้น; ไฟล์ค้างไม่ถูก auto-delete แสดง recovery inventory ให้ตรวจ
- Startup หยุด mutation แล้ว dispatch ตาม validated pending-operation kind/stage: pending manifest ต้อง candidate/prior/other reconciliation ด้านบนก่อนเสมอ (current ตรง committed candidate ให้รักษา candidate ไม่เสนอ rollback เป็น default); pending purge ตรวจ current/retained snapshots/bytes ตาม journal stage แล้ว resume เฉพาะขั้นที่ยังปลอดภัย ไม่มี generic pending→prior rollback หาก journal เสีย/ไม่รู้จัก stage ให้ read-only พร้อมแสดง diagnostics; เฉพาะ current เสียหรือ reconcile ไม่ได้จริงจึงเสนอ manual prior recovery หลัง preserve current broken bytes แล้ว ไม่มี silent rollback
- migration ใช้ backup/new empty folder และ explicit consent; ไม่แก้ต้นฉบับ in-place; future schema reject/write-disabled; compatibility policy ทดสอบด้วย fixtures ทุก schema ที่รองรับ

## Single Writer and External Changes

- same-origin/profile: directory-handle `isSameEntry` ใช้ยืนยันแฟ้มเดียวกันในหน้าต่างที่ประสานผ่าน BroadcastChannel; Web Locks ตาม workspace ID เป็น serialization boundary ส่วน handle identity ป้องกัน copied workspace ID ต่างโฟลเดอร์ถูกเข้าใจผิด
- conservative: duplicated ID ที่ยืนยัน identity ไม่ได้ให้ read-only พร้อมคำแนะนำ ไม่ออก ID ใหม่ให้ copied folder โดยเงียบ ๆ
- second window เปิดอ่านอย่างเดียว แสดง writer active; เปลี่ยน writer ได้หลัง lock release และ reload/check revision; lock owner crash ต้องทดสอบ release semantics
- different origin, browser profile, browser, machine และ external editor ไม่อยู่ใน lock scope; revision/hash ก่อนเขียนตรวจ changes ที่เกิดไปแล้ว แต่ **ไม่ใช่ atomic compare-and-swap** มี race ระหว่าง check/write
- ไม่อ้างว่าป้องกัน overwrite จากทุกโปรแกรมได้ Q21 strong guarantee ต้องผ่าน feasibility/limitation acceptance ก่อน implement edit path หาก user ต้องการ guarantee เหนือ browser APIs ต้องกลับไปเลือกสถาปัตยกรรมใหม่ ไม่ลดความปลอดภัยหรือเพิ่ม daemon เอง

## Rules and Summary Invariants

- คำนวณจากปีที่เลือกและ snapshot ที่ pin ไว้เท่านั้น เปลี่ยน version ต้อง consent พร้อม preview changes; การไม่รับ update ยังเก็บ/แก้เอกสารได้
- แสดงแยก evidence totals, user-selected claim totals, reviewed amounts, unknown/unsupported amounts และ warnings ไม่รวมรายได้/withholding เป็น deduction
- ตรวจ shared cap groups, income-dependent thresholds, donation ordering/multipliers และ rounding เฉพาะกฎหมายที่ทำ verified fixtures ได้ ถ้าขาด inputs หรือเงื่อนไขไม่รองรับให้ unknown ไม่คิดเหมือนสิทธิเต็มจำนวน
- ไม่ใช้สูตร generic `min(amount, cap)` กับทุกหมวด; ไม่สร้าง general expression engine; pure typed calculation functions ตาม supported rules groups ที่มี official evidence
- แสดง over-cap warning ไม่แก้ original/claimed amount; ช่องข้อมูล eligibility ทุกช่องมี not-known state และเก็บเฉพาะที่จำเป็น
- ตรวจอัปเดตเมื่อ online/ผู้ใช้กดตรวจ; same-origin static files ไม่มี taxpayer payload; offline บอกวันที่ rules snapshot ล่าสุด ไม่สื่อว่า “ทันกฎหมายปัจจุบัน” หากยังไม่ตรวจ
- Rule snapshots จาก JSON/ZIP เป็น untrusted input แม้ schema ถูกต้องและ hash ตรงกับ inventory ใน archive เดียวกันก็พิสูจน์ได้เพียง integrity ภายในชุด ไม่ authenticate แหล่งหรือความถูกต้องทางกฎหมาย ห้ามเชื่อ `verified`/coverage/source/version ที่ไฟล์นำเข้าระบุเอง
- Runtime ให้ป้าย officially reviewed เฉพาะ version และ content digest ที่ตรง trusted app-shipped static rule catalog ของ build นั้น และผ่าน schema validation; import ไม่มีสิทธิเขียนทับ catalog หรือยกระดับ trust ของกฎ historical snapshots ที่ยังไม่มี catalog match เก็บไว้เพื่อคงหลักฐาน/เวอร์ชันเดิมได้ แต่แสดง unverified/unknown จนตรวจสอบตามกระบวนการ rules review ไม่มี silent substitution
- Source links จาก imported snapshots เป็น untrusted text เช่นกัน clickable official references ต้องมาจาก trusted catalog ที่ content matched เท่านั้น และเป็น canonical HTTPS URL บน exact official-host allowlist ที่ผู้ดูแลตรวจแล้ว ไม่มี credentials/unsafe scheme/host confusion; imported/unmatched citations แสดง plain text ไม่สร้าง href; reject `javascript:`, `data:`, malformed URLs และ deceptive hostnames ไม่ให้ schema/hash ยกระดับสิทธิเปิดลิงก์

## Import, Export and Trust Boundaries

- JSON import ตรวจ UTF-8/schema/version/unique IDs/references/amounts/dates/relative paths/resource limits ก่อนเขียน; JSON metadata-only สร้างรายการ missing attachments และให้ผู้ใช้เลือกไฟล์เพื่อ relink โดย hash ไม่ตาม absolute paths
- ZIP backup จาก saved consistent revision รวม manifest, attachments, pinned rules, trash/recovery inventory และ backup manifest ของ paths/hashes/sizes ถ้าไฟล์หายต้อง report incomplete และไม่ label ว่า complete backup
- Restore ไปโฟลเดอร์ใหม่ที่ว่างเท่านั้น: preflight inventory/limits → bounded decompression → content validation/hash → copy attachments/rules/recovery → manifest สุดท้าย → reopen verification; failure แสดง partial restore ห้ามเปิดเป็น ready
- Reject `..`, absolute/drive/UNC paths, backslash tricks, repeated normalized names, symlinks, nested archives, forbidden media, hash mismatch, too many entries และ oversized decompressed output ตรวจ stream output จริงไม่เชื่อเฉพาะ ZIP headers
- Import limits ต้องผ่าน whole-workspace envelope ด้านบนทั้ง prospective aggregate/count/manifest/recovery/overhead พร้อมตรวจ ZIP input/output จริงไม่เกิน 1 GiB/10,000 entries; ไม่เพิ่ม settings เพื่อเลี่ยง limits ถ้าหลักฐาน feasibility ไม่รองรับให้กลับ PLAN
- Safe text rendering ไม่ inject HTML; PDF preview ใช้ **locally bundled `pdfjs-dist`** รับ ArrayBuffer จาก validated copied file แล้ว render canvas เท่านั้น ไม่ใช้ native `<embed>`/`<object>`/browser PDF plugin และไม่อ้างว่า parent CSP คุม native plugin ได้ dependency นี้จำเป็นเพื่อ enforce no-active-content/no-document-network ใน preview
- PDF.js worker/fonts/cmaps/standard-font assets มาจาก public app bundle/base เดียวกัน precache สำหรับ offline; ไม่มี document-controlled URL fetch; ปิด scripting/eval/XFA, form/action/link/annotation layers, embedded-file launch/download และ remote font/cmap/worker loading ไม่เรียก PDF actions และไม่สร้าง clickable links จาก PDF bytes
- PDF preview render ทีละหนึ่งหน้าที่เลือก จำกัด ≤500 pages, ≤16 million canvas pixels/page และ 10-second parse/render timeout ก่อน cancel/terminate worker/release buffers; limit failure แสดง preview unavailable ไม่ค้างแอป ยังเก็บไฟล์ต้นฉบับได้ภายใน attachment limit ไม่มีการอ้าง absolute parser-memory guarantee ของ browser ต้องพิสูจน์ hostile workload ที่ acceptance; explicit user-initiated download เพื่อเปิด external viewer เป็นทางเลือกแยกและเตือนว่าอยู่นอก app no-network guarantee
- JPEG/PNG preview ต้องอ่าน bounded format headers **ก่อน native decode**: PNG ตรวจ signature/IHDR ที่ครบและถูกโครงสร้าง; JPEG scan marker/length ถึง supported SOF ภายใน header-scan budget 1 MiB โดยไม่อ่านเกินไฟล์ แล้วตรวจ positive integer width/height และผลคูณแบบ checked/BigInt ไม่เกิน **16 million decoded pixels** unknown/unsupported/invalid/truncated/oversized dimensions → preview unavailable และห้ามส่ง bytes ไป decoder ไฟล์ภาพที่ valid แต่เกิน preview-pixel limit ยังเก็บต้นฉบับได้ถ้าผ่าน attachment/workspace limits; malformed attachment ไม่อ้างว่าเป็น valid image
- Active PDF/image preview ได้ครั้งละหนึ่งรายการเท่านั้น; ภาพใช้ first-frame ImageBitmap/canvas ไม่เล่น animation; release canvas/ImageBitmap/ArrayBuffer/object URL และ terminate unused worker เมื่อปิด/สลับ/import; native decode error แสดง safe unavailable โดยไม่เปลี่ยน raw draft/unsaved guard ไม่มี image dependency ใหม่และไม่อ้าง absolute native-decoder memory safety; ต้องทดสอบ compressed image bombs และ peak memory ก่อน release
- CSV quote/escape ถูกต้อง พร้อมป้องกัน cells เริ่ม `=`, `+`, `-`, `@`, tab/CR และ whitespace-prefixed formula ใน text fields; UTF-8 Thai; exports ไม่รับรองเป็น Revenue Department submission format
- Print view แสดง tax year, rules version/review date, สถานะค้าง/unknown และ disclaimer; ไม่รวม taxpayer identifiers เกินที่ผู้ใช้เลือกแสดง
- หน้า workspace มีข้อความเตือนสำรองข้อมูลพร้อมปุ่ม ZIP backup ที่เห็นได้เสมอ และเตือนอีกครั้งก่อน migration/permanent delete; ไม่สำรองเองหรืออัปโหลดไปปลายทางที่ผู้ใช้ไม่ได้เลือก

## Privacy, Offline and UX

- ไม่มี login/analytics/session replay/crash upload/remote fonts/remote document processing; GitHub login เป็นสิทธิผู้ดูแลเผยแพร่เท่านั้น ไม่ใช่ผู้ใช้แอป; public app/assets/rules อยู่บน GitHub Pages/cloud CDN ได้ แต่เอกสาร/JSON/recovery/backup ต้องอยู่บนเครื่องและไม่เข้า Git, published artifacts หรือ Actions logs
- CSP จำกัด scripts/connect/static assets/worker เฉพาะ same-origin build resources, `object-src` เป็น `none` ไม่โหลด native PDF plugin, อนุญาต blob เฉพาะ image preview ที่จำเป็น GitHub Pages ไม่ให้ตั้ง arbitrary response headers จึงใช้ HTML meta CSP เฉพาะ directives ที่รองรับ ไม่อ้างว่า meta รองรับ `frame-ancestors`, HTTP-only reporting directives หรือรับประกัน `X-Frame-Options`; บันทึกข้อจำกัดการป้องกัน framing ใน hosting security review
- Network audit แยก app/rule fetch ที่ยอมรับได้จาก sensitive outbound ที่ห้าม; official source links เปิดเฉพาะผู้ใช้กดด้วย no-referrer/noopener ไม่ใส่ข้อมูลผู้ใช้ใน URL
- Service worker cache เฉพาะ app/rules ไม่มี `data.json`, attachments, ZIP, taxpayer fields หรือ workspace handle; ไม่ copy local files เข้า browser persistence
- Offline-ready indicator หลัง precache complete; cold first visit offline ยังเปิดไม่ได้ต้องแจ้งตรง; unknown/future year rules ไม่ auto-substitute
- Update prompt reload ได้เมื่อ save complete และไม่มี active import/export/write; ถ้า dirty ต้อง save หรือ explicit discard พร้อมคำเตือนก่อน reload ไม่มี forced activation
- ไม่รับประกันตรวจ cloud-synced folder ได้ เตือนครั้งเลือกแฟ้ม/backup ว่า OS sync อาจอัปโหลดเอง; แอปไม่เข้ารหัส ใช้ disk encryption/OS account ตามที่ตกลง
- Desktop Thai UI ใช้ semantic labels, keyboard navigation, focus-visible, focus restore หลัง dialog, non-color-only state และ live region สำหรับ save/errors; contrast WCAG AA และ zoom 200% ใช้งานได้
- Error states ต้องแยก unsupported browser, permission denied, missing drive, invalid JSON, newer schema, missing attachment, rule unavailable, conflict และ partial restore พร้อม safe action ไม่เปิด blank screen

## GitHub Pages Base, Origin and Update Contracts

- Canonical URL รอยืนยันใน execution preflight: project site `https://<OWNER>.github.io/<REPO>/` → `base` เป็น `/<REPO>/`; owner site `https://<OWNER>.github.io/` → `/` ไม่เดา owner/repo จากชื่อโฟลเดอร์
- ใช้ Vite base-aware URLs สำหรับ entry/assets/icons/rules/manifest และ registration ของ service worker; ห้าม hard-code `/rules/` หรือ `/assets/` ที่หลุด project prefix `manifest.id`, `start_url`, `scope` และ SW scope ต้องอยู่ใน canonical base เดียวกัน ใช้ navigation ภายในแอปโดยไม่มี SPA deep-link router จึงไม่ต้องมี `404.html` redirect hack
- Service worker/cache names แยกตาม app/base/build version; precache เฉพาะ allowlisted public build assets/static rules ภายใน base ไม่ intercept/cache workspace files หรือ unrelated project paths; update catalog มาจาก trusted published build ไม่เชื่อ imported metadata และยังต้อง consent ก่อนเปลี่ยน pinned rules ของแฟ้ม
- HTTPS ช่วยให้ secure-context browser APIs ใช้ได้ แต่ permissions/installation/offline state ผูกกับ origin/browser profile และอาจเปลี่ยนตาม browser; เปลี่ยน owner/custom domain หรือ origin ทำให้ต้องติดตั้ง/cache ใหม่และเลือก folder/ให้ permission ใหม่ ข้อมูลใน selected folder เดิมยังคงอยู่ ไม่มี automatic migration/upload
- Project sites ที่ path ต่างกันใต้ `<OWNER>.github.io` **ไม่แยก origin security** อย่า co-host untrusted repos/apps ใต้ owner เดียวกัน เพราะ origin-scoped browser APIs และ script trust ร่วมกัน ต้องยืนยัน trust ของทั้ง origin ก่อน release; repo path ไม่ใช่ sole key ของ workspace lock ใช้ workspace identity และ handle checks ตาม section Single Writer เดิม
- GitHub ระบุว่าบันทึก visitor IP เพื่อ security แม้ไม่ login และ static hosting/CDN อาจมี access logs ของการโหลด public assets ไม่อ้างว่าไม่มี infrastructure logging; app ต้องไม่ส่ง taxpayer fields/filenames/amounts/bytes ผ่าน URL, request body, telemetry หรือ external links แหล่งทางการตรวจ 2026-10-25 อยู่ใน [deployment plan](2026-10-25-no-issue-local-tax-plan.md#github-pages-deployment-plan)
- Offline อาจใช้ build/rules catalog เก่าที่เคย trusted: แสดง version/review date/stale status ไม่อ้างว่าล่าสุดอัตโนมัติ ไม่รวม catalog ใหม่เข้ากับ executable build เก่าโดยไม่ตรวจ compatibility; คง safe unknown เมื่อไม่มี trusted match
- Deploy/rollback ไม่บังคับ active tab reload; ให้ save/discard อย่างชัดเจนเมื่อปลอดภัยก่อน activate update; older static build/SW cache ไม่มีสิทธิ downgrade newer local data schema

## Unresolved Questions

ไม่มี product preference ค้าง; GitHub owner/repo/default branch/visibility/canonical origin เป็น execution setup preflight ส่วน browser locking/commit feasibility, official rule coverage และ actual Pages-origin behavior เป็น evidence gates ตาม primary plan ไม่ใช่ข้อเท็จจริงที่ผ่านการยืนยันแล้ว
