# แผนปรับ UI/UX: เลือกสิทธิยอดคงที่ได้โดยไม่ต้องสร้างรายจ่ายสมมติ

Date: 2026-10-25
Complexity: SIMPLE
Status: PLANNED — no implementation

- วันที่: 25 ตุลาคม 2569 (2026-10-25)
- สถานะ: ⏳ PLANNED — จัดทำแผนเท่านั้น ยังไม่ได้แก้ source, tests, rules หรือเว็บไซต์
- Complexity: SIMPLE — หนึ่ง feature และหนึ่ง execution stream ใช้ระบบเดิม ไม่ใช่ phase program
- Execute anchor: `process/general-plans/active/fixed-allowance-ui-ux_PLAN_25-10-26.md`
- ฐานที่สำรวจ: commit `cb1bf7f`, ชุดกฎ `2569.2-reviewed-2026-10-25`
- ผู้ใช้เป้าหมาย: คนทั่วไปที่ต้องการระบุสิทธิของตนเอง ไม่ต้องเข้าใจว่าระบบเก็บเป็นรายการชนิดใด
- งานหลักของหน้าที่เปลี่ยน: เลือกสิทธิ ระบุจำนวนผู้เข้าเกณฑ์ เห็นยอด และยืนยันให้นำมาคำนวณ โดยไม่ต้องกรอกยอดจ่ายหรือวันที่จ่ายที่ไม่มีอยู่จริง

Quick links: [Overview](#overview) · [Design direction](#design-direction) · [Functional requirements](#functional-requirements) · [Implementation checklist](#implementation-checklist) · [Public contracts](#public-contracts) · [Verification evidence](#verification-evidence) · [Resume and execution handoff](#resume-and-execution-handoff)

## Overview

แยกเส้นทาง “สิทธิยอดคงที่” ออกจาก “จ่ายจริงและแนบเอกสาร” บนหน้าภาพรวมและรายการเดิม ให้เลือกบุตร บิดามารดา คู่สมรส และอุปการะผู้พิการได้ตรงกับความหมายของสิทธิ ยอดคำนวณใช้จำนวนและกฎ snapshot ของปีนั้น ไม่บังคับสร้างชื่อรายการหรือวันที่จ่ายเอง เอกสารเป็นส่วนเพิ่มภายหลัง ไม่ใช่เงื่อนไขว่าต้องแนบก่อนเริ่มใช้แอป

ความหมายของ “เลือกและกำหนดยอด” ในแผนนี้คือ **เลือกสิทธิ/จำนวนผู้เข้าเกณฑ์ แล้วกำหนดยอดผ่านตัวเลือกที่กฎรองรับ** ไม่ใช่แก้วงเงินกฎหมายหรือพิมพ์ยอดลดหย่อนใดก็ได้ ช่องยอดที่ได้เป็นผลคำนวณอ่านอย่างเดียว ถ้าต้องการพิมพ์ “ยอดขอใช้สิทธิ” ต่ำกว่าสิทธิเต็มเอง ต้องยืนยันเป็นขอบเขตเพิ่มเติมก่อน EXECUTE เพราะโมเดลปัจจุบันยังไม่มีความหมายข้อมูลนั้นแยกจากยอดจ่ายจริง

ไม่เปลี่ยนอัตราหรือเพิ่มสิทธิภาษีใหม่ในงานนี้ ตัวเลขใน wireframe เป็นตัวอย่างจาก snapshot ที่มีอยู่ **ไม่ใช่การตรวจข้อกฎหมายรอบใหม่**

## Current behavior and evidence

| จุดปัจจุบัน | หลักฐานจาก source | ผลต่อผู้ใช้ |
|---|---|---|
| ทุกหมวดเข้าแบบกรอกรายจ่ายเดียวกัน | `src/ui/record-editor.tsx:12,18–19,30–32` | ต้องตั้งชื่อ/มีวันที่จ่าย แม้สิทธิตามจำนวนบุคคลไม่ใช่รายจ่าย |
| จำนวนผู้เข้าเกณฑ์ซ่อนใต้รายละเอียด | `src/ui/record-editor.tsx:35–36` | ช่องที่กำหนดยอดสิทธิจริงกลับไม่ปรากฏในขั้นตอนหลัก |
| engine คำนวณสิทธิคงที่อยู่แล้ว | `src/domain/engine.ts:11,43–44,59–78` | ควร reuse ไม่สร้างสูตรใหม่ใน component |
| `formula: fixed` ไม่ได้หมายถึงสิทธิครอบครัวทั้งหมด | `src/domain/model.ts`, `src/domain/rules.ts`, `public/rules/2569.json` | ปัจจุบันมีเฉพาะส่วนตัวเป็น fixed; ครอบครัวอื่นใช้ paid ร่วมกับ logic ตาม ID ห้ามเปลี่ยนสูตรเพียงเพื่อจัดหน้าจอ |
| รายการครอบครัวแสดงยอดจ่าย 0 เป็นจำนวนเด่น | `src/ui/records.tsx`, `src/ui/overview.tsx` | ผู้ใช้เข้าใจผิดว่าไม่มีสิทธิ ทั้งที่ engine นับจากจำนวนคน |
| รายงานยังใช้ยอดจ่ายและวันที่จ่ายกับทุกหมวด | `src/reports/annual-report.tsx`, `src/storage/zip.ts:63–65` | CSV/PDF/ดัชนี ZIP สื่อสารสิทธิคงที่ไม่ตรงกับหน้าจอ |
| สิทธิรอตรวจใช้ยอดจ่ายเป็นฐาน pending | `src/domain/engine.ts:56–57,71` | สิทธิคงที่ที่ amount เป็น 0 อาจดูเหมือนไม่มีอะไรต้องตรวจ |
| โครงสร้างแฟ้ม v1 มี amount/date เสมอ | `src/domain/model.ts`, `src/storage/validation.ts` | ต้องรักษาความเข้ากันได้ ไม่ลบ/เปลี่ยนความหมายข้อมูลเก่าโดยเงียบ ๆ |
| มีการกัน async stale writes แล้ว | `src/use-workspace.ts:41–47` | เส้นทางใหม่ต้องใช้หลักเดียวกัน ไม่ข้ามการตรวจ workspace/year identity |
| มีรูปแบบสำรอง ZIP ก่อนเปลี่ยนข้อมูลสำคัญแล้ว | `src/use-workspace.ts:40` (`applyRules` ดาวน์โหลด `exportZip` ก่อน commit) | conflict review ต้อง reuse รูปแบบนี้ ไม่สร้างกลไกสำรองใหม่ |
| engine นับ duplicate เฉพาะรายการ confirmed แรก และ warning บอกให้ “แก้รายการแรก” | `src/domain/engine.ts:60–63` | ข้อความต้องชี้ไป conflict review ใหม่ แต่ผลคำนวณคงเดิม |

## Goals and success metrics

1. ตั้งค่าบุตรหรือบิดามารดาจากหน้าภาพรวมได้โดยไม่กรอกชื่อรายการ ยอดจ่าย หรือวันที่จ่าย
2. เห็นจำนวนคน × สิทธิต่อคน = ยอดตามจำนวนที่ระบุ ก่อนกดบันทึก และแยกจากยอดที่นำมาคำนวณจริง
3. ใช้สิทธิประเภทเดียวกันหนึ่งชุดต่อปี การแก้ไขไม่เพิ่มรายการซ้ำและไม่ทำเอกสารเดิมหาย
4. ทุกหน้าที่แสดงจำนวนเงินระบุได้ว่าเป็น “จ่ายจริง” หรือ “สิทธิตามเงื่อนไข” ไม่แสดง 0 บาทเป็นยอดสิทธิของรายการที่มีจำนวนผู้เข้าเกณฑ์
5. หน้าหลักยังมีสามเมนูเดิม ไม่เพิ่ม onboarding, backend, dependency, ฟอนต์ หรือ navigation ใหม่

## Phase completion rules

งานย่อยจะไม่เป็น VERIFIED เพียงเพราะเขียน code หรือ build ผ่าน ต้องมี integration proof, ทดลอง flow ด้วยตนเอง, ตรวจข้อมูลที่บันทึกจริง, ทดสอบ failure path และให้ผู้ใช้ตรวจยืนยันหน้าตาที่เปลี่ยน

- ⏳ PLANNED: ยังไม่เริ่ม
- 🔨 CODE DONE: code มีแล้ว ยังไม่ถือว่าผ่าน integration
- 🧪 TESTING: อยู่ระหว่างตรวจ flow/ข้อมูล/failure
- ✅ VERIFIED: หลักฐานผ่านและผู้ใช้ตรวจยืนยันแล้ว
- 🚧 BLOCKED: มีปัญหาที่ยังปิด acceptance ไม่ได้

ทุกขั้นด้านล่างอยู่ในแผนเดียว ไม่ต้องสร้าง umbrella หรือ phase plans เพิ่ม หากต้องเพิ่ม schema/migration หรือสิทธิภาษีใหม่ ให้หยุดกลับมาแก้แผนก่อน

## Design direction

### เปรียบเทียบแนวทางและการตัดสินใจ

| ทางเลือก | ข้อดี | ข้อเสีย | ผลตัดสิน |
|---|---|---|---|
| A: ใช้การ์ดเดิมทุกหมวด แต่เปลี่ยนปุ่มและเพิ่มจำนวนคน | เปลี่ยนน้อย | ยังทำให้สิทธิคงที่เหมือนงบที่ใช้แล้ว/เหลือ และซ่อนความแตกต่างจากรายจ่าย | ไม่เลือก |
| B: แผง “สิทธิของฉันและครอบครัว” แถวจำนวน × ยอด พร้อม composer เฉพาะประเภท | เห็นความหมายทันที เปรียบเทียบสิทธิได้ง่าย ใช้ engine/storage เดิม | ต้องปรับ presentation ต่อเนื่องถึงรายงาน | **เลือก** |

**Signature:** แถวสิทธิที่มีสมการอ่านง่าย “จำนวนผู้เข้าเกณฑ์ × สิทธิต่อคน = ยอดของปีนี้” แทน progress bar สำหรับสิทธิที่ไม่ได้เกิดจากการใช้เงิน เป็นจุดเด่นเพียงจุดเดียว ส่วนเมนู/รายได้/การ์ดประกันและการลงทุนให้คงทิศทางเดิม

**Self-critique ก่อนล็อกแบบ:** การใช้การ์ดสีส้มพร้อม progress ทุกหมวดเป็น dashboard ทั่วไปและแปลสิทธิครอบครัวผิดความหมาย จึงเปลี่ยนเฉพาะสิทธิคงที่เป็นแผงแถว ส่วนอื่นไม่ตกแต่งเพิ่ม ไม่ใช้ hero ใหม่ ตัวเลขใหญ่ซ้ำ หรือ animation เพื่อความสวยอย่างเดียว

### Tokens และ typography

| Token | ค่า | ใช้กับ |
|---|---|---|
| Action orange | `#DF5918` | ปุ่มยืนยัน/รายการที่เลือก/ขอบ focus |
| Ink | `#25313D` | หัวข้อและยอดสิทธิหลัก |
| Secondary ink | `#687986` | คำอธิบาย/หน่วย ไม่ใช้กับข้อความจำเป็นขนาดเล็กจนอ่านยาก |
| Canvas | `#F7F8FA` | พื้นหน้าทำงาน |
| Paper | `#FFFFFF` | แผงสิทธิ/ฟอร์ม |
| Confirmed green | `#24735E` | สถานะผู้ใช้ยืนยันแล้ว โดยต้องมีข้อความ/ไอคอนด้วย |

- Reuse Kanit ที่ bundle อยู่แล้ว ไม่เพิ่ม typeface/dependency ในงานนี้
- Heading: Kanit 500 ขนาด 24–28px; ชื่อแผง 18–20px
- Body/form: Kanit 400 ขนาด 14–16px, line-height 1.65–1.8
- Money/quantity: Kanit 500 พร้อม tabular numerals ขนาด 20–24px; caption ที่จำเป็นไม่ต่ำกว่า 12px
- Spacing 8/12/16/24px, ขอบมน 10–12px ตามระบบเดิม, control/touch target อย่างน้อย 44px
- ไม่ใช้สีอย่างเดียวบอกสถานะ; ปฏิบัติตาม reduced motion; ไม่ทำ animation จำนวนเงินวิ่ง

### Desktop wireframe

```text
ภาพรวม                                        ปี 2569  [เปิดแฟ้ม]
[รายได้/ตัวเลขภาพรวมเดิม]

สิทธิของฉันและครอบครัว                     [เลือก/แก้ไขสิทธิ]
ส่วนตัว       รวมในฐานคำนวณแล้ว                      60,000 บาท
บุตร          2 คน × 30,000                          60,000 บาท [แก้ไข]
  ส่วนเพิ่ม   1 คน × 30,000                          30,000 บาท
บิดามารดา     2 คน × 30,000                          60,000 บาท [แก้ไข]
              รอตรวจสิทธิ 1 รายการ · เอกสารยังไม่มี 2 รายการ

รายการจ่ายจริงและเอกสาร                       [เพิ่มรายการจ่าย]
[ประกัน]          [RMF]          [ดอกเบี้ยบ้าน] ... การ์ดเดิม
```

ตัวเลขในแถวที่ยังไม่ยืนยันต้องมีคำว่า “ยอดตามจำนวนที่ระบุ — ยังไม่นำมาคำนวณ” แทนการแสดงเป็นยอดใช้แล้ว และแสดงยอดที่รวมจริงแยกชัดเจน

### Composer และ mobile wireframe

```text
ตั้งค่าสิทธิบุตร — ปีภาษี 2569                       [ปิด]
บุตรที่เข้าเงื่อนไข                 [-] 2 [+] คน
สิทธิต่อคนจากกฎปีนี้                        30,000 บาท
ยอดตามจำนวนที่ระบุ                          60,000 บาท

บุตรที่เข้าเกณฑ์ส่วนเพิ่ม           [-] 1 [+] คน
[คำอธิบายลำดับบุตร/ปีเกิดและเงื่อนไขสั้น ๆ]
ยอดรวมตามจำนวนที่ระบุ                       90,000 บาท
[ ] ตรวจเงื่อนไขบุตรแล้ว ให้นำสิทธินี้มาคำนวณ
[ ] ตรวจเงื่อนไขส่วนเพิ่มแล้ว ให้นำส่วนเพิ่มมาคำนวณ (เปิดได้เมื่อยืนยันบุตรพื้นฐานแล้ว)
รวมในยอดคำนวณขณะนี้                              0 บาท
[แนบเอกสาร/ดู checklist — ไม่จำเป็นต้องทำตอนนี้]
                                  [ยกเลิก] [บันทึกสิทธิ]
```

บนจอเล็กแต่ละแถวเรียง ชื่อ → จำนวน/สมการ → ยอด/สถานะ → ปุ่มแก้ไข ไม่มีตารางเลื่อนแนวนอน ปุ่มท้าย composer มองเห็นและเข้าถึงด้วย keyboard ได้ error อยู่ติด control ที่ผิด และมี summary อ่านด้วย screen reader

## Scope

### In scope

- ส่วนตัวแบบรวมพื้นฐานแล้ว (อ่านอย่างเดียว), คู่สมรสไม่มีเงินได้, บุตร, บุตรส่วนเพิ่ม, บิดามารดา, ผู้พิการ/ทุพพลภาพที่อุปการะ เฉพาะกฎรายปีที่รองรับ
- ฟอร์มเฉพาะสิทธิ ตัวเลือกจำนวน/ยืนยัน ยอดทันที และเอกสาร optional
- routing เข้าแก้ไขสิทธิจากทุกหน้าที่เกี่ยวข้อง ป้องกัน annual claim ซ้ำ และรองรับข้อมูลเก่าอย่างไม่ทำลาย
- คำเรียก/ยอด/ปีอ้างอิงใน overview, records, prepare, PDF, CSV และดัชนี ZIP
- regression ที่ครอบคลุม storage/privacy/offline/responsive เท่าที่เส้นทางนี้กระทบ

### Out of scope

- เปลี่ยนกฎภาษี/วงเงิน/อัตรา, ตรวจสิทธิรายบุคคลแทนผู้ใช้, เพิ่มมาตรการใหม่, ตีความว่า `family` ทุกหมวดเป็นยอดคงที่
- เปิดสิทธิอายุ/พิการแบบยกเว้นหรือฝากครรภ์ที่ยัง pending เป็นสิทธิคงที่; หมวดเหล่านี้คงเส้นทางเอกสาร/จ่ายจริงตามเดิม
- เพิ่มเลขบัตร วันเกิดเต็ม ทะเบียนบุคคล การตรวจผ่าน server, login/cloud/OCR/analytics
- ช่อง arbitrary claim amount, เปลี่ยน schema, migration/auto-cleanup ข้อมูลเก่า, redesign ทั้งแอป, commit/push/deploy โดยอัตโนมัติ

## Functional requirements

### 1. ประเภทสิทธิและแหล่งยอด

1. เพิ่ม `src/domain/fixed-allowances.ts` เป็นจุดร่วมขนาดเล็กสำหรับจำแนกสิทธิที่รองรับ อ่านอัตราจาก snapshot, ตรวจจำนวน, เลือกรายการที่ engine นับ และสร้าง presentation ยอดคงที่
2. จำแนกด้วยกลุ่ม ID ที่ engine รองรับอยู่จริง พร้อม metadata compatibility: personal เป็น fixed/expense-independent; spouse และรายการตามจำนวนเป็น paid ตามรูปแบบปัจจุบัน ห้ามใช้เพียง group family หรือ cap มีค่ามาตัดสิน
3. Quick claim ต้องเป็น known annual category, taxYear ตรง, verified, cap มีค่าถูกต้อง, ไม่มีสัดส่วนรายได้/เพดานร่วม/สูตรอื่นที่ไม่รองรับ และช่วงสิทธิครอบคลุมทั้งปีภาษีนั้น ถ้าช่วงสิทธิกำกวม/มีผลเฉพาะช่วง ให้แสดงว่าเก็บเอกสารได้แต่ยังใช้ quick claim ไม่ได้
4. ส่วนตัวรวมอัตโนมัติอยู่แล้ว แสดง “รวมในฐานคำนวณแล้ว” ห้ามมีปุ่มเพิ่มซ้ำ/สวิตช์หักซ้ำ ปีที่ personal pending แสดง “กฎปีนี้ยังไม่ยืนยัน” ไม่อ้างว่ารวมยอดแล้ว
5. ย้าย logic จำนวน/เพดาน/ผู้มีส่วนร่วมที่จำเป็นออกจาก engine มาเป็น helper ที่ engine และ presentation เรียกใช้ร่วมกัน **รักษาผลคำนวณเดิม** ไม่เขียนสูตรเงินใน JSX หรือทำ engine คู่ขนาน

### 2. ขั้นตอนเลือกและแก้ไข

1. แผงสิทธิใน overview มีปุ่ม “เลือก/แก้ไขสิทธิ”; แถวที่ยังไม่เคยตั้งค่าเปิด composer โดยไม่สร้าง record ตอนเปิด
2. จำนวนผู้เข้าเกณฑ์อยู่ในฟอร์มหลัก พร้อมคำอธิบายสั้นและ “ดูเงื่อนไขทั้งหมด” จาก snapshot ส่วนแนบไฟล์/checklist ย่ออยู่ด้านล่าง
3. คู่สมรสใช้ตัวเลือกยืนยันเงื่อนไขหนึ่งสิทธิ ไม่กรอกจำนวนผู้รับสิทธิมากกว่าหนึ่ง; จำนวนบุคคลอื่นใช้ integer และขอบเขต engine/schema เดิม (บิดามารดา 0–4, ส่วนเพิ่ม ≤ จำนวนบุตรพื้นฐาน, อื่น ๆ 0–20) โดยอธิบายว่าขอบเขตทางเทคนิคไม่ใช่การรับรองสิทธิทุกกรณี
4. บุตรพื้นฐานและบุตรส่วนเพิ่มอยู่ใน composer เดียวกัน ส่วนเพิ่มต้องไม่มากกว่าจำนวนบุตรพื้นฐานและต้องเข้าเงื่อนไขเพิ่มเติม ผู้ใช้เป็นผู้ยืนยันเงื่อนไข ไม่เปิดส่วนเพิ่มให้ทุกคน; `child` และ `child-additional` เป็นสอง record และมี confirmation แยกกัน ส่วนเพิ่มยืนยันได้เฉพาะเมื่อยืนยันบุตรพื้นฐานใน draft เดียวกันแล้ว
5. ตัวเลือก “ตรวจเงื่อนไขแล้ว ให้นำสิทธินี้มาคำนวณ” เป็น confirmation ที่มองเห็น ไม่ใช่การรับรองโดยแอป ขณะยังไม่เลือกแสดงยอดตามจำนวนที่ระบุได้ แต่ยอดรวมจริงเป็น 0
6. การเปลี่ยนจำนวน/ข้อมูลที่มีผลต่อสิทธิให้ล้าง confirmation ใน draft แล้วให้ยืนยันใหม่ก่อนรวมยอด ไม่ล้างเอกสารที่ยังเกี่ยวข้อง
7. ปิดตัวเลือกนำมาคำนวณ = เปลี่ยน confirmed เป็น unchecked พร้อมคำอธิบาย “ยังไม่ยืนยันให้นำมาคำนวณ” ไม่ใช้ ineligible เพราะการไม่เลือกใช้ไม่ได้แปลว่าไม่เข้าเงื่อนไขกฎหมาย เก็บจำนวน/หลักฐานไว้ทั้งหมด; ineligible ที่ผู้ใช้เคยระบุให้คงเดิมจนผู้ใช้ตรวจยืนยันใหม่อย่างชัดเจน
8. บันทึกปิดสิทธิบุตรพื้นฐานต้องปิดการนำส่วนเพิ่มมาคำนวณใน batch เดียวกัน การลดจำนวนจนส่วนเพิ่มเกินให้แจ้ง error และให้ผู้ใช้แก้เอง ไม่ปรับลดข้อมูลเงียบ ๆ
9. ปุ่ม “ยกเลิก”/Escape ก่อน submit ไม่เปลี่ยน workspace; ขณะอ่านไฟล์/บันทึกปิดและแก้ฟอร์มไม่ได้ตาม guard เดิม
10. ปุ่มเพิ่มรายการทั่วไปต้องให้เลือกชนิด “สิทธิยอดคงที่” หรือ “จ่ายจริง/เอกสาร” ก่อนกรอก หากเลือก fixed ผ่านหมวดเดิมต้อง route ไป composer โดยไม่ทิ้ง draft จ่ายจริงที่แก้อยู่โดยไม่เตือน

### 3. ข้อมูล v1 และ annual upsert

- ไม่เพิ่ม field ใน schema รุ่นนี้ ใช้ TaxRecord/facts.qualifyingCount เดิม
- record ใหม่ของสิทธิคงที่: สร้างชื่อจากชื่อสิทธิ, amount เป็น 0 เพราะไม่ได้บันทึกรายจ่าย, eligibleAmount เป็น null, date เป็นวันที่ 31 ธันวาคมของปีภาษี **เพื่ออ้างอิงสิทธิประจำปีเท่านั้น ไม่ใช่วันที่จ่ายจริง**
- ไม่เปิด composer สำหรับ period-specific entitlement ด้วยวันที่อ้างอิงที่แต่งขึ้น การรับรอง annual window ในข้อ 1 เป็นเงื่อนไขบังคับ
- แก้ record เดิม: ใช้ stable ID เดิม เก็บชื่อ วันที่ amount/eligibleAmount เดิมและไฟล์/หมายเหตุทั้งหมด ไม่ auto-zero หรือ normalize ข้อมูลเก่าเพียงเพราะเปิดฟอร์ม ให้แสดงข้อมูลเดิมไว้ใน “ข้อมูลที่บันทึกเดิม” หากมีค่าจ่ายจริงที่ไม่ใช่ศูนย์
- การแก้ครั้งต่อไปต้อง upsert ไม่ append record ใหม่ต่อ category/year
- การบันทึกบุตรพื้นฐาน/ส่วนเพิ่มและการแก้ duplicate ต้อง atomic ใน memory: เตรียม candidate เดียว ตรวจทุก record/เงื่อนไขแล้ว commit ครั้งเดียว ผ่าน workspace/year identity guard และระบบ folder/ZIP เดิม
- อย่าใช้ eligibleAmount เป็นยอด claim ใหม่ เพราะ schema และความหมายปัจจุบันจำกัดไม่เกิน amount ซึ่งเป็นคนละแนวคิด

### 4. ข้อมูลเก่าซ้ำและไม่ครบ

- พบหลาย record ใน annual category: แสดง conflict review พร้อมชื่อ จำนวน สถานะ ไฟล์ และยอดที่ engine ปัจจุบันนับ ไม่เลือก record แรกเพื่อเขียนทับโดยเงียบ ๆ
- ปิดการบันทึก quick edit จนกว่าผู้ใช้เลือกรายการหลักเอง ดู preview ผลก่อน/หลัง และยืนยันสำรองก่อนแก้ โดยสำรองด้วยรูปแบบเดียวกับ `applyRules` (ดาวน์โหลด `exportZip` ของ workspace ปัจจุบันก่อน commit แล้ว `assertCurrent`) ถ้าสำรองล้มเหลวต้องไม่ commit
- การ resolve เก็บ IDs, amounts, dates, notes และ attachments ของทุก record; เปลี่ยนเฉพาะรายการที่ไม่เลือกเป็น unchecked เพื่อไม่ถูกนับ ไม่ merge/delete/move เอกสารอัตโนมัติ
- หลักฐานของ noncanonical records ยังเปิด/ดาวน์โหลด/ติดตามได้ การแนบหลักฐานเพิ่มให้เลือก record เป้าหมายชัดเจน และไม่สร้างสิทธิซ้ำ
- ไม่มี qualifyingCount หรือข้อมูลเดิมผิดเงื่อนไข: แสดง “โปรดระบุจำนวนและตรวจสิทธิ” ไม่นับเป็น 0 บาทแล้วปล่อยเหมือนไม่มีงานค้าง

### 5. Presentation และรายงาน

- Overview แยกแผงสิทธิคงที่ออกจากการ์ดจ่ายจริง; แถว fixed ไม่แสดง progress “ใช้แล้ว/เหลือ”, ไม่แสดงจ่ายจริงเป็นยอดสิทธิ
- แยก potential amount ตามจำนวนที่ระบุ, actually included amount และจำนวนรายการ/คนที่รอตรวจ โดย pending count ไม่ขึ้นกับ amount ที่อาจเป็น 0
- Records แสดง fixed ว่า “สิทธิปี 2569” แทนวันที่จ่าย, ยอดสิทธิ/รอตรวจ พร้อมปุ่ม “แก้ไขสิทธิ / เพิ่มหลักฐาน”; รายการจริงยังแสดงจำนวนจ่ายและวันที่เดิม
- ห้ามกระจาย category allowed รวมไปทุก legacy duplicate record จนดูเหมือนนับซ้ำ ให้ presentation ระบุ contributor ที่ engine นับ/รายการที่ไม่ถูกนับชัดเจน
- Prepare รักษา checklist เอกสารแยกจาก confirmation, ไม่ตีความว่ายอดตามจำนวนที่ระบุเป็นสิทธิรับรองแล้ว
- CSV คงข้อมูลจ่ายจริงเดิม เพิ่มคอลัมน์ประเภท, ปีสิทธิ, ยอดตามจำนวนที่ระบุ, ยอดสิทธิที่นับจริง และสถานะรอตรวจ ไม่เปลี่ยน column จ่ายจริงให้หมายถึง claim; ค่าอ้างอิง annual date ต้องไม่อยู่ใต้หัวข้อวันที่จ่ายของ fixed
- PDF และ index.html ใน ZIP ใช้ presentation เดียวกัน มีข้อความ “สิทธิประจำปี ไม่ใช่รายจ่าย”/สถานะ และแสดงยอดรวมจาก engine เดิม ไม่แก้สูตรใน report
- คำนวณ engine หนึ่งครั้งต่อปีแล้วส่งผลให้ presentation ไม่เรียก calculate ซ้ำทุกแถว
- การแนบไฟล์ครบไม่ auto-confirm สิทธิ; การ confirm สิทธิไม่ auto-complete checklist

## Data flow

```text
snapshot รายปี + records เดิม
    -> fixed-allowances: ประเภท/compatibility/contributors/ยอดตามจำนวน
    -> แผงสิทธิและ composer (draft เท่านั้น)
    -> ตรวจจำนวน + confirmation + duplicate resolution + file staging
    -> candidate annual records batch + expected workspace/year
    -> use-workspace guard -> commit เดียว
    -> calculate เดิม -> presentation เดียวสำหรับ UI / reports / index
    -> folder write หรือ ZIP dirty/export ตามโหมดเดิม
```

ไม่มี network request สำหรับข้อมูลภาษี ไม่มีการเพิ่ม localStorage/IndexedDB/cache ข้อมูลผู้ใช้ Snapshot ไม่ถูกอัปเดตจากเว็บหรือเปลี่ยนเงียบ ๆ

## Execution brief

| กลุ่มงาน | What happens | Test / verify | Done when |
|---|---|---|---|
| Domain + contracts | จำแนกและ project สิทธิ ใช้สูตรร่วม ไม่เปลี่ยนยอดเดิม | unit fixtures เปรียบเทียบผลก่อน/หลัง รวม pending amount 0 | focused tests ผ่านและตรวจ candidate records ได้ |
| Composer + routing | ตั้งค่าและแก้สิทธิ/duplicate แบบ atomic | เลือกบุตร/บิดามารดา ยกเลิก ปิดสิทธิ แก้ซ้ำ แนบไฟล์ | ไม่มีรายจ่าย/วันที่สมมติให้กรอก ไม่มีสิทธิซ้ำหรือ proof หาย |
| Presentation + proof | overview/records/prepare/reports สื่อความหมายเดียวกัน | roundtrip folder/ZIP, CSV/PDF/index, desktop/mobile/keyboard | automated gates ผ่าน มีภาพ/ไฟล์และผู้ใช้ยืนยันรูปแบบ |

Expected outcome: สิทธิ fixed เลือกได้ตรงความหมาย; รายจ่ายเดิมยังทำงาน; แฟ้ม v1 เปิดได้; กฎ/ยอดที่ยืนยันแล้วเดิมคงผลเดิมจนผู้ใช้แก้; ไม่เผยแพร่โดยไม่มีคำสั่งถัดไป

## Implementation checklist

1. [ ] บันทึก baseline และเพิ่ม fixture สิทธิ fixed ใน `tests/fixed-allowances.test.ts` โดยใช้ snapshot ปัจจุบัน: ส่วนตัว/คู่สมรส/จำนวน/legacy duplicate/pending/date window; ตรวจผลเดิมกับ `tests/engine.test.ts` ก่อน structural edits
2. [ ] สร้าง `src/domain/fixed-allowances.ts` สำหรับ classification, compatible annual rules, count validation, contributors และ potential/included/pending projection; ให้ `src/domain/engine.ts` reuse เฉพาะ logic ที่มีอยู่แทน ID/count logic ซ้ำ; ทดสอบผลคำนวณและภาษีเดิมไม่เปลี่ยน
3. [ ] เพิ่ม pure annual-upsert/batch preparation ใน domain helper และ `saveFixedAllowanceClaims` ใน `src/use-workspace.ts` ที่ใช้ expected workspace/year guard เดิม ตรวจทุก record ด้วย `recordSchema` ก่อน commit และคง invariant เดียวกับ `saveRecord` (เพดาน 5,000 รายการ, เพิ่ม `selectedCategories`, `assertCarrySources`); ทดสอบ stable ID, cancel, duplicate conflict, partial failure และ child+additional atomicity
4. [ ] เพิ่ม `src/ui/fixed-allowance-editor.tsx` ใช้ Modal/file staging/preview เดิม: จำนวนและ confirmation อยู่ส่วนหลัก คำนวณสด และเอกสาร optional; เพิ่ม UI tests ใน `tests/e2e/fixed-allowances.spec.ts` สำหรับไม่มี required paid/date/title, quantity และ acknowledgement
5. [ ] เปลี่ยน routing เฉพาะ entry points ใน `src/App.tsx` และ `src/ui/record-editor.tsx` ให้ known fixed เปิด composer, actual expense เปิด form เดิม; เตือนก่อนทิ้ง draft และป้องกันปิดระหว่าง submit; ทดสอบหมวด pending และการกลับไปจ่ายจริงไม่เปลี่ยนข้อมูล
6. [ ] เพิ่มแผง `src/ui/fixed-allowance-panel.tsx` และผูกใน `src/ui/overview.tsx`: personal readonly, known selectable annual rows, potential/included/pending count; เอาเฉพาะ fixed ออกจาก progress cards เดิม; ทดสอบ unchecked amount 0 ยังแสดงงานรอตรวจ
7. [ ] ปรับ `src/ui/records.tsx`, `src/ui/prepare.tsx`, `src/ui/format.ts` ให้ fixed แสดงปีสิทธิ/ยอดสิทธิ/สถานะแยกเอกสาร และ route edit/attach ไป record เดิม; ทดสอบ contributor/duplicate ไม่แสดงยอดซ้ำ
8. [ ] ใช้ projection ร่วมใน `src/reports/annual-report.tsx` และ `src/storage/zip.ts` ส่วน searchIndex เท่านั้น เพิ่มคอลัมน์ CSV แบบไม่เปลี่ยนความหมายเดิมและระบุ fixed vs paid ใน PDF/index; เพิ่ม assertions ใน unit/report tests และ E2E ว่า fixed claim ไม่กลายเป็น 0 บาทหรือ fake payment date; ให้ `scripts/verify-pdf.mjs` รับ path/ข้อความเป็น optional argument (ค่าเริ่มต้นเดิมไม่เปลี่ยน) และให้ E2E fixed สร้าง `test-results/artifacts/fixed-allowance.pdf`
9. [ ] ทำ legacy conflict review ใน fixed editor พร้อม preview/สำรอง/explicit canonical selection; ไม่เปลี่ยนหลักฐานหรือ record อื่นโดยเงียบ ๆ; ทดสอบเก่าเปิดโดยไม่แก้ไม่เปลี่ยน bytes/IDs และ resolve แล้วนับแค่รายการที่เลือก
10. [ ] เพิ่ม styles เฉพาะแผง/ฟอร์มใหม่ใน `src/styles.css` ตาม tokens/wireframes ไม่ต่อท้าย override ทั่วแอปซ้ำ; ตรวจ 390px/desktop, focus, touch targets, live result และ reduced motion ด้วย browser
11. [ ] เพิ่ม compatibility/roundtrip assertions ใน `tests/storage.test.ts` สำหรับ fixed v1 และไฟล์แนบเดิม/child batch; คง folder transaction/ZIP format/hash/path validation เดิมโดยไม่แก้ adapter หาก tests ไม่ชี้ว่าจำเป็น
12. [ ] รัน focused unit/E2E ตาม Verification Evidence แล้ว full nearest gates: typecheck, unit ทั้งหมด, static build, browser เดิม+ใหม่, Thai PDF; ตรวจ serialized records ว่า claim ไม่ถูกเก็บเป็นยอดจ่าย และยกเลิก/เขียนล้มเหลวไม่รายงานสำเร็จ
13. [ ] อัปเดต README และเอกสาร format/verification เฉพาะความหมาย annual reference และวิธีตั้งค่าสิทธิ เก็บ screenshots/reports ของงานนี้หลังได้รับอนุมัติ implement; ส่งให้ผู้ใช้ตรวจ โดยยังไม่ commit/push/deploy อัตโนมัติ

## Touchpoints

| File/module | การเปลี่ยนที่อนุญาต |
|---|---|
| `src/domain/fixed-allowances.ts` (ใหม่) | ความรู้เรื่อง fixed annual ที่ engine รองรับ, projection และ pure batch prep จุดเดียว |
| `src/domain/engine.ts` | ใช้ helper แทน branch/ID/count ที่เกี่ยวข้องเท่านั้น และปรับถ้อยคำ warning duplicate ให้ชี้ไป conflict review; ไม่เปลี่ยนสูตรอื่น/ผลเดิม |
| `src/domain/model.ts` | **อ่าน/ตรวจ compatibility เท่านั้น** ไม่เพิ่ม field/version ตามแผนนี้ |
| `public/rules/2569.json`, `src/domain/rules.ts` | **ไม่แก้** อัตรา/metadata/เวอร์ชันกฎเพื่อแก้ UI; อ่าน snapshot และใช้ validation เดิม |
| `src/domain/workspace.ts` | อ่านและ regression ว่าปีใหม่ไม่ copy claim; ไม่เปลี่ยน year flow หากไม่จำเป็น |
| `src/use-workspace.ts`, `src/App.tsx` | atomic fixed batch command และ typed editor routing ที่จำเป็น |
| `src/ui/fixed-allowance-editor.tsx`, `fixed-allowance-panel.tsx` (ใหม่) | ฟอร์ม/แผงเฉพาะหน้าที่ ไม่เพิ่ม generic form framework |
| `src/ui/record-editor.tsx`, `overview.tsx`, `records.tsx`, `prepare.tsx`, `format.ts` | entry points และความหมายข้อมูล fixed vs paid |
| `src/ui/primitives.tsx` | reuse ตามเดิม; เปลี่ยนได้เฉพาะ accessibility/props ที่ฟอร์มต้องใช้จริง ไม่ redesign modal ทั้งระบบ |
| `src/styles.css` | selectors ใหม่มีขอบเขต fixed allowance; ไม่เปลี่ยน welcome/sidebar/brand |
| `src/reports/annual-report.tsx`, `src/storage/zip.ts` | presentation/CSV/index เท่านั้น ไม่เปลี่ยน archive parser หรือไฟล์ JSON |
| `src/storage/validation.ts`, `folder.ts`, `documents.ts` | อ่านเพื่อยืนยัน invariant; ไม่แก้ transaction/permission/path/hash logic ในงานนี้ |
| `tests/fixed-allowances.test.ts`, `tests/engine.test.ts`, `tests/storage.test.ts`, `tests/e2e/fixed-allowances.spec.ts` | proof ใหม่และ regression เดิม |
| `README.md`, `docs/storage-format.md`, `docs/verification.md` | หลัง implement จึงอัปเดตวิธีใช้/ความหมายข้อมูล/ผลตรวจจริง |
| `scripts/verify-pdf.mjs`, `tests/e2e/fixed-allowances.spec.ts` | รับ path PDF และข้อความที่ต้องพบเป็น argument แบบ optional โดยค่าเริ่มต้นเดิมไม่เปลี่ยน; E2E ใหม่สร้าง `test-results/artifacts/fixed-allowance.pdf` |
| package/lockfile/workflow/offline script | **ไม่แก้** ไม่มี dependency หรือ hosting change ที่จำเป็น (`@napi-rs/canvas` ที่ verify-pdf ใช้มีใน `node_modules` อยู่แล้วแต่ไม่อยู่ใน `package.json` — ถ้าหายให้หยุดรายงาน ไม่เพิ่ม dependency เอง) |

## Public contracts

1. แฟ้มยังเป็น schema version 1, TaxRecord shape และ stable IDs เดิม; amount คือยอดจ่าย ไม่ใช่ยอดสิทธิคงที่ และ date ที่สร้างให้ fixed คือ annual reference เท่านั้น
2. `calculate` ยังคืนยอดภาษี/สิทธิตาม engine และ snapshot เดิม; ถ้าต้องเสริมข้อมูล pending count ให้เป็น projection ที่ใช้ร่วมกัน ไม่เปลี่ยนความหมาย field pending monetary ของรายจ่ายอื่น
3. `saveFixedAllowanceClaims` เป็น internal command รับ draft batch กับต้นทาง workspace/year ที่คาดไว้ คืน success หลัง commit ผ่าน validation; ไม่เขียนไฟล์เองและไม่ข้าม save state ของ hook
4. ข้อมูลใหม่ไม่ทำให้ browser รุ่นเดิมของแอปอ่าน schema ไม่ได้ แต่ UI รุ่นเก่าอาจยังแสดง amount 0 ของ fixed ตามข้อจำกัดเดิม ไม่ใช้เหตุนี้เป็นเหตุแก้ amount ให้ผิดความหมาย
5. CSV เพิ่มคอลัมน์และแยกความหมายปีสิทธิ/วันที่จ่าย โดยคง headers ข้อมูลจ่ายจริงและสูตร-safe escaping เดิม; JSON ZIP ไม่เปลี่ยน
6. หน้า UI ใช้คำไทยทั่วไป ไม่มี schema/JSON/formula/record type ในขั้นตอนปกติ

## Blast radius

- ผู้ใช้ที่ได้รับผล: ทั้งแฟ้มใหม่และเก่าใน folder/ZIP ที่มีสิทธิคงที่; actual paid workflows ต้องคงเดิม
- Monetary impact ที่ยอมรับ: เฉพาะผู้ใช้เปลี่ยนจำนวน/confirmation/canonical record เองอย่างยืนยันแล้ว ไม่มีการเปิดหน้าแล้วเปลี่ยนยอด
- Persistence impact: รูปแบบไม่เปลี่ยน; candidate commit เป็นครั้งเดียว; autosave, readback, backup, external edit checks และ ZIP dirty warning เดิมต้องยังอยู่
- Report impact: รูปแบบนำเสนอและ CSV columns เปลี่ยน จึงต้องเก็บตัวอย่างก่อน/หลังและตรวจไฟล์จริง
- ไม่มี backend, remote API, deploy หรือ repository visibility change

## Acceptance criteria

1. เลือกบุตร/บิดามารดาและกำหนดจำนวนจากฟอร์มหลักได้โดยไม่กรอกยอดจ่าย ชื่อหรือวันที่จ่ายเอง เห็นยอดจาก snapshot ทันที และเปลี่ยนกฎกฎหมายจาก UI ไม่ได้
2. ส่วนตัวถูกนับครั้งเดียวตาม engine เดิม คู่สมรสหนึ่งชุดต่อปี ส่วนเพิ่มบุตรถูกผูกกับจำนวนหลักและไม่เกินเงื่อนไขที่รองรับ
3. ยังไม่ confirm = ไม่รวมภาษี แม้ potential amount เป็นบวกและ amount เป็น 0; overview/records/exports แสดงรอตรวจได้ ไม่ซ่อนเพราะ pending money เป็น 0
4. confirm สิทธิที่ verified และข้อมูลครบเพิ่มยอดตาม engine; pending/expired/unknown/period-specific ไม่สามารถใช้ quick claim ข้ามกฎได้
5. แก้ซ้ำใช้ ID เดิมและไม่เพิ่มจำนวน records; บุตรสองประเภทเปลี่ยนใน commit เดียว; cancel/async stale callback ไม่แก้ข้อมูลปัจจุบัน
6. เปิด legacy โดยไม่กดบันทึกไม่เปลี่ยนข้อมูล; duplicate ไม่ถูก merge/delete/เลือกหลักเอง; explicit resolve เก็บทุก ID/ไฟล์ และนับตามที่ผู้ใช้ยืนยันเท่านั้น
7. ปิดการนำมาคำนวณเก็บหลักฐานไว้และไม่ตีความว่าไม่มีสิทธิตามกฎหมาย; เพิ่มปีใหม่ไม่คัดลอกรายได้/จำนวนที่ใช้สิทธิ/confirmation จากปีเก่า
8. สถานะเอกสารกับสิทธิแยกกัน แนบเพิ่มไม่เพิ่มสิทธิซ้ำ และ complete checklist ไม่ auto-confirm สิทธิ
9. Folder/ZIP roundtrip เก็บจำนวน สถานะ IDs และเอกสารครบ; failure ไม่แสดง saved; actual expense/retirement/donation/simulation/privacy/offline regressions เดิมผ่าน
10. PDF/CSV/index แยกสิทธิคงที่จากยอดจ่ายจริงและไม่อ้าง annual reference เป็นวันที่จ่าย; mobile 390px และ keyboard/screen reader ใช้ flow หลักได้โดยไม่ต้องเปิด details เพื่อหาจำนวนคน

## Dependencies, risks and rollback

| ความเสี่ยง | วิธีป้องกัน/rollback |
|---|---|
| เข้าใจ “กำหนดยอด” ว่าพิมพ์จำนวนสิทธิอะไรก็ได้ | ต้องยืนยัน assumption ของแผนก่อน execute; หากต้องการ manual claim amount ให้แก้แผน/โมเดลและทบทวน compatibility ก่อน ไม่แอบใช้ eligibleAmount แทน |
| ทำให้หมวด family ทั้งหมดเป็น fixed | ใช้ known ID + annual metadata compatibility ไม่จำแนกจาก group |
| UI ซ้ำสูตรจาก engine | shared domain projection/contributor calculation และ fixture เปรียบเทียบผลเดิม |
| legacy duplicate/ไฟล์หาย | ไม่มี auto-normalize; explicit review, backup, atomic update และรักษา IDs/proofs |
| ปิดสิทธิแล้วแปลว่าไม่เข้าเกณฑ์กฎหมาย | switch คือ confirmation นำมาคำนวณ; OFF ใช้ unchecked ไม่บังคับ ineligible |
| annual reference ทำให้ผ่านช่วงสิทธิที่ไม่จริง | เปิด composer เฉพาะ annual-compatible rules; ambiguous period ไม่รวม quick claim |
| async save เขียนผิดปี/แฟ้ม | expected identity guard และ disabled submit/close ระหว่างทำงาน |
| เปลี่ยน UI แล้ว report ยังอ้างยอดจ่าย 0 | report/CSV/index อยู่ใน scope เดียวกันและมี file-level assertions |

ไม่ต้องติดตั้ง dependency ใหม่ ไม่มี migration ข้อมูล หลัง implement ให้สำรองแฟ้มทดสอบก่อนใช้งานจริง หากถอย code กลับรุ่นก่อน ไฟล์ v1 ยังเปิดได้และ records/proofs ไม่สูญหาย ข้อจำกัด UI รุ่นก่อนอาจยังแสดง fixed amount เป็น 0 ให้แจ้งผู้ใช้ ไม่แก้ข้อมูลจริงเพื่อกลบ UI เก่า

## Verification strategy

### Automated stages ที่จะรันใน EXECUTE

| Test file / command | Proof ที่ต้องได้ |
|---|---|
| `npm test -- tests/fixed-allowances.test.ts tests/engine.test.ts` | classification/window/count/potential/included/pending/contributor/upsert/cancel/duplicate; engine ผลเดิม |
| `npm test -- tests/storage.test.ts` | v1 roundtrip, IDs/docs preserved, fixed annual reference validation, batch/failure safety |
| `npm run test:e2e -- tests/e2e/fixed-allowances.spec.ts` | primary flow, legacy resolve, confirmation, doc status, year boundaries, cancellation และ responsive |
| `npm run typecheck` | ทุก touchpoint compile แบบ strict |
| `npm test` | nearest full unit/integration gate เดิมและใหม่ผ่าน |
| `npm run build` | static/offline bundle สำเร็จ ไม่มี new network dependency |
| `npm run test:e2e` | actual paid/privacy/offline browser flows เดิมไม่ถดถอย รวม flow fixed ใหม่ |
| `node scripts/verify-pdf.mjs` | PDF ตัวอย่างเดิม (`annual-thai.pdf` ที่ `tests/e2e/app.spec.ts` สร้าง) ยังผ่าน; ต้องรันหลัง `npm run test:e2e` |
| `node scripts/verify-pdf.mjs test-results/artifacts/fixed-allowance.pdf สิทธิประจำปี บุตร` | PDF ภาษาไทยจาก flow fixed มีข้อความสิทธิคงที่จริง (sample เดิมไม่มี fixed claim จึงพิสูจน์ข้อนี้ไม่ได้) |

E2E ใหม่ต้องสร้างอย่างน้อย: (ก) บุตร/ส่วนเพิ่ม (ข) บิดามารดารอ confirm amount 0 (ค) แก้ซ้ำ/ปิดไม่ลบ proof (ง) legacy duplicates explicit resolve (จ) ZIP/folder reopen (ฉ) pending/future year/period mismatch (ช) CSV/PDF/index แยก fixed vs paid (ซ) keyboard/mobile และ cancel ระหว่าง async

### Manual/data verification

- เปิด composer ผ่าน overview, รายการ และหน้าเตรียมยื่น กรอกจำนวนและสังเกตยอด/confirmation/สถานะเอกสารทุกทาง
- ใช้ fixture สมมติเท่านั้น ตรวจ records.json ก่อน/หลัง: IDs เดิม, จำนวน, eligibility, วันที่อ้างอิง, amount 0 เฉพาะ fixed ใหม่, legacy values ไม่หาย และไม่มียอดจำลองปะปน
- บันทึก folder แล้วปิด/เปิดใหม่; ส่งออก ZIP เปิดใหม่; ตรวจ checksum เอกสาร; ถอนสิทธิ write แล้วตรวจไม่แสดงบันทึกแล้ว
- ตรวจ desktop 1440px และ mobile 390px, focus/labels/live region/reduced motion; ถ่ายภาพแผงและ composer ให้ผู้ใช้ตรวจยืนยันก่อนถือ VERIFIED
- ตรวจ actual expense editor ว่ายัง required payment fields ตามเดิม และสูตรก้าวหน้า/เพดานร่วม/ภาษีหลังสิทธิเท่า baseline เมื่อ facts/confirmation ไม่เปลี่ยน

## Verification evidence

- ใน PLAN รอบนี้ตรวจ source/กฎ snapshot/โครงสร้างข้อมูลและ test cases ที่เกี่ยวข้องเท่านั้น **ไม่ได้รัน tests/build หรือปรับเว็บไซต์**
- Context routing: ไม่มี `process/context/all-context.md` หรือ `process/context/tests/all-tests.md` ใน checkout จึงใช้ source/test files ที่ระบุเป็นหลักฐานโดยตรง Post-Phase Testing และ User Confirmation ต้องเกิดใน EXECUTE ตามแผนนี้
- Naming: เปลี่ยนชื่อเป็น `fixed-allowance-ui-ux_PLAN_25-10-26.md` ตาม `plan-lifecycle.md` (`[feature]_PLAN_[dd-mm-yy].md`) และ validator; execute anchor ด้านบนอัปเดตแล้ว
- Baseline ที่รันซ้ำวันที่ 2026-10-25 ระหว่างทบทวนแผน: `npx vitest run` ผ่าน 118 tests (engine 68 + storage 50) ที่ commit `cb1bf7f`; Chromium 7 flows ใน `tests/e2e/app.spec.ts` เป็นผลจากรอบก่อน ยังไม่ได้รันซ้ำ ทั้งหมดไม่ใช่ผลทดสอบ feature นี้
- หลัง implement บันทึกคำสั่ง/ผลจริง, source diff, before/after serialized fixtures, screenshots และ PDF/CSV/ZIP ที่เป็นข้อมูลสมมติ ไม่ใส่ข้อมูลผู้ใช้จริงใน repository
- Plan validator: ไม่มีใน checkout จึงใช้ shared path `node ~/.claude-x/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs --strict process/general-plans/active/fixed-allowance-ui-ux_PLAN_25-10-26.md`; ไม่มี agent-surface changes จึงไม่เกี่ยวกับ validate-agent-parity

## Resume and execution handoff

1. Execute ได้ต่อเมื่อผู้ใช้ตรวจแผนและอนุมัติ โดยส่ง exact execute anchor ด้านบน ห้ามเลือกแผนจากไฟล์รอบข้างเอง
2. ก่อนแก้ source ตรวจ git status และอ่าน model/engine/rules/editor/hook อีกรอบ หาก code เปลี่ยนจากฐานที่สำรวจให้ทบทวนผลต่อแผนก่อน
3. ลำดับงาน: domain invariant → atomic command → composer/routing → presentation/report → compatibility/browser proof → user visual confirmation
4. ขอบเขตสำคัญที่ห้ามเปลี่ยนเอง: fixed amount ไม่ใช่ actual paid, ไม่แก้กฎหมาย, schema v1 ไม่เปลี่ยน, legacy ไม่ถูกจัดระเบียบอัตโนมัติ, ไม่เลือก duplicate หลักเอง, ไม่มี deployment ในแผนนี้
5. เมื่อคำถามเรื่อง manual claim amount เปลี่ยนคำตอบ หรือจำเป็นต้องเพิ่ม schema ให้หยุดก่อน implementation ส่วนนั้นและกลับมาแก้แผนให้ผู้ใช้อนุมัติ

## Cursor and RIPER-5 guidance

นำ Implementation checklist ไปใช้ใน Cursor Plan mode ได้ งานยังอยู่ PLAN เท่านั้น ไม่ auto-transition หลังอ่านเอกสาร หากพร้อมให้ผู้ใช้สั่ง **ENTER EXECUTE MODE** พร้อมชื่อแผนนี้ แล้วดำเนินตามลำดับและเก็บ proof ก่อนถือว่าจบ

## Unresolved questions / approval assumptions

1. แผนเสนอให้ “กำหนดยอด” ผ่านการเลือกสิทธิ/จำนวนและยอดตามกฎที่คำนวณให้ ไม่เปิดช่องพิมพ์ claim amount อิสระ — โปรดยืนยันเมื่ออนุมัติแผน หากต้องการพิมพ์ยอดขอใช้สิทธิเองจะต้องขยายแบบข้อมูล/validation อย่างชัดเจนก่อน implement
2. ไม่มี blocker ด้านเทคนิคที่ต้องเปลี่ยน dependency/schema ตามขอบเขตที่เสนอ ข้อกฎหมายและ pending rules ไม่ได้ถูกตรวจรับรองเพิ่มในงานวางแผนนี้
