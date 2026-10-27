# ผลตรวจส่งมอบ — 27 ตุลาคม 2569

## วงเงินและหมวดลดหย่อนปี 2569

ดำเนินการตามแผนที่ผู้ใช้อนุมัติ `process/general-plans/active/tax-2569-category-limits_PLAN_27-10-26.md` ชุดกฎใหม่ `2569.3-reviewed-2026-10-27` (46 หมวด: ตรวจหลักเกณฑ์แล้ว 29, รอตรวจ 15, สิ้นสุดสิทธิ 2) ไม่แก้ schema v1 หรือสูตรคำนวณภาษี

- เพิ่มคำอธิบายเพดาน หน่วย ฐานสัดส่วน และวงเงินร่วมจากกฎภายในแฟ้มเดียวกัน ใช้ร่วมกันในรายการเลือกหมวด การ์ด และหน้าเงื่อนไข แยกวงเงินอ้างอิงจากยอดคงเหลือที่ engine คำนวณ
- เปิดประกันชีวิตคู่สมรสไม่เกิน 10,000 บาท และเงินสะสมกองทุนครูเอกชนไม่เกิน 500,000 บาทร่วมกลุ่มเกษียณ หลังตรวจหลักฐานกฎหมายในบันทึกวิจัย ทั้งสองยังต้องให้ผู้ใช้ยืนยันสิทธิรายบุคคล
- เพิ่มหมวดบุตรบุญธรรม งานศิลปะ และ CCTV เป็นรอตรวจสอบ/เก็บเอกสาร ไม่มีวงเงินที่แอปรับรอง ฝากครรภ์ Solar ม.39/40 และสิทธิเฉพาะที่ยังตรวจไม่ครบไม่เพิ่มยอดลดหย่อน
- แฟ้มเดิมไม่ถูกเปลี่ยนกฎอัตโนมัติ มีลิงก์ดาวน์โหลดชุดกฎส่วนกลางและนำเข้าโดยผู้ใช้ ตรวจแฟ้ม/ปีก่อนและหลังสำรอง ปฏิเสธหมวดกำหนดเองที่มีรายการแต่หายจากชุดใหม่ และแจ้งตรงไปตรงมาเมื่อหลักเกณฑ์เหมือนเดิมจึงไม่ติดตั้งรุ่นใหม่
- ปีอนาคตไม่แสดงวงเงินหรือเงื่อนไขตัวเลขที่สืบทอดจากปี 2569; แฟ้มปีอนาคตที่มีอยู่แล้วไม่ถูกเขียนใหม่

## ผลตรวจรอบสุดท้าย ตามลำดับที่กำหนด

| Gate | ผลจริง |
|---|---|
| `npm run typecheck` | ผ่าน |
| `npm test` | ผ่าน 194 รายการ / 7 ไฟล์ ไม่มีล้มเหลว |
| `npm run build` | ผ่าน; precache 224 ไฟล์ มี `rules/2569.json` |
| `npm run test:e2e` | Chromium ผ่าน 23 รายการ ไม่มีล้มเหลว (26.3 วินาที) |
| `node scripts/verify-pdf.mjs` | ผ่าน PDF ไทย 4 หน้า ข้อความสำคัญครบ 4 ค่า และเรนเดอร์หน้าแรกได้ |
| ภาพ desktop/mobile/PDF | เปิดตรวจภาพหน้าภาพรวม desktop, หมวดวงเงิน mobile และ PDF หน้าแรก ภาษาไทยอ่านได้ ไม่พบข้อความล้นแนวนอนใน E2E ที่ 390px |
| แผนและ diff | strict plan validator และ `git diff --check` ผ่าน |

หลักฐานอัตโนมัติครอบคลุม: วงเงินและเพดานร่วมเดิม, การเปิดสองสิทธิใหม่ตามยอดรับรอง, pending ไม่เพิ่มสิทธิแม้เอกสารครบ/ยืนยันแล้ว, บุตรหลักกับส่วนเพิ่มไม่ซ้ำ, Thai ESGX carry และบำนาญสองส่วน, historical ZIP คง snapshot/ยอดคำนวณ, เงื่อนไขเปลี่ยนต้องยืนยันใหม่, เอกสารยังอยู่, ยกเลิก/ปีผิด/หมวดกำหนดเอง/สำรองล้มเหลว/preview เก่าและปีเปลี่ยนหลังสำรองไม่เขียนผิดแฟ้ม, ดาวน์โหลดกฎแบบออฟไลน์ไม่ติดตั้งเอง, การแสดงหน่วยและตัวเลขจาก snapshot นำเข้า, ไม่มีการส่งข้อมูลผู้ใช้ออกและไม่มี localStorage/IndexedDB ของแฟ้ม

พาธหลักฐาน: `test-results/artifacts/overview-desktop.png`, `category-limits-mobile.png`, `annual-thai.pdf`, `annual-pdf-rendered.png` และ `annual-pdf-text.txt` (artifact ชั่วคราวของชุดทดสอบ)

## ข้อจำกัดและบันทึกรอบตรวจ

- บันทึกแหล่งกฎหมาย/รายการที่ยังไม่ยืนยันอยู่ใน `docs/tax-research-2569.md`; ไม่ได้อ้างว่ารองรับสิทธิทุกกรณีปี 2569 หรือใช้แทนแบบยื่นจริง
- Browser ไม่ยืนยันว่าผู้ใช้เก็บ ZIP สำรองสำเร็จ จึงขอให้ผู้ใช้ตรวจรายการดาวน์โหลด โหมดโฟลเดอร์ทดสอบด้วย native handle substitute ไม่ใช่ OS folder picker จริง ยังไม่ทดสอบ Safari/Firefox หรือ screen reader จริง
- ตรวจ URL ของกฎทั้ง root และ nested `/NexTHTax/` ด้วย focused tests และดาวน์โหลดจริง/ออฟไลน์บน preview root; ไม่ได้ deploy หรือตรวจ live hosting
- Build มีคำเตือนขนาด chunk เกิน 500 kB ที่ไม่ขัดการผ่าน build ไม่เพิ่ม dependency เพื่อปรับขนาด bundle ในงานนี้; ไม่ได้รัน npm audit รอบนี้
- รอบพัฒนาพบ Help ล้มเมื่อใช้รูปแบบอ้างฐาน URL ที่ Vite ไม่แทนค่า แก้เป็นรูปแบบที่รองรับและ E2E ดาวน์โหลด/นำเข้าผ่านแล้ว ปรับตัวเลือกทดสอบหมวดกำหนดเองให้ตรงชื่อที่มีสถานะ และปรับ assertion เดิมที่เหมารวมบุตรบุญธรรมกับสิทธิครอบครัวคงที่ รอบสุดท้ายผ่านทั้งหมด
- ไม่มี commit, push หรือ deploy

---

# ผลตรวจส่งมอบ — 25 ตุลาคม 2569

## หลักฐานที่ตรวจจริง

| Gate | ขอบเขต |
|---|---|
| `npm test` | unit/integration ของ storage และ calculation engine รายละเอียดตาม stdout ของรอบส่งมอบ |
| `npm run typecheck` | TypeScript strict รวม source และ tests |
| `npm run build` | static Vite build + fonts/PDF resources/licenses + offline precache |
| `npm run test:e2e` | Chromium 7 เส้นทางผ่าน UI จริง |
| `node scripts/verify-pdf.mjs` | อ่านข้อความไทยกลับจาก PDF จริง ตรวจคำสำคัญ แล้ว render หน้าแรกเป็น PNG |
| `npm audit` | ตรวจ dependency advisories จาก registry ณ เวลาส่งมอบ |

## Storage / tax invariants

- สร้าง บันทึก เปิดใหม่ และย้ายโฟลเดอร์ (in-memory filesystem adapter tests)
- ZIP roundtrip ข้อมูลและเอกสารตรง bytes, UTF-8, CRC, hash, schema/ปีไม่ตรง และ unknown version
- สิทธิหาย/เขียนล้มเหลว/close ล้มเหลว/อ่านกลับไม่ตรงไม่เป็น saved
- external modifications, lock contention, interrupted save/recovery และอ่านแฟ้มระหว่างเขียนไม่รับ mixed snapshot
- path traversal/ZIP slip, duplicate names, ขนาดคลายไฟล์และชนิดไฟล์, unsupported ZIP64 และ bounded decompression
- ไฟล์แนบหาย/ถูกแก้ เอกสารซ้ำไม่เพิ่มยอด หลักฐาน orphan กลับมาอ้างได้โดยไม่ทำสำเนาในปีเดียวกัน
- ภาษีตามขอบขั้นและยกเว้นเศษบาทสุดท้าย, เพดานร่วมชีวิต/สุขภาพ/บำนาญ/เกษียณ/ESG
- บริจาค 2 เท่าที่เข้าเกณฑ์ติดเพดานร่วมก่อนบริจาคทั่วไป, รายได้ไม่มี/รายได้อื่นไม่ใช้สูตรเงินเดือนเอง
- ครอบครัวจำนวนที่ผู้ใช้ยืนยัน บ้านกู้ร่วม สิทธิ ESGX ใช้แหล่งเดิมซ้ำไม่ได้/ข้อมูลต้นทางข้ามปีต้องตรง
- ปีอนาคตไม่คัดเงิน/กฎเพดานเดิม; จำลองไม่เปลี่ยนรายการจริง; เปลี่ยนเงื่อนไขกฎต้องตรวจสิทธิใหม่
- ป้องกันเกินจำนวนไฟล์/รายการ/หมวด/ปีที่ทำให้แฟ้มบันทึกต่อไม่ได้

## Browser paths

1. สร้าง ZIP → เพิ่มรายการ → แนบไฟล์ในรายการเดิม → เตือนไฟล์ hash ซ้ำ → ส่งออก → reload → เปิด ZIP → preview พบข้อมูลเดิม
2. รายได้ → จำลอง RMF → ตรวจว่า records ไม่เปลี่ยน → เพิ่ม 2570 → ไม่ได้ยอดหรือกฎเดิม
3. รอ offline-ready → ตัด network → reload → ใช้ตัวอย่าง → สร้าง PDF และตรวจ responsive 390px
4. ใช้ browser-native FileSystemDirectoryHandle ผ่าน OPFS **เฉพาะตัวแทนใน test** → บันทึกจริงผ่าน createWritable → reload/open → จำลอง revoked permission → UI ไม่แสดง saved
5. เปิดตัวอย่าง PDF ขณะ offline → render canvas; ส่งออก CSV ที่ชื่อขึ้นต้น `=` ไม่ถูกตีความเป็นสูตร
6. หน่วง arrayBuffer เอกสาร → บันทึก → ปิดด้วย Escape ไม่ได้และแก้ฟอร์มไม่ได้ → อ่านเสร็จจึง commit
7. นำเข้ากฎใหม่ เปลี่ยนเงื่อนไข → ดู diff/สำรอง/ยืนยัน → สถานะสิทธิกลับไปยังไม่ได้ตรวจ

การสร้างรายการแรกมี automation assertion <120 วินาที **ไม่ใช่ผลทดสอบ usability กับคนจริง** เส้นทางจริงใช้สร้างแฟ้ม → ชื่อ/ยอด/วันที่/หมวด ไม่มีข้อมูลบังคับอ่อนไหว

## Privacy proof

ระหว่างเส้นทางเอกสารและรายได้ ตรวจ request ทุกตัว: ไม่มี POST/เนื้อหา request ไม่มีชื่อ/จำนวนภาษีใน URL ไม่มี HTTP ไปนอก origin; blob URL ใช้อ่านในเครื่องเท่านั้น ตรวจ localStorage และ IndexedDB ว่างในเส้นทางปกติ (ไม่นับ OPFS ที่ฉีดเฉพาะ fixture)

Offline cache สร้างรายการคงที่จาก `dist` ไม่เพิ่ม entry จาก request ขณะทำงานและไม่เคยเก็บ workspace ภาษี เป็นหลักฐานจากเส้นทางทดสอบและ source review ไม่ใช่การรับรอง source ที่ถูกดัดแปลงภายหลังหรือพฤติกรรม extension/OS/hosting อื่น

## ภาพและ PDF

E2E สร้างหลักฐานใน `test-results/artifacts/` (ไม่ commit): `welcome-desktop.png`, `overview-desktop.png`, `overview-mobile.png`, `annual-thai.pdf`, `annual-print.png`, `pdf-preview.png` ตัวตรวจ PDF เพิ่ม `annual-pdf-text.txt` และ `annual-pdf-rendered.png` ตรวจภาพภาษาไทยแล้ว ไม่มีตัวอักษรสี่เหลี่ยมในรายงาน

## ขอบเขตที่ยังต้องทดสอบด้วยผู้ใช้/เครื่องเป้าหมาย

- **ไม่ได้ควบคุม OS folder picker จริง** ใน CI: ทดสอบ adapter แบบจำลองและ browser-native handle โดยแทน picker ด้วย OPFS เท่านั้น แอปจริงไม่มีโค้ดเก็บภาษีใน OPFS ต้องทดลองสร้าง/เปิดโฟลเดอร์บน Chrome/Edge เครื่องเป้าหมายและการถอนสิทธิผ่าน browser จริง
- ยังไม่ได้รัน Safari/Firefox บนเครื่องจริง การใช้ ZIP พึ่ง APIs มาตรฐานและมีการตรวจ capability ไม่กล่าวว่าผ่าน cross-browser ทั้งหมด
- Browser อาจไม่เตือน beforeunload ในบางกรณี cache อาจถูก browser/ผู้ใช้ล้าง การดาวน์โหลด ZIP ไม่ยืนยันว่าผู้ใช้กดเก็บแล้ว
- OS/sync client ไม่อยู่ภายใต้ Web Locks ไม่มี multi-file atomic transaction ข้ามทุกโปรแกรม ให้หยุดการแก้/ซิงก์พร้อมกันและสำรองต่างที่
- กฎ pending ไม่รับรองสิทธิ, ไม่รับรองความครบทุกสิทธิ/ภาษีขั้นต่ำ/เครดิต/การปัดเศษย่อยของแบบยื่นจริง แม้ตรวจการยกเว้นเศษบาทขั้นสุดท้ายแล้ว
- ไม่มี schema migration รุ่นแรกปฏิเสธรูปแบบอื่นโดยไม่เขียนทับ ไม่ได้อ้างว่ากู้คืนรุ่นอื่นได้

ในสภาพแวดล้อมตรวจนี้ Chromium ใช้ shared libraries ที่มีอยู่ใน `/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu` ผ่าน `LD_LIBRARY_PATH` ไม่ใช่ dependency runtime ของ static app เครื่องทั่วไปใช้ขั้นตอนติดตั้ง browser deps ของ Playwright ตาม README

## รอบส่งมอบสุดท้าย

25 ตุลาคม 2569: **118 tests ผ่าน** (engine 68 + storage 50), **Chromium 7/7 ผ่าน** (10.0 วินาที), TypeScript 7.0.2 และ static build (Vite 8.3.5) ผ่าน ชุดกฎ **2569.2** offline precache 224 assets PDF จริง 4 หน้าอ่านข้อความไทยกลับและ render ผ่าน `npm audit`: 0 vulnerabilities รายละเอียด machine-readable: `docs/harness/verification.json`

บันทึกแก้ระหว่างตรวจ: ปรับปรุงแพ็กเกจสู่รุ่นล่าสุด (Vite 8, TypeScript 7, Lucide-React 1.x, @types/node 26, React 19.3); รองรับ Playwright environment fallback อัตโนมัติ; ป้องกัน Modal InvalidStateError ใน React StrictMode; เพิ่ม fallback ความปลอดภัยสำหรับหมวดหมู่ใน RecordEditor เมื่อเปิดรายการที่มีหมวดไม่ตรงกับตัวกรอง

## สิทธิยอดคงที่ — ผลตรวจรอบ EXECUTE (สถานะ: TESTING, ยังไม่ VERIFIED)

ผู้ใช้ยังไม่ได้ยืนยันหน้าตาที่เปลี่ยน ตามแผน `process/general-plans/active/fixed-allowance-ui-ux_PLAN_25-10-26.md` ผลด้านล่างคือผลอัตโนมัติและการดูภาพ 1440px/390px ที่สร้างในรอบนี้

- `npm run typecheck`: ผ่าน
- `npm test` (vitest): 167 ผ่าน / 0 ไม่ผ่าน (engine 68 · storage 53 · fixed-allowances 41 · fixed-allowance-ui 4 · zip-index 1)
- `npm run build`: ผ่าน
- `npm run test:e2e`: 15 ผ่าน / 0 ไม่ผ่าน (app 7 เดิม + fixed-allowances 8 ใหม่) มีภาพ `test-results/artifacts/fixed-allowance-*.png` และ `fixed-allowance.pdf`
- `node scripts/verify-pdf.mjs`: ผ่าน 4 หน้า (ค่าเริ่มต้นเดิม)
- `node scripts/verify-pdf.mjs test-results/artifacts/fixed-allowance.pdf ไม่ใช่รายจ่าย บุตร บาท 60,000 นับในยอดสิทธิ`: ผ่าน (ดูผลรันจริงด้านล่าง) pdfjs ดึงสระไทยบางตัวไม่ครบและแทรก `\x00` (เช่น “ปี” ในหัวข้อ “ปี 2569”) ตัวตรวจจึงตัด NUL ก่อนเทียบ และใช้คำที่รอดการดึงข้อความ ส่วน “สิทธิประจำปี” ยืนยันด้วยภาพ render หน้าแรกและหน้า 2 ไม่ได้ลดเงื่อนไขตรวจ
- ยังไม่ได้ทดสอบบน Safari/Firefox, ยังไม่ได้ทดสอบ screen reader จริง, และยังไม่ได้ตรวจกับแฟ้มจริงของผู้ใช้

