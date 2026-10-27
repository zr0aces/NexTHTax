import { test, expect, type Page } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { unzipSync } from "fflate";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");
async function createZip(page:Page){await page.goto("/");await page.getByRole("button",{name:/สร้างแฟ้มภาษีใหม่/}).first().click();await page.getByRole("button",{name:/ใช้แฟ้ม ZIP/}).click();await expect(page.getByRole("heading",{name:/จัดแฟ้มวันนี้/})).toBeVisible();}
async function addHealth(page:Page){await page.getByRole("button",{name:"เพิ่มรายการ",exact:true}).first().click();await page.getByRole("dialog").getByRole("button",{name:/จ่ายจริงหรือเอกสาร/}).click();const modal=page.getByRole("dialog");await modal.getByLabel("หมวด",{exact:true}).selectOption("health");await modal.getByLabel("ชื่อรายการ",{exact:true}).fill("ประกันสุขภาพของฉัน");await modal.getByRole("spinbutton",{name:"จำนวนเงินที่จ่าย",exact:true}).fill("18000");await modal.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();await expect(modal).not.toBeVisible();}
async function downloadZip(page:Page){const pending=page.waitForEvent("download");await page.getByRole("button",{name:"ส่งออก ZIP",exact:true}).click();const download=await pending;return await readFile((await download.path())!);}

test("first record, attach to existing, ZIP reopen, duplicate prevention, no data egress",async({page})=>{
 const requests:{url:string;method:string;data:string|null}[]=[];page.on("request",r=>requests.push({url:r.url(),method:r.method(),data:r.postData()}));
 const start=Date.now();await createZip(page);await addHealth(page);expect(Date.now()-start).toBeLessThan(120000);
 await expect(page.getByText("ยังไม่ได้ส่งออก ZIP",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();
 const modal=page.getByRole("dialog");await modal.locator("input[type=file]").setInputFiles({name:"ใบรับรอง.png",mimeType:"image/png",buffer:png});await modal.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();
 await expect(page.getByRole("button",{name:"ใบรับรอง.png"})).toBeVisible();
 await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();await modal.locator("input[type=file]").setInputFiles({name:"ชื่อใหม่.png",mimeType:"image/png",buffer:png});await modal.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();await expect(modal.getByRole("alert")).toContainText("เอกสารซ้ำ");await modal.getByRole("button",{name:"ยกเลิก",exact:true}).click();
 const bytes=await downloadZip(page),files=unzipSync(bytes);const records=JSON.parse(new TextDecoder().decode(files["years/2569/records.json"]));expect(records).toHaveLength(1);expect(records[0].amount).toBe(1800000);expect(records[0].attachments).toHaveLength(1);expect(Buffer.from(files[records[0].attachments[0].path])).toEqual(png);
 await page.reload();await page.getByLabel("เลือกแฟ้ม ZIP",{exact:true}).setInputFiles({name:"backup.zip",mimeType:"application/zip",buffer:bytes});await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await expect(page.getByRole("heading",{name:"ประกันสุขภาพของฉัน",exact:true})).toBeVisible();await page.getByRole("button",{name:"ใบรับรอง.png"}).click();await expect(page.getByRole("img",{name:"ใบรับรอง.png"})).toBeVisible();await page.getByRole("button",{name:"ปิดหน้าต่าง"}).click();
 expect(requests.every(r=>r.method==="GET"&&r.data===null&&(r.url.startsWith("http://127.0.0.1:4173/")||r.url.startsWith("blob:http://127.0.0.1:4173/")))).toBe(true);expect(requests.some(r=>r.url.includes("18000")||r.url.includes("ประกันสุขภาพ"))).toBe(false);
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(await page.evaluate(async()=>await indexedDB.databases())).toEqual([]);
});

test("future year empty and unverified, simulation separate from records",async({page})=>{
 await createZip(page);await page.getByRole("spinbutton",{name:"รายได้ทั้งปีก่อนหักค่าใช้จ่ายและค่าลดหย่อน",exact:true}).fill("900000");await addHealth(page);
 await page.getByRole("spinbutton",{name:"จำนวนเงินจำลอง",exact:true}).fill("50000");const bytes=await downloadZip(page);const files=unzipSync(bytes);expect(JSON.parse(new TextDecoder().decode(files["years/2569/records.json"]))).toHaveLength(1);
 await page.getByRole("button",{name:"เพิ่มปีภาษี",exact:true}).click();await page.getByRole("button",{name:"สร้างแฟ้มปีนี้"}).click();await expect(page.getByText("กฎภาษีปีนี้ยังไม่ยืนยัน จัดเก็บเอกสารได้ แต่ยังไม่รับรองวงเงินและภาษี")).toBeVisible();await expect(page.getByRole("spinbutton",{name:"รายได้ทั้งปีก่อนหักค่าใช้จ่ายและค่าลดหย่อน",exact:true})).toHaveValue("");
 await page.getByRole("spinbutton",{name:"จำนวนเงินจำลอง",exact:true}).fill("10000");await expect(page.getByRole("heading",{name:/จัดแฟ้มวันนี้/})).toBeVisible();
 const future=unzipSync(await downloadZip(page));const profile=JSON.parse(new TextDecoder().decode(future["years/2570/profile.json"]));expect(profile.income).toBeNull();expect(JSON.parse(new TextDecoder().decode(future["years/2570/records.json"]))).toEqual([]);expect(JSON.parse(new TextDecoder().decode(future["years/2570/rules-snapshot.json"])).brackets).toEqual([]);
});

test("offline reload, local font rendering, Thai PDF and mobile layout",async({page,context})=>{
 await page.goto("/");await expect(page.getByText("เตรียมไฟล์แอปสำหรับออฟไลน์แล้ว")).toBeVisible({timeout:20000});await page.evaluate(()=>document.fonts.ready);await mkdir("test-results/artifacts",{recursive:true});await page.screenshot({path:"test-results/artifacts/welcome-desktop.png",fullPage:true});
 await context.setOffline(true);await page.reload();await page.getByRole("button",{name:/ลองดูตัวอย่างสมมติ/}).click();await expect(page.getByRole("heading",{name:/จัดแฟ้มวันนี้/})).toBeVisible();await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check("14px Kanit"))).toBe(true);await page.screenshot({path:"test-results/artifacts/overview-desktop.png",fullPage:true});
 await page.getByRole("button",{name:"เตรียมยื่นภาษี",exact:true}).click();await page.emulateMedia({media:"print"});await expect(page.locator(".print-report")).toBeVisible();await page.pdf({path:"test-results/artifacts/annual-thai.pdf",format:"A4",printBackground:true});await page.screenshot({path:"test-results/artifacts/annual-print.png",fullPage:true});
 await page.emulateMedia({media:"screen"});await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"ภาพรวม",exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:"test-results/artifacts/overview-mobile.png",fullPage:true});
});

test("native browser file handles persist writes, reopen and fail safely (picker substituted)",async({page})=>{
 // Browser-native OPFS only as a test double for the OS-selected directory. App never calls OPFS.
 await page.addInitScript(()=>{(window as any).showDirectoryPicker=async()=>await navigator.storage.getDirectory();const original=FileSystemFileHandle.prototype.createWritable;FileSystemFileHandle.prototype.createWritable=function(options){if((window as any).failWrites)return Promise.reject(new DOMException("test denied","NotAllowedError"));return original.call(this,options);};});
 await page.goto("/");await page.getByRole("button",{name:/สร้างแฟ้มภาษีใหม่/}).first().click();await page.getByRole("button",{name:/ใช้โฟลเดอร์โดยตรง/}).click();await expect(page.getByText("บันทึกแล้ว",{exact:true})).toBeVisible();await addHealth(page);await expect(page.getByText("บันทึกแล้ว",{exact:true})).toBeVisible();
 const persisted=await page.evaluate(async()=>{const dir=await(await(await navigator.storage.getDirectory()).getDirectoryHandle("years")).getDirectoryHandle("2569");return JSON.parse(await(await(await dir.getFileHandle("records.json")).getFile()).text());});expect(persisted).toHaveLength(1);
 await page.reload();await page.getByRole("button",{name:"เปิดแฟ้มภาษีเดิม",exact:true}).first().click();await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await expect(page.getByRole("heading",{name:"ประกันสุขภาพของฉัน",exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as any).failWrites=true;});await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();await page.getByRole("dialog").getByLabel("ชื่อรายการ",{exact:true}).fill("แก้ไขแต่ไม่มีสิทธิ");await page.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();await expect(page.getByText("บันทึกไม่สำเร็จ",{exact:true})).toBeVisible();await expect(page.getByRole("alert")).toContainText("งานที่แก้ยังอยู่");await expect(page.getByText("บันทึกแล้ว",{exact:true})).not.toBeVisible();
});

test("PDF preview renders locally while offline and CSV neutralizes formula names",async({page,context})=>{
 const bytes=await readFile("examples/fictional-tax-2569.zip");await page.goto("/");await expect(page.getByText("เตรียมไฟล์แอปสำหรับออฟไลน์แล้ว")).toBeVisible({timeout:20000});await context.setOffline(true);
 await page.getByLabel("เลือกแฟ้ม ZIP",{exact:true}).setInputFiles({name:"example.zip",mimeType:"application/zip",buffer:bytes});await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await page.getByRole("button",{name:"หลักฐานสมมติ-ไม่ใช่ใบรับรองจริง.pdf",exact:true}).click();
 await expect(page.getByText("หน้า 1 / 1",{exact:true})).toBeVisible({timeout:15000});await expect.poll(()=>page.locator("canvas").evaluate((c:HTMLCanvasElement)=>c.width)).toBeGreaterThan(0);await page.screenshot({path:"test-results/artifacts/pdf-preview.png"});await page.getByRole("button",{name:"ปิดหน้าต่าง"}).click();
 await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();await page.getByRole("dialog").getByLabel("ชื่อรายการ",{exact:true}).fill("=HYPERLINK(123)");await page.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();await page.getByRole("button",{name:"เตรียมยื่นภาษี",exact:true}).click();const pending=page.waitForEvent("download");await page.getByRole("button",{name:/รายการทั้งหมด CSV/}).click();const file=await pending;const csv=await readFile((await file.path())!,"utf8");expect(csv).toContain("\u0027=HYPERLINK(123)");
});

test("cannot close or edit an attachment form during an asynchronous read",async({page})=>{
 await page.addInitScript(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if((window as any).pauseReads)await new Promise<void>(resolve=>{(window as any).finishRead=resolve;});return original.call(this);};});await createZip(page);await addHealth(page);await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();
 const modal=page.getByRole("dialog");await modal.locator("input[type=file]").setInputFiles({name:"read-in-progress.png",mimeType:"image/png",buffer:png});await page.evaluate(()=>{(window as any).pauseReads=true;});await modal.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();await expect(modal.getByLabel("ชื่อรายการ",{exact:true})).toBeDisabled();await page.keyboard.press("Escape");await expect(modal).toBeVisible();await expect(modal.getByRole("button",{name:"ปิดหน้าต่าง"})).toBeDisabled();await expect(modal).toBeVisible();await page.evaluate(()=>{(window as any).pauseReads=false;(window as any).finishRead();});await expect(modal).not.toBeVisible();await expect(page.getByRole("button",{name:"read-in-progress.png"})).toBeVisible();
});

test("changed rule conditions require a fresh eligibility check",async({page})=>{
 await createZip(page);await addHealth(page);await page.getByRole("button",{name:"รายการและเอกสาร",exact:true}).click();await page.getByRole("button",{name:"แก้ไข / เพิ่มหลักฐาน"}).click();const modal=page.getByRole("dialog");await modal.getByText("ดูเงื่อนไขและตรวจสิทธิ",{exact:true}).click();await modal.getByLabel("สถานะสิทธิ",{exact:true}).selectOption("confirmed");await modal.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();
 await page.getByRole("button",{name:"กฎและวิธีใช้งาน",exact:true}).first().click();const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));rules.version="test-conditions-change";rules.rules.find((r:any)=>r.id==="health").conditions.push("เงื่อนไขใหม่ในไฟล์ทดสอบ ต้องตรวจอีกครั้ง");await page.getByLabel("เลือกไฟล์กฎ",{exact:true}).setInputFiles({name:"updated.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(rules))});await expect(page.getByRole("heading",{name:"ตรวจการเปลี่ยนแปลงชุดกฎ",exact:true})).toBeVisible();const backup=page.waitForEvent("download");await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();await backup;await expect(page.getByText("ยังไม่ได้ตรวจสิทธิ",{exact:true})).toBeVisible();
 const files=unzipSync(await downloadZip(page));const rows=JSON.parse(new TextDecoder().decode(files["years/2569/records.json"]));expect(rows[0].eligibility).toBe("unchecked");expect(rows[0].amount).toBe(1800000);
});

// Fictional (สมมติ) category/reference metadata and explicit snapshot replacement.
async function previewRules(page:Page,rules:unknown){
 await page.getByRole("button",{name:"กฎและวิธีใช้งาน",exact:true}).first().click();
 await page.getByLabel("เลือกไฟล์กฎ",{exact:true}).setInputFiles({name:"rules-fictional.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(rules))});
}

test("reviewed ceilings agree across category choice, cards and keyboard-opened conditions",async({page})=>{
 await createZip(page);
 const health=page.locator(".category-card").filter({has:page.getByRole("heading",{name:"ประกันสุขภาพตนเอง",exact:true})});
 await expect(health.locator(".category-limit")).toContainText("25,000 บาท");
 await expect(health.locator(".category-limit")).toContainText("100,000 บาท");
 await health.getByRole("button",{name:"ดูเงื่อนไข ประกันสุขภาพตนเอง",exact:true}).focus();await page.keyboard.press("Enter");
 await expect(page.getByRole("dialog").locator(".category-limit")).toContainText("25,000 บาท");await page.keyboard.press("Escape");
 await page.getByRole("button",{name:"ดูหมวดทั้งหมด",exact:false}).click();
 const chooser=page.getByRole("dialog");await expect(chooser.locator("label").filter({hasText:"ประกันสุขภาพตนเอง"})).toContainText("25,000 บาท");
 await chooser.getByRole("checkbox",{name:/ซื้อและติดตั้งกล้อง CCTV/}).check();await chooser.getByRole("button",{name:"ใช้หมวดที่เลือก",exact:true}).click();
 const pending=page.locator(".category-card").filter({has:page.getByRole("heading",{name:"ซื้อและติดตั้งกล้อง CCTV",exact:true})});
 await expect(pending).toContainText("รอตรวจสอบ · ยังไม่นำมาคำนวณ");await expect(pending.locator(".progress")).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await mkdir("test-results/artifacts",{recursive:true});await page.screenshot({path:"test-results/artifacts/category-limits-mobile.png",fullPage:true});
});

test("bundled rules download is explicit, versioned, cached and never installs itself",async({page,context})=>{
 await createZip(page);await expect(page.getByText("เตรียมไฟล์แอปสำหรับออฟไลน์แล้ว")).toBeVisible({timeout:20000});
 const before=unzipSync(await downloadZip(page));await page.getByRole("button",{name:"กฎและวิธีใช้งาน",exact:true}).first().click();
 const link=page.getByRole("link",{name:"ดาวน์โหลดชุดกฎปี 2569",exact:true});await expect(link).toHaveAttribute("href","./rules/2569.json");
 await context.setOffline(true);const pending=page.waitForEvent("download");await link.click();const file=await pending;
 const rules=JSON.parse(await readFile((await file.path())!,"utf8"));const bundled=JSON.parse(await readFile("public/rules/2569.json","utf8"));expect(rules).toEqual(bundled);
 await expect(page.getByRole("dialog")).toContainText(rules.version);
 const cacheManifest=await readFile("dist/sw.js","utf8");expect(cacheManifest).toContain("./rules/2569.json");
 await page.keyboard.press("Escape");const after=unzipSync(await downloadZip(page));expect(after["years/2569/rules-snapshot.json"]).toEqual(before["years/2569/rules-snapshot.json"]);
});

test("cancel, wrong year and metadata-only rule imports leave the snapshot unchanged",async({page})=>{
 await createZip(page);const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));const before=unzipSync(await downloadZip(page));
 const changed=structuredClone(rules);changed.rules.find((r:any)=>r.id==="health").cap=2000000;
 await previewRules(page,changed);await page.getByRole("button",{name:"ยังไม่เปลี่ยน",exact:true}).click();
 const wrong=structuredClone(rules);wrong.taxYear=2570;await previewRules(page,wrong);await expect(page.getByRole("alert")).toContainText("ชุดกฎไม่ตรงกับปีภาษี");await page.keyboard.press("Escape");
 const metadata=structuredClone(rules);metadata.version="fictional-metadata-only";await previewRules(page,metadata);await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();
 await expect(page.getByText("หลักเกณฑ์ไม่เปลี่ยน ยังคงใช้ชุดกฎเดิม ไม่ได้ติดตั้งรุ่นใหม่",{exact:true})).toBeVisible();
 await expect(page.getByRole("alert")).toHaveCount(0);
 const after=unzipSync(await downloadZip(page));expect(after["years/2569/rules-snapshot.json"]).toEqual(before["years/2569/rules-snapshot.json"]);
});

test("backup failure rejects a rule update without losing records or save state",async({page})=>{
 await createZip(page);await addHealth(page);const before=unzipSync(await downloadZip(page));
 const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));rules.rules.find((r:any)=>r.id==="health").cap=2000000;
 await previewRules(page,rules);
 await page.evaluate(()=>{(window as any).originalObjectUrl=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error("สำรองสมมติล้มเหลว");};});
 await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText("สำรองสมมติล้มเหลว");await expect(page.getByRole("heading",{name:"ตรวจการเปลี่ยนแปลงชุดกฎ",exact:true})).toBeVisible();
 await page.evaluate(()=>{URL.createObjectURL=(window as any).originalObjectUrl;});await page.keyboard.press("Escape");
 await expect(page.getByText("ไม่มีการแก้ไขค้างในหน้านี้",{exact:true})).toBeVisible();
 const after=unzipSync(await downloadZip(page));for(const name of ["records","rules-snapshot"])expect(after[`years/2569/${name}.json`]).toEqual(before[`years/2569/${name}.json`]);
});

test("stale rule preview cannot apply to a newly selected year",async({page})=>{
 await createZip(page);await page.getByRole("button",{name:"เพิ่มปีภาษี",exact:true}).click();await page.getByRole("button",{name:"สร้างแฟ้มปีนี้",exact:true}).click();await page.getByLabel("เลือกปีภาษี",{exact:true}).selectOption("2569");
 const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));rules.rules.find((r:any)=>r.id==="health").cap=2000000;const before=unzipSync(await downloadZip(page));
 await previewRules(page,rules);
 // Simulate a stale async/UI callback despite the browser's modal interaction shield.
 await page.getByLabel("เลือกปีภาษี",{exact:true}).evaluate((select:HTMLSelectElement)=>{select.value="2570";select.dispatchEvent(new Event("change",{bubbles:true}));});
 await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();await expect(page.getByRole("alert")).toContainText("แฟ้มหรือปีเปลี่ยนหลังตรวจชุดกฎ");await page.keyboard.press("Escape");
 await expect(page.getByLabel("เลือกปีภาษี",{exact:true})).toHaveValue("2570");
 const after=unzipSync(await downloadZip(page));for(const year of [2569,2570])expect(after[`years/${year}/rules-snapshot.json`]).toEqual(before[`years/${year}/rules-snapshot.json`]);
});

test("a recorded custom category prevents a public-bundle replacement",async({page})=>{
 await createZip(page);await page.getByRole("button",{name:"ดูหมวดทั้งหมด",exact:false}).click();const chooser=page.getByRole("dialog");
 await chooser.getByLabel("เพิ่มหมวดของฉัน",{exact:false}).fill("หมวดเอกสารสมมติ");await chooser.getByRole("button",{name:"เพิ่มหมวดเอกสาร",exact:true}).click();await chooser.getByRole("button",{name:"ใช้หมวดที่เลือก",exact:true}).click();
 await page.getByRole("button",{name:"เพิ่มรายการ",exact:true}).first().click();await page.getByRole("dialog").getByRole("button",{name:/จ่ายจริงหรือเอกสาร/}).click();const editor=page.getByRole("dialog");
 await editor.getByLabel("หมวด",{exact:true}).selectOption({label:"หมวดเอกสารสมมติ · เก็บเอกสาร / รอยืนยัน"});await editor.getByLabel("ชื่อรายการ",{exact:true}).fill("เอกสารส่วนตัวสมมติ");await editor.getByRole("spinbutton",{name:"จำนวนเงินที่จ่าย",exact:true}).fill("100");await editor.getByRole("button",{name:"บันทึกรายการ",exact:true}).click();
 const before=unzipSync(await downloadZip(page));await previewRules(page,JSON.parse(await readFile("public/rules/2569.json","utf8")));await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();await expect(page.getByRole("alert")).toContainText("ชุดกฎใหม่ลบหมวดที่ยังมีรายการ");await page.keyboard.press("Escape");
 const after=unzipSync(await downloadZip(page));for(const name of ["records","rules-snapshot"])expect(after[`years/2569/${name}.json`]).toEqual(before[`years/2569/${name}.json`]);
});

test("rule update rechecks the year after requesting its backup",async({page})=>{
 await createZip(page);await page.getByRole("button",{name:"เพิ่มปีภาษี",exact:true}).click();await page.getByRole("button",{name:"สร้างแฟ้มปีนี้",exact:true}).click();await page.getByLabel("เลือกปีภาษี",{exact:true}).selectOption("2569");
 const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));rules.rules.find((r:any)=>r.id==="health").cap=2000000;const before=unzipSync(await downloadZip(page));await previewRules(page,rules);
 await page.evaluate(()=>{const original=URL.createObjectURL;(window as any).originalObjectUrl=original;URL.createObjectURL=(blob)=>{const select=document.querySelector<HTMLSelectElement>('select[aria-label="เลือกปีภาษี"]')!;select.value="2570";select.dispatchEvent(new Event("change",{bubbles:true}));return original(blob);};});
 const backup=page.waitForEvent("download");await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();await backup;await expect(page.getByRole("alert")).toContainText("แฟ้มหรือปีเปลี่ยนหลังตรวจชุดกฎ");await page.evaluate(()=>{URL.createObjectURL=(window as any).originalObjectUrl;});await page.keyboard.press("Escape");
 await expect(page.getByLabel("เลือกปีภาษี",{exact:true})).toHaveValue("2570");const after=unzipSync(await downloadZip(page));for(const year of [2569,2570])expect(after[`years/${year}/rules-snapshot.json`]).toEqual(before[`years/${year}/rules-snapshot.json`]);
});

test("rule preview rejects a different workspace without replacing it",async({page})=>{
 await createZip(page);await downloadZip(page);const rules=JSON.parse(await readFile("public/rules/2569.json","utf8"));rules.rules.find((r:any)=>r.id==="health").cap=2000000;await previewRules(page,rules);
 await page.getByRole("button",{name:"ดูตัวอย่างสมมติ",exact:true,includeHidden:true}).evaluate(button=>(button as HTMLButtonElement).click());
 await page.getByRole("button",{name:"สำรองและยืนยันใช้ชุดใหม่",exact:true}).click();await expect(page.getByRole("alert")).toContainText("แฟ้มหรือปีเปลี่ยนหลังตรวจชุดกฎ");await page.keyboard.press("Escape");
 await expect(page.getByText("ข้อมูลตัวอย่างสมมติ · แยกจากแฟ้มจริง")).toBeVisible();const after=unzipSync(await downloadZip(page));const installed=JSON.parse(new TextDecoder().decode(after["years/2569/rules-snapshot.json"]));expect(installed.rules.find((r:any)=>r.id==="health").cap).toBe(2500000);
});
