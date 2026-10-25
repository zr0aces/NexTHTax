# แผนปรับ NexTHTax เป็นระบบรวบรวมเอกสารภาษีแบบเลือกหมวดก่อน

วันที่: 25 Oct 2026 · สถานะ: **ดำเนินการตามแผนแล้ว — automated checks ผ่าน; native browser/Thai-font signoff ยังเป็นงานตรวจด้วยคน**

## 1. เป้าหมายและข้อตกลง

งานหลักคือ **รวบรวมเอกสารเตรียมยื่นลดหย่อนภาษีตามปีและหมวด** ไม่ใช่เริ่มต้นจากเครื่องคำนวณ ผู้ใช้ต้องเห็นหมวด เลือกดู และเพิ่มเอกสารได้ทันที แม้ยังไม่มีไฟล์แนบ

ขอบเขตนี้เปลี่ยนลำดับความสำคัญของหน้าแรกจากแผนคำนวณเดิม แต่ไม่ยกเลิกมาตรการรักษาข้อมูล ความเป็นส่วนตัว การสำรอง หรือเงื่อนไขยืนยันกฎภาษี

- หน้าแรกหลังสร้างหรือเปิดโฟลเดอร์เป็น **เอกสาร** ทุกเวอร์ชันข้อมูล เครื่องคำนวณ/วางแผนคงเป็นส่วนรองที่เปิดได้จากเมนูเดิม
- แสดงครบทั้ง 15 หมวดเดิม รวมหมวดที่ไม่มีเอกสาร แบ่งหัวข้อค่าลดหย่อน/บริจาคให้เด่น และรายได้/หัก ณ ที่จ่าย/อื่น ๆ เป็นหลักฐานประกอบในหน้าเดียวกัน ไม่ซ่อนหมวดไว้หลัง dropdown หรือ disclosure
- แสดงประเภทกองทุนและประกันเป็นตัวเลือกตรงในกลุ่มของมัน รวมประเภทที่ยังมีเอกสารเป็นศูนย์
- เลือกหมวด = กรองรายการเท่านั้น ไม่สร้างข้อมูล; ปุ่ม **เพิ่มเอกสารในหมวดนี้** จึงสร้างรายการพร้อมหมวด/ประเภทย่อยที่เลือก
- เพิ่มรายการ `waiting-document` ได้โดยไม่แนบไฟล์ ยอดที่ยังไม่ทราบเป็น `null` ไม่ใช่ศูนย์
- ยอดหลักบนหน้าหมวดคือ **ยอดตามหลักฐานที่บันทึก** ไม่ใช่ยอดลดหย่อนตามกฎหมาย ยอดที่เลือกใช้สิทธิแสดงแยกภายในหมวด
- ข้อมูลเดิมไม่ถูกจัดประเภทใหม่เอง และยังเปิดแก้ไขในรูปแบบเดิมได้ ไม่บังคับย้ายข้อมูลเพียงเพื่อเปิดดู

## 2. ข้อเท็จจริงจากโค้ดปัจจุบัน

ตรวจที่ HEAD `4a02a4f` ณ เริ่มวางแผน; working tree สะอาด ให้ตรวจสถานะใหม่ก่อนลงมือจริง

| จุดรับผิดชอบ | พฤติกรรมที่มีอยู่ / สิ่งที่ต้องต่อยอด |
|---|---|
| `src/domain/documents.ts` | หมวดหลัก 15 หมวด; ประเภทย่อยเดิม 7 ประเภท; ตรวจ parent/subtype และทำให้ต้องตรวจทานใหม่เมื่อแก้ข้อมูลสำคัญ |
| `src/ui/DocumentList.tsx` | ค้นหา กรองหมวด/ประเภทย่อย/สถานะ ถังขยะ; ตัวกรองหมวดอยู่ใน local state และเพิ่มรายการยังไม่รับหมวด |
| `src/App.tsx` | เริ่มที่ worksheet เป็นหลัก; `addRecord` สร้าง `other`/`null`; มี dirty guard, mutation queue, year selector และการเปิดโฟลเดอร์เก่าแบบ compatibility |
| `src/ui/DocumentEditor.tsx` | แก้ไข/บันทึกอัตโนมัติ แนบไฟล์ ตรวจข้อมูล และไม่ให้สถานะ reviewed ถูกยืนยันโดยไม่มีหลักฐานหรือการยืนยันที่จำเป็น |
| `src/domain/summary.ts` | ยอด evidence/claimed/reviewed/withheld แยกกัน; ตัด trash/excluded ออกจากยอด; ใช้ integer satang และตรวจ overflow; มีการแบ่งยอดกองทุน/ประกันแล้ว |
| `src/domain/schema.ts`, `src/domain/taxInputs.ts` | current schema 3; enum ประเภทย่อยใช้ร่วมใน record, worksheet และ scenario; v2 validator ยังอ้าง enum ร่วม จึงห้ามขยาย enum อย่างเดียวแล้วเขียนรหัสใหม่ลง schema เดิม |
| `src/storage/manifest.ts`, `src/storage/workspace.ts` | แปลงโครงสร้างเก่าเฉพาะในหน่วยความจำ และเขียนคืนตาม `storageSchemaVersion`; ปฏิเสธข้อมูลใหม่ที่รูปแบบเดิมเก็บไม่ได้ก่อนเขียน |
| `src/storage/migration.ts`, `src/transfer/{json,zip,csv}.ts` | มี explicit copy upgrade, inventory/hash/lock/capacity checks, import confirmation reset และ CSV ประเภทย่อยให้ใช้ต่อ |

นำพฤติกรรมเดิมกลับมาใช้ ไม่เพิ่ม dependency, ระบบกรองชุดที่สอง หรือชั้นจัดเก็บใหม่

## 3. หมวดและประเภทกองทุน

คง **รหัสหมวดหลักทั้ง 15 รหัส** และประเภทย่อยเดิมทั้งหมด เปลี่ยนชื่อแสดงผลหมวดกองทุนเป็นคำกลาง เช่น “กองทุนและเงินออมเพื่อเกษียณ” โดยไม่เปลี่ยน `deduction_retirement`

| ประเภทในกลุ่มกองทุน | รหัสจัดเก็บ | การเปลี่ยนแปลง |
|---|---|---|
| RMF | `fund_rmf` | คงเดิม |
| ThaiESG | `fund_thai_esg` | คงเดิม |
| ThaiESGX | `fund_thai_esgx` | เพิ่ม |
| SSF | `fund_ssf` | เพิ่ม |
| LTF | `fund_ltf` | เพิ่ม |
| กองทุนสำรองเลี้ยงชีพ (PVD) | `fund_provident` | เพิ่ม |
| กบข. | `fund_gpf` | เพิ่ม |
| กอช. | `fund_nsf` | เพิ่ม |
| กองทุนอื่น ๆ | `fund_other` | คงเดิม ไม่ใช้แทน “ยังไม่ทราบประเภท” |

ทุกประเภทอยู่ใต้ `deduction_retirement` เดียวกัน ประกันคง 4 ประเภทเดิม: ชีวิต บำนาญ สุขภาพ และอื่น ๆ รวมประเภทย่อยใหม่ทั้งระบบเป็น **13 ประเภท**

ชื่อเหล่านี้เป็น **การจัดเอกสาร** ไม่ใช่ตารางสิทธิลดหย่อน แสดงข้อความกำกับว่าเงื่อนไขขึ้นกับปีและข้อเท็จจริงของผู้ใช้ ไม่ติดป้าย “ใช้สิทธิได้ปีนี้” หรือกำหนดวงเงิน/วันสิ้นสุดจากชื่อประเภท ประเภทเก่าต้องยังเก็บและเปิดเอกสารย้อนหลังได้

`subcategory: null` ใต้กองทุน/ประกัน แสดงเป็น **รอจัดประเภท** แยกจาก `fund_other`/`insurance_other` อย่างชัดเจน ไม่เดาจากชื่อรายการ ผู้ออกเอกสาร หรือไฟล์แนบ ส่วน `other` ยังคงเป็นหมวดหลักสำหรับเอกสารรอจำแนกทั่วไป

## 4. การใช้งานและเจ้าของ state

### หน้าหลัก

ลำดับหน้า: เลือกปี → ตัวเลือกหมวด/ประเภทย่อยพร้อมยอด → รายการที่กรองและปุ่มเพิ่ม → ตัวแก้ไขรายการที่เลือก รายงานยาวยังเปิดเพิ่มได้ตามเดิม ไม่สร้าง dashboard หรือ wizard อีกชุด

- เพิ่ม `src/ui/DocumentCategories.tsx` เป็นส่วนแสดงหมวดและ metrics รับข้อมูล/selection/callback จากเจ้าของ state ไม่โหลดหรือบันทึกไฟล์เอง
- ให้ `App` เป็นเจ้าของ category/subcategory selection ที่ใช้ร่วมกันระหว่างตัวเลือกหมวด รายการ และการสร้างเอกสาร ย้ายตัวกรองหมวดออกจาก local state ของ `DocumentList` หรือทำ controlled อย่างแท้จริง ห้ามมีตัวกรองสองชุดที่ขัดกัน
- แยกความหมาย “ทั้งหมดในหมวด”, “ประเภทย่อยหนึ่งประเภท” และ “รอจัดประเภท (null)” ให้ชัดในชนิดข้อมูล; ตัวเลือกทั้งหมดต้องไม่เท่ากับ null ของ record
- ค้นหา สถานะ และถังขยะยังใช้ความสามารถเดิม การเปลี่ยนหมวดต้องล้าง query/status ที่ทำให้หมวดใหม่ดูว่าง พร้อมกลับมุมมองรายการปกติ เพื่อให้กดแล้วเห็นเนื้อหาในหมวดจริง
- เมื่อเปลี่ยนปีหรือโฟลเดอร์ให้ reset selection/filter ที่ค้างจากบริบทเดิม และเลือกปีที่มีข้อมูลจริงก่อนปีที่มีเพียงการตั้งค่าว่าง การเปิดข้อมูลเดิมยังเข้าถึงรายการพร้อมแก้ไขได้
- หากเปลี่ยนหมวดแล้วรายการใน editor ไม่อยู่ในหมวดใหม่ ให้ใช้ dirty guard เดิมก่อนเคลียร์ editor; ยกเลิกการเปลี่ยนต้องคงทั้ง draft และ selection เดิม

### เพิ่มเอกสารจากหมวด

ปรับ `App.addRecord` และ `DocumentList.onAdd` ให้รับ parent/subtype ที่ผ่านการตรวจ ไม่สร้าง `other` แล้วให้ผู้ใช้เปลี่ยนซ้ำ

- กด parent รวม → parent นั้น + subtype null; กด subtype → parent และ subtype ตรงกัน; กดรอจัดประเภท → parent + null
- มีปุ่มเพิ่มทั่วไปสำหรับมุมมองทั้งหมดได้ โดยใช้หมวด `other` ชัดเจน ไม่บังคับเลือกประเภทโดยเดาให้
- สร้างเพียงครั้งเดียวหลังผู้ใช้กดเพิ่ม: ปีที่เลือก, ชื่อเริ่มต้นแก้ได้, `waiting-document`, ไม่มีไฟล์แนบ และยอดทั้งสามเป็น null
- หลัง commit สำเร็จ เปิด editor ของรายการใหม่ และคง filter ที่ทำให้มองเห็นรายการนั้น การ commit ล้มเหลวต้องไม่แสดงรายการเสมือนบันทึกแล้ว
- ไม่เปิด upload dialog อัตโนมัติ ไม่สร้างรายการจากการเลือกดูหมวด ปุ่มเพิ่มปิดเมื่อ busy/read-only/conflict; การเปิดดูหมวดยังทำได้
- การแก้หมวด/ประเภทย่อยของเอกสารเดิมใช้ `invalidatesReview` เดิม ไม่เพิ่มสถานะที่สื่อถึงการรับรองสิทธิ

### ยอดและจำนวนบนหมวด

ขยายส่วนคำนวณสรุปใน `src/domain/summary.ts` เท่าที่ต้องใช้ โดย reuse `sumSatang` และ semantics ของสถานะ/ถังขยะ ไม่คำนวณยอดเงินใน component

- จำนวนเอกสาร = รายการที่ไม่อยู่ในถังขยะของปีและขอบเขตที่เลือก รวม excluded เพื่อให้ตรงกับเอกสารที่เปิดดูได้
- ยอดตามหลักฐาน, จำนวนรอเอกสาร, จำนวนรอตรวจ และจำนวนยอดยังไม่ทราบ = เฉพาะรายการที่ไม่ใช่ trash/excluded ตามนโยบายสรุปเดิม ระบุการไม่นับ excluded ไว้ใกล้สรุป และให้ดูจำนวน excluded ในหมวดได้
- “ยังไม่ทราบยอด” ต้องนับจาก `evidenceAmountSatang === null` ไม่ใช้ `unknownClaimCount` ที่นับอีกฟิลด์หนึ่ง
- หมวดไม่มีเอกสารแสดง 0 รายการและ “ยังไม่มีเอกสาร”; มีเอกสารแต่ทุกยอดว่างแสดง “ยังไม่ระบุยอด”; explicit 0 แสดง 0.00 ได้
- มีบางยอดแล้วให้แสดง “ยอดที่ระบุ … บาท” พร้อมจำนวนรายการที่ยอดยังไม่ครบ ไม่เรียกว่า “ยอดรวมครบแล้ว”
- เมื่อยอด evidence overflow ให้แสดงว่ายังรวมอย่างแม่นยำไม่ได้ ไม่แสดง 0 และยังแสดงจำนวนเอกสารได้ ยอด claimed ที่ overflow ต้องไม่ทำให้จำนวนหรือยอด evidence ที่ถูกต้องหายไปโดยไม่จำเป็น
- Parent คือยอดรวมของ partitions ของมัน ไม่บวก parent ซ้ำกับ child; เอกสารที่ใช้ไฟล์แนบร่วมกันยังเป็นคนละ record ไม่ deduplicate ยอดเอง
- ยอดที่เลือกใช้สิทธิ/ตรวจทานแล้ว/หัก ณ ที่จ่ายอยู่แยกภายในหมวดหรือรายงานเดิม ไม่มีการย้ายเข้า worksheet หรือแผนภาษีอัตโนมัติ

## 5. ความเข้ากันได้และข้อมูลเดิม

### เหตุผลที่ต้องมี schema 4 สำหรับรหัสใหม่

แอปเก่าตรวจ enum แบบ strict การใส่ 6 รหัสใหม่ลงไฟล์ schema 2/3 จะทำให้แอปเก่าเปิดไม่ผ่านโดยที่เวอร์ชันไม่ได้บอกว่าใหม่กว่า จึงใช้ **schema 4 เฉพาะสำหรับรูปแบบที่รองรับประเภทย่อยเพิ่ม** ไม่ใช้ notes/title ซ่อนรหัสหรือเปลี่ยน `fund_other` ให้เป็น SSF โดยอัตโนมัติ

1. Freeze validator schema 2 และ 3 ให้รองรับ 7 IDs เดิมจริง ทั้ง record, `taxInputs.deductions` และ `taxScenario.contributions` รวมถึงขีดจำกัดจำนวน contribution เดิม การ freeze เฉพาะ record ไม่เพียงพอ เพราะ schema เก่ายังอ้าง enum ร่วมในอีกสองตำแหน่ง
2. เพิ่ม current schema 4 พร้อม 13 IDs โดยคงโครงสร้าง/validation ของ field อื่นเดิม; เพิ่ม exact-version decoder 1/2/3/4 และ unknown-newer refusal
3. ขยาย `PriorManifest`/`StoredManifest`, `editableManifest`, `manifestForStorage` และ copy upgrade ให้รองรับ schema 3 เดิม โดย **ห้ามเข้า fallback ของ schema 1 แล้วล้าง worksheet/scenario/plan**
4. เปิดโฟลเดอร์ 1/2/3 โดย normalize เฉพาะในหน่วยความจำ ไม่เพิ่ม revision/เขียน data.json ตอนเปิด; เมื่อแก้ข้อมูลที่เดิมรองรับให้เขียนคืนรูปแบบเดิม
5. ช่วงเขียนคืนต้องตรวจ representability กับ frozen schema ของเวอร์ชันนั้นก่อน writes ใด ๆ รหัสใหม่ใน record/worksheet/scenario ต้องปฏิเสธอย่างมีคำอธิบาย ไม่ truncate/drop/fallback

### ความสามารถขึ้นกับคุณสมบัติ ไม่ใช่เท่ากับเวอร์ชันล่าสุด

| รูปแบบที่เปิด | หมวดหลัก/เอกสาร | 7 ประเภทย่อยเดิม + worksheet/scenarios | แผนสุขภาพเดิม | 6 ประเภทกองทุนใหม่ |
|---|---|---|---|---|
| 1 | ใช้/แก้ไขได้ | ต้องเลือกสร้างสำเนา | ต้องเลือกสร้างสำเนา | ต้องเลือกสร้างสำเนา |
| 2 | ใช้/แก้ไขได้ | ใช้/แก้ไขส่วนที่ UI รองรับ คงข้อมูลส่วนอื่น | ต้องเลือกสร้างสำเนา | ต้องเลือกสร้างสำเนา |
| 3 | ใช้/แก้ไขได้ | ใช้/แก้ไขส่วนที่ UI รองรับ คงข้อมูลส่วนอื่น | ต้องยังใช้ได้ตามเดิม | ต้องเลือกสร้างสำเนา |
| 4 | ใช้/แก้ไขได้ | ใช้ได้ตามขอบเขตเดิม | ใช้ได้ตามเดิม | จัดเอกสารได้ |

ต้องตรวจเงื่อนไขใน `App` ที่ใช้ `storageSchemaVersion < SCHEMA_VERSION` โดยเฉพาะ `planDisabled`: เมื่อเพิ่ม current เป็น 4 ห้ามปิดแผนที่ schema 3 เก็บได้อยู่แล้ว Worksheet ยังต้องใช้ได้ตั้งแต่ schema 2 เช่นเดิม

### การเลือกประเภทใหม่ในข้อมูลเก่า

- เห็นหมวดและประเภททั้งหมดเพื่อเลือกดูได้แม้ไฟล์เก่ายังเก็บรหัสบางชนิดไม่ได้
- ถ้ากดเพิ่ม/เปลี่ยนเป็นประเภทที่เก็บไม่ได้ ให้เสนอปุ่มสร้างสำเนาสำหรับคุณสมบัติใหม่ ก่อนสร้าง/แก้ record จริง อธิบายว่าต้นฉบับยังเปิดกับแอปเก่าได้ ยกเลิกแล้วไม่มี writes
- ใช้ flow เลือกโฟลเดอร์ว่าง/ยืนยันของเดิม ไม่อัปเกรดในที่เดิมอัตโนมัติ และไม่สร้างรายการต่อให้อัตโนมัติหลัง copy เพียงเพราะเคยเปิดดูประเภทนั้น
- Copy 1/2/3 → 4 ต้องรักษารหัส record, workspace ID, หมวด/ประเภทย่อยเดิม, status, ยอด, null, attachment links, pinned rules, worksheet, scenarios และ plan ที่มีอยู่ เพิ่มเฉพาะ version/revision/update metadata ตามกลไกเดิม
- ต้นฉบับและ historical snapshot bytes คงเดิม; lock, source-baseline checks, namespace/inventory/hash verification, capacity และ incomplete marker ใช้ต่อ; failure ห้ามเปิด target ว่าพร้อมใช้งาน
- Rollback คือใช้โฟลเดอร์ต้นฉบับกับแอปรุ่นเก่า ไม่สัญญาว่าจะย้อนการแก้ใน schema 4 กลับไปไฟล์เก่าได้

JSON/ZIP รองรับการนำเข้า 1/2/3 โดย consent เดิมและสร้างสำเนาเป็น 4 พร้อมล้าง confirmation/completion hashes ตามเดิม; export/import schema 4 ต้องคงรหัสใหม่ครบ Historical 1/2/3 ยังอ่านได้ในการ backup/recovery/purge ห้ามปิด legacy readers

CSV คงรูปแบบ 12 คอลัมน์เดิม เพิ่มเพียงค่ารหัส/label ที่อนุญาตในสองคอลัมน์ subtype ไม่เพิ่มคอลัมน์ใหม่ แจ้งผู้ใช้ downstream ที่ตรวจ enum เดิมแบบตายตัวว่าต้องรองรับรหัสเพิ่ม ข้อมูล CSV ไม่ใช่การยืนยันสิทธิภาษี

## 6. ลำดับดำเนินการและจุดจบของแต่ละช่วง

ลำดับที่อนุมัติให้ดำเนินการ; ผลที่ทำจริงและหลักฐานอยู่ในหัวข้อ 9

1. **Compatibility และ registry แบบ atomic** — เก็บ fixture/frozen validators 1/2/3 ก่อนขยาย enum จากนั้นเพิ่ม 6 IDs พร้อม schema 4 และ compatibility writer/copy/transfer ที่อธิบายไว้ จบเมื่อ taxonomy ผ่าน parent checks ข้อมูลเดิมเปิดแก้ได้โดยไม่เปลี่ยน format และ new IDs ไม่รั่วลงเวอร์ชันเก่า
2. **ชื่อแสดงผลและยอดหมวด** — ใช้ label กลางและ helper สรุปหลักฐาน/unknown/counts; จบเมื่อยอด/จำนวนผ่านกรณี null, zero, partial, excluded, trash, ปีต่างกัน และ overflow
3. **Category-first flow** — หน้า documents เป็นค่าเริ่มต้น, ทุกหมวด/ประเภทเข้าถึงตรง, shared selection/filter, `addRecord` prefill, existing editor และ dirty guards; จบเมื่อเพิ่มเอกสารจาก RMF/ThaiESGX/ประกันได้ใน current format โดยไม่ต้องเปลี่ยน dropdown ซ้ำ และกดดูอย่างเดียวไม่มี writes
4. **Regression และเอกสารใช้งาน** — ปรับ tests ที่เคยคาด worksheet เป็นหน้าแรก ให้ทดสอบการเปิดเมนูเครื่องคำนวณอย่างชัดเจน ไม่ลบทดสอบการคำนวณ/แผนเดิม; อัปเดต README อธิบายการเลือกหมวด ยอดหลักฐาน และ optional copy upgrade
5. **ตรวจครบแล้วหยุด** — รัน proof ในหัวข้อถัดไป สรุปงาน/ข้อจำกัด ไม่ commit/push/deploy หรือเพิ่ม feature ต่อโดยไม่มีคำขอ

### ไฟล์ที่คาดว่าต้องแตะ

- Domain: `src/domain/documents.ts`, `summary.ts`, `schema.ts`, `taxInputs.ts`
- Storage/transfer: `src/storage/manifest.ts`, `migration.ts`, `workspace.ts` เฉพาะจุดที่ใช้ version/type ใหม่; `src/transfer/json.ts`, `zip.ts`, `csv.ts` เฉพาะ compatibility/label ที่จำเป็น
- UI: `src/App.tsx`, `src/ui/DocumentCategories.tsx` (ใหม่), `DocumentList.tsx`, `DocumentEditor.tsx`, `YearOverview.tsx` และ `src/styles.css`; worksheet/plan แตะเฉพาะ feature gates/prop ที่จำเป็น
- Tests/README: ส่วนที่ยืนยัน contract ด้านล่าง รวม fixture เวอร์ชันเก่า ไม่เปลี่ยน rule bundles, dependencies, build/deployment config หรือสูตรภาษี

## 7. เกณฑ์ยอมรับและการพิสูจน์

| ID | กรณีทดสอบ | ผลที่ต้องได้ |
|---|---|---|
| C01 หน้าแรก | สร้างใหม่/เปิด 1/2/3/4 | เข้าเอกสารและเห็นทุกหมวดของปีที่เลือก รวมหมวดว่าง; old data แก้ได้โดยไม่มี mandatory upgrade |
| C02 ประเภท | fund 9 + insurance 4 | อยู่ใน parent ถูกต้อง เลือกตรงได้; ไม่ระบุสิทธิรายปีจากชื่อ; null/other ไม่ปะปน |
| C03 เลือกดู | กด parent/subtype/รอจัดประเภท/ทั้งหมด | filter ตรงกัน ไฮไลต์ถูก รายการคนละหมวดไม่ค้างใน editor; manifest revision/bytes ไม่เปลี่ยน |
| C04 เพิ่ม | เพิ่มจากหมวดและ subtype รวมหมวดว่าง | สร้างครั้งเดียวพร้อมปี/parent/subtype; waiting-document, amounts null, no attachments; อยู่ในรายการที่กรองและ editor เปิดถูกตัว |
| C05 Dirty/failure | draft ผิดรูปแบบ/ยกเลิกเปลี่ยนหมวด/เขียนล้มเหลว | คง draft และ selection; ไม่มี lost edit/รายการบันทึกหลอก; busy/read-only ไม่เกิด writes |
| C06 ยอด | null/0/partial/overflow, active/excluded/trash | ไม่เรียก unknown ว่า 0; count กับยอดมีความหมายตามที่ระบุ; claimed/withheld ไม่ถูกบวกเป็น evidence; overflow ไม่เป็น 0 |
| C07 ไม่บวกซ้ำ | parent/children/รอจัดประเภท + 2 ปี + shared attachment | partition รวมเท่า parent เมื่อรวมได้; ไม่บวก parent ซ้ำ; ปี/ไฟล์ร่วมไม่ทำให้ย้ายหรือ dedupe records เอง |
| C08 เปิดเก่า | fixtures 1/2/3 และตัวอ่านเก่า | เปิดแล้ว data bytes/revision ไม่เปลี่ยน; แก้ข้อมูลเดิมแล้วยังเขียน schema เดิม; schema 3 plan ไม่ถูกปิดหรือล้าง |
| C09 กันรหัสใหม่ | new ID ใน record, worksheet, scenario ของไฟล์ 2/3 | frozen validators/compatibility writer ปฏิเสธก่อน writes; UI เสนอ optional copy; กดยกเลิกไม่แก้ต้นฉบับ |
| C10 Copy/rollback | copy 1/2/3 → 4; lock denied, target ไม่ว่าง, partial write, source drift | ต้นฉบับ/history byte-identical; target ไม่เปิดเมื่อไม่ครบ; unknown classification ไม่ถูกเดา; แอปเก่าปฏิเสธไฟล์ 4 ว่าใหม่กว่า แต่ยังเปิดต้นฉบับได้ |
| C11 Transfer | JSON/ZIP round-trip 4 มีทุก ID; import 1/2/3; mixed history; CSV | fields/labels/links ไม่หาย; imported confirmations ถูกล้าง; schema-3 plan/actuals อยู่ครบ; CSV 12 columns/escaping เดิม |
| C12 Lifecycle | กดหมวด→เพิ่ม RMF/ThaiESGX→แนบ→แก้→reload/open | เอกสารกลับมาในหมวดเดิมพร้อมแก้; เปลี่ยน category invalidates review; ใช้ถังขยะ/restore/purge ได้ตามกฎเดิม |
| C13 การเข้าถึง | keyboard, focus, screen-reader label, mobile 375px | native buttons มีชื่อและ selected state; ไม่มี nested buttons; แยกดู/เพิ่มได้; ไม่ต้อง hover; ไม่มี horizontal page overflow |
| C14 งานเดิม | เครื่องคำนวณ แผนสุขภาพ กฎ backup/offline/privacy | ยังเข้าถึงได้จากเมนูรอง; ไม่แปลงยอดเอกสารเป็นค่าลดหย่อนหรือเปลี่ยน trust gates เอง |

ตำแหน่ง proof: เพิ่ม/ขยาย `tests/unit/documents.test.ts`, `summary.test.ts`, `schema.test.ts`, `documentList.test.tsx`, tests ของ category UI; `tests/integration/existingWorkspace.test.ts`, `migration.test.ts`, `planPersistence.test.ts`, `transfer.test.ts`, `faults.test.ts`; และ E2E category-first พร้อมปรับ `existing-contents.spec.ts`, `subcategories.spec.ts`, `simple-workflow.spec.ts` ตามพฤติกรรมหน้าแรกใหม่

คำสั่งตรวจหลัง implement (ผลการรันจริงอยู่ในหัวข้อ 9):

- Focused unit/integration ตาม acceptance ที่แก้ แล้ว `rtk npm test -- --run`
- `rtk npm run typecheck` และ `rtk npm run build`
- `rtk proxy env LD_LIBRARY_PATH=/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu npm run test:e2e` หาก environment ยังต้องใช้ไลบรารีที่มีติดตั้งไว้นี้
- `rtk git diff --check` และตรวจ `public/rules`, dependencies, workflows ว่าไม่มีการเปลี่ยนนอกขอบเขต

Browser automation ใช้ synthetic OPFS ไม่ถือเป็นหลักฐาน native folder picker บน Chrome/Edge หรือ human Thai-font/screen-reader signoff ให้รายงานส่วนที่ยังไม่ตรวจตรง ๆ

## 8. สิ่งที่ไม่ทำและเกณฑ์หยุด

ไม่เพิ่มสูตร/วงเงิน/สิทธิภาษีปีใหม่ ไม่ขยายเครื่องคำนวณให้รองรับกองทุน ไม่จัดอันดับหรือเลือกผลิตภัณฑ์ ไม่ซื้อ/ยื่นแบบแทน ไม่เพิ่มบัญชี คลาวด์ OCR บริการใหม่ หมวดที่ผู้ใช้กำหนดเอง หรือหลาย dashboard

ถ้าการเพิ่มประเภทใหม่ต้องลดการตรวจข้อมูล ล้างแผนเก่า เขียน enum ใหม่ลงไฟล์เก่า หรือบังคับแปลงต้นฉบับตอนเปิด ให้หยุดแก้ design ก่อน ไม่ทำ workaround ด้วย title/notes หรือ silently fallback ไป “อื่น ๆ”

ผู้ใช้อนุมัติ “Enter Execute Mode” หลังทบทวนแผนแล้ว การอนุมัตินี้ไม่รวม commit, push หรือ deploy

## 9. ผลดำเนินการและหลักฐาน — 25 Oct 2026

- **Baseline:** ก่อนแก้แอป unit/integration ผ่าน 27 files / 208 tests ที่ HEAD `4a02a4f`; มีเพียงไฟล์แผนนี้ที่ยังไม่ tracked
- **C01–C05:** เปลี่ยนหน้าแรกเป็นเอกสารทุกเวอร์ชัน แสดงครบ 15 หมวดและทุกประเภท รวมหมวดว่าง ใช้ selection เดียวร่วมระหว่างหมวด รายการ และการเพิ่มเอกสาร กดเลือกอย่างเดียวไม่เขียนไฟล์; ปุ่มเพิ่มสร้าง parent/subtype ที่เลือกพร้อม waiting-document/null amounts/no files; dirty guard และ read-only/busy guards คงอยู่ การเปลี่ยนหมวดล้างตัวกรองค้างและนำ focus ไปหัวข้อรายการเพื่อใช้งานต่อได้ทันที
- รายละเอียด interface ต่างจากร่างเล็กน้อย: คง `onAdd` เป็น action callback เดิม โดย `App.addRecord` อ่าน parent/subtype จาก controlled selection ที่ App เป็นเจ้าของโดยตรง แทนส่งค่าเดียวกันซ้ำผ่าน callback อีกชุด ผล prefill/validation ตรงตามแผนและทดสอบผ่าน
- **C06–C07:** helper หลักฐานแยกจาก claim/withholding overflow; counts ยังอยู่เมื่อ evidence overflow; null/zero/partial/excluded/trash/ปี/parent partitions และไฟล์แนบร่วมผ่าน unit proof ไม่ใช้ unknownClaimCount แทนยอดหลักฐาน
- **C08–C11:** schema 4 รองรับ 13 subtype IDs; frozen 2/3 คง 7 IDs ทั้ง record/worksheet/scenario และ contribution limit 7 เดิม compatibility writer ปฏิเสธรหัสใหม่ก่อน writes; schema 3 health plan ยังแก้ไข/บันทึกใน schema 3 ได้ Copy/import/ZIP/CSV ครอบคลุมการคงแผน actuals/history และการล้าง imported confirmations; partial-copy marker และต้นฉบับไม่เปลี่ยนผ่าน integration proof
- **C12:** E2E ครอบคลุม RMF/ThaiESGX/SSF/health prefill, attach/review, subtype change แล้วต้องตรวจทานใหม่, reload/reopen, trash/restore และ permanent purge พร้อม reference cleanup
- **C13:** keyboard Enter เลือกประเภทและย้าย focus ไปหัวข้อรายการ, aria-pressed/controls/descriptions, ไม่มี nested buttons และ mobile 375px ไม่มี horizontal page overflow ผ่าน automation มีภาพ `test-results/category-first-mobile.png` และ `test-results/category-first-desktop.png` สำหรับตรวจ geometry; environment ไม่มี Thai fonts จึงไม่อ้างว่าได้ human Thai typography หรือ screen-reader signoff
- **C14:** tests เดิมเปิดเครื่องคำนวณจากเมนูรองอย่างชัดเจน ไม่ลบ proof แผนสุขภาพ/กฎ/offline/privacy/backup เดิม ไม่เปลี่ยนสูตรหรือเผยแพร่สิทธิภาษีใหม่
- **ผลล่าสุด:** `rtk npm run typecheck` ผ่าน; `rtk npm test -- --run` ผ่าน 29 files / 227 tests; Chromium E2E ผ่านทั้งหมด 20 tests โดยคำสั่ง E2E rebuild production (`tsc --noEmit && vite build`) ก่อนทดสอบ Build ยังมี large-chunk warning เดิม ไม่มี dependency ใหม่
- ระหว่างพัฒนาแก้ test fixture typing ให้ตรง union ของเวอร์ชันเก่า และแก้ E2E ให้รอ editor หลัง verified commit ก่อนอ่านไฟล์ ไม่ใช้ timeout คงที่หรือผ่อน assertion ข้อมูล
- **ข้อจำกัดที่รายงาน:** native folder picker บน Chrome/Edge จริง, human Thai-font และ screen-reader review ยังไม่ได้ทำ; OPFS browser tests ไม่ใช้แทนหลักฐานเหล่านั้น
- หยุดในขอบเขตที่อนุมัติ: ไม่มีการเปลี่ยน `public/rules`, สูตรภาษี, dependencies หรือ deployment workflows และยังไม่ commit/push/deploy
