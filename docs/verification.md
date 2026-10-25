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

25 ตุลาคม 2569: **118 tests ผ่าน** (engine 68 + storage 50), **Chromium 7/7 ผ่าน** (9.8 วินาที), TypeScript และ static build ผ่าน ชุดกฎ **2569.2** offline precache 224 assets PDF จริง 4 หน้าอ่านข้อความไทยกลับและ render ผ่าน `npm audit`: 0 vulnerabilities รายละเอียด machine-readable: `docs/harness/verification.json`

บันทึกแก้ระหว่างตรวจ: เปลี่ยนชื่อเข้าถึง select ให้ชัดเจน; แก้ offline asset match เมื่อ hosting มี Vary; ล็อก async edits/loads และ folder reads; เปลี่ยน ZIP extraction ให้ใช้ inspected ranges แบบ bounded; reset สิทธิหลังเปลี่ยนเงื่อนไขกฎ; ตรวจ recovery readback/การเปลี่ยนสำรองก่อนล็อก ทุกกรณีที่เกี่ยวกับข้อมูลมี regression proof ไม่ได้นำข้อมูลผู้ใช้จริงมาทดสอบ
