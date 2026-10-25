import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";

// All evidence and values are fictional (สมมติ). Artifacts go to test-results/artifacts/.
const artifacts = "test-results/artifacts";
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

async function createZip(page: Page) {
 await page.goto("/");
 await page.getByRole("button", {name: /สร้างแฟ้มภาษีใหม่/}).first().click();
 await page.getByRole("button", {name: /ใช้แฟ้ม ZIP/}).click();
 await expect(page.getByRole("heading", {name: /จัดแฟ้มวันนี้/})).toBeVisible();
}
async function downloadZip(page: Page) {
 const pending = page.waitForEvent("download");
 await page.getByRole("button", {name: "ส่งออก ZIP", exact: true}).click();
 const download = await pending;
 return await readFile((await download.path())!);
}
const panelRow = (page: Page, name: string) => page.locator("li.fixed-row").filter({has: page.getByRole("heading", {name, exact: true})});
async function openFixed(page: Page, name: string, button = "เลือกและตั้งค่า") {
 await panelRow(page, name).getByRole("button", {name: new RegExp(button)}).click();
 return page.getByRole("dialog");
}
const records = (bytes: Uint8Array) => JSON.parse(decode(unzipSync(bytes)["years/2569/records.json"]));

test("child and additional claims are set from the overview without payment fields and survive ZIP reopen", async ({page}) => {
 const requests: {url: string; method: string; data: string | null}[] = [];
 page.on("request", r => requests.push({url: r.url(), method: r.method(), data: r.postData()}));
 await createZip(page);
 const modal = await openFixed(page, "บุตร");
 await expect(modal.getByRole("heading", {name: /ตั้งค่าสิทธิบุตรที่เข้าเงื่อนไข/})).toBeVisible();
 await expect(modal.getByLabel("ชื่อรายการ")).toHaveCount(0);
 await expect(modal.getByLabel("วันที่จ่าย")).toHaveCount(0);
 await expect(modal.getByText(/ยังไม่นำมาคำนวณ/).first()).toBeVisible();
 await modal.getByRole("spinbutton", {name: "บุตรที่เข้าเงื่อนไข", exact: true}).fill("2");
 await expect(modal.getByText("2 คน × 30,000 บาท = 60,000 บาท")).toBeVisible();
 await modal.getByRole("checkbox", {name: /ตรวจเงื่อนไขแล้ว ให้นำสิทธินี้มาคำนวณ/}).check();
 await modal.getByRole("spinbutton", {name: "บุตรที่เข้าเกณฑ์ส่วนเพิ่ม", exact: true}).fill("1");
 await modal.getByRole("checkbox", {name: /ตรวจเงื่อนไขส่วนเพิ่มแล้ว/}).check();
 await modal.getByRole("button", {name: "บันทึกสิทธิ", exact: true}).click();
 await expect(modal).not.toBeVisible();
 await expect(panelRow(page, "บุตร").getByText("นำมาคำนวณแล้ว")).toBeVisible();
 await expect(panelRow(page, "บุตร").getByText(/นำมาคำนวณ .*60,000/)).toBeVisible();
 await expect(panelRow(page, "บุตรส่วนเพิ่ม").getByText(/นำมาคำนวณ .*30,000/)).toBeVisible();

 const bytes = await downloadZip(page);
 const saved = records(bytes);
 expect(saved).toHaveLength(2);
 for (const r of saved) {
  expect(r.amount).toBe(0);
  expect(r.eligibleAmount).toBeNull();
  expect(r.date).toBe("2026-12-31");
  expect(r.eligibility).toBe("confirmed");
 }
 expect(saved.map((r: {categoryId: string; facts: {qualifyingCount: number}}) => [r.categoryId, r.facts.qualifyingCount]).sort()).toEqual([["child", 2], ["child-additional", 1]]);
 await page.reload();
 await page.getByLabel("เลือกแฟ้ม ZIP", {exact: true}).setInputFiles({name: "fixed-backup.zip", mimeType: "application/zip", buffer: bytes});
 await expect(panelRow(page, "บุตร").getByText("นำมาคำนวณแล้ว")).toBeVisible();
 expect(requests.every(r => r.method === "GET" && r.data === null && (r.url.startsWith("http://127.0.0.1:4173/") || r.url.startsWith("blob:http://127.0.0.1:4173/")))).toBe(true);
 expect(requests.some(r => r.url.includes("สมมติ"))).toBe(false);
});

test("parents cancel leaves no claim and a later save creates one annual claim with no payment date", async ({page}) => {
 await createZip(page);
 let modal = await openFixed(page, "บิดามารดา");
 await modal.getByRole("spinbutton", {name: "บิดามารดาที่เข้าเกณฑ์", exact: true}).fill("2");
 await modal.getByRole("button", {name: "ยกเลิก", exact: true}).click();
 await expect(modal).not.toBeVisible();
 await expect(panelRow(page, "บิดามารดา").getByText("ยังไม่ได้ตั้งค่า", {exact: true}).first()).toBeVisible();

 modal = await openFixed(page, "บิดามารดา", "เลือกและตั้งค่า");
 await expect(modal.getByRole("button", {name: "บันทึกสิทธิ", exact: true})).toBeEnabled();
 await modal.getByRole("spinbutton", {name: "บิดามารดาที่เข้าเกณฑ์", exact: true}).fill("0");
 await modal.getByRole("button", {name: "บันทึกสิทธิ", exact: true}).click();
 await expect(modal).not.toBeVisible();
 await expect(panelRow(page, "บิดามารดา").getByText("ยอดตามจำนวนที่ระบุ — ยังไม่นำมาคำนวณ")).toHaveCount(0);
 const bytes = await downloadZip(page);
 expect(records(bytes)).toHaveLength(1);
 expect(records(bytes)[0]).toMatchObject({categoryId: "parents", amount: 0, eligibility: "unchecked", date: "2026-12-31"});
});

test("generic add asks the kind first and fixed routing from the paid form keeps its draft unless the user confirms", async ({page}) => {
 await createZip(page);
 await page.getByRole("button", {name: "เพิ่มรายการ", exact: true}).first().click();
 const chooser = page.getByRole("dialog");
 await expect(chooser.getByRole("heading", {name: "เพิ่มรายการใหม่"})).toBeVisible();
 await chooser.getByRole("button", {name: /จ่ายจริงหรือเอกสาร/}).click();
 let editor = page.getByRole("dialog");
 await expect(editor.getByLabel("ชื่อรายการ", {exact: true})).toBeVisible();
 await editor.getByLabel("ชื่อรายการ", {exact: true}).fill("ทดสอบร่างรายการจ่าย (สมมติ)");
 page.once("dialog", d => d.dismiss());
 await editor.getByLabel("หมวด", {exact: true}).selectOption("spouse");
 await expect(editor.getByLabel("ชื่อรายการ", {exact: true})).toHaveValue("ทดสอบร่างรายการจ่าย (สมมติ)");
 page.once("dialog", d => d.accept());
 await editor.getByLabel("หมวด", {exact: true}).selectOption("spouse");
 const composer = page.getByRole("dialog");
 await expect(composer.getByRole("heading", {name: /ตั้งค่าสิทธิคู่สมรสไม่มีเงินได้/})).toBeVisible();
 await expect(composer.getByLabel("ชื่อรายการ", {exact: true})).toHaveCount(0);
});

test("future year with unconfirmed rules shows the pending state and cannot save a claim", async ({page}) => {
 await createZip(page);
 await page.getByRole("button", {name: "เพิ่มปีภาษี", exact: true}).click();
 await page.getByRole("button", {name: "สร้างแฟ้มปีนี้"}).click();
 await expect(page.getByText("กฎภาษีปีนี้ยังไม่ยืนยัน จัดเก็บเอกสารได้ แต่ยังไม่รับรองวงเงินและภาษี")).toBeVisible();
 await expect(panelRow(page, "บุตร").getByText("กฎปีนี้ยังไม่ยืนยัน")).toBeVisible();
 const modal = await openFixed(page, "บุตร", "แก้ไขสิทธิ");
 await expect(modal.getByText("กฎปีนี้ยังไม่ยืนยัน ตั้งค่าสิทธินี้ยังไม่ได้")).toBeVisible();
 await expect(modal.getByRole("button", {name: "บันทึกสิทธิ", exact: true})).toBeDisabled();
});

test("legacy duplicate children need an explicit canonical choice, back up first, and keep every record", async ({page}) => {
 await createZip(page);
 const bytes = await downloadZip(page);
 const files = unzipSync(bytes);
 const common = {categoryId: "child", amount: 0, date: "2026-12-31", eligibleAmount: null, provider: "", reference: "", note: "", documentStatus: "none", eligibility: "confirmed", checklist: [], attachments: []};
 const first = {...common, id: randomUUID(), title: "บุตรรายการเดิม A (สมมติ)", facts: {qualifyingCount: 1}};
 const second = {...common, id: randomUUID(), title: "บุตรรายการเดิม B (สมมติ)", facts: {qualifyingCount: 2}};
 files["years/2569/records.json"] = new TextEncoder().encode(JSON.stringify([first, second], null, 2));
 const legacy = zipSync(files);
 await page.reload();
 await page.getByLabel("เลือกแฟ้ม ZIP", {exact: true}).setInputFiles({name: "legacy.zip", mimeType: "application/zip", buffer: Buffer.from(legacy)});
 await expect(panelRow(page, "บุตร").getByText("รายการซ้ำ ต้องเลือกรายการหลัก")).toBeVisible();

 const modal = await openFixed(page, "บุตร", "แก้ไขสิทธิ");
 const save = modal.getByRole("button", {name: "สำรอง ZIP แล้วบันทึก", exact: true});
 await expect(save).toBeDisabled();
 await modal.getByRole("radio").nth(1).check();
 await expect(modal.getByRole("spinbutton", {name: "บุตรที่เข้าเงื่อนไข", exact: true})).toHaveValue("2");
 const backup = page.waitForEvent("download");
 await expect(save).toBeEnabled();
 await save.click();
 const backupDownload = await backup;
 expect(backupDownload.suggestedFilename()).toBe("tax-before-fixed-2569.zip");
 await expect(modal).not.toBeVisible();
 const after = records(await downloadZip(page));
 const byId = new Map(after.map((r: {id: string}) => [r.id, r]));
 expect(after).toHaveLength(2);
 expect(byId.get(second.id)).toMatchObject({eligibility: "confirmed", facts: {qualifyingCount: 2}, title: second.title});
 expect(byId.get(first.id)).toMatchObject({eligibility: "unchecked", facts: {qualifyingCount: 1}, title: first.title});
});

test("CSV, index and print PDF keep the claim separate from paid expenses", async ({page}) => {
 await mkdir(artifacts, {recursive: true});
 await createZip(page);
 const modal = await openFixed(page, "คู่สมรสไม่มีเงินได้");
 await modal.getByRole("checkbox", {name: /ตรวจเงื่อนไขแล้ว ให้นำสิทธินี้มาคำนวณ/}).check();
 await modal.getByRole("button", {name: "บันทึกสิทธิ", exact: true}).click();
 await expect(modal).not.toBeVisible();
 await page.getByRole("button", {name: "เตรียมยื่นภาษี", exact: true}).click();
 const csvPending = page.waitForEvent("download");
 await page.getByRole("button", {name: /รายการทั้งหมด CSV/}).click();
 const csv = await readFile((await (await csvPending).path())!, "utf8");
 expect(csv.split("\n")[0]).toContain("ประเภท");
 expect(csv).toContain("สิทธิคงที่ (ไม่ใช่รายจ่าย)");
 expect(csv).not.toContain("2026-12-31");
 await page.emulateMedia({media: "print"});
 await expect(page.locator(".print-report")).toBeVisible();
 await expect(page.locator(".print-report").getByText("สิทธิประจำปี ไม่ใช่รายจ่าย")).toBeAttached();
 await page.pdf({path: `${artifacts}/fixed-allowance.pdf`, format: "A4", printBackground: true});
 await page.emulateMedia({media: "screen"});
 const index = unzipSync(await downloadZip(page))["index.html"];
 const html = decode(index);
 expect(html).toContain("สิทธิประจำปี ไม่ใช่รายจ่าย");
 expect(html).not.toContain("<td>2026-12-31</td>");
});

test("fixed composer and panel stay usable at 390px and 1440px with screenshots", async ({page}) => {
 await mkdir(artifacts, {recursive: true});
 await page.setViewportSize({width: 1440, height: 1050});
 await createZip(page);
 await expect(page.locator("li.fixed-row").first()).toBeVisible();
 await page.screenshot({path: `${artifacts}/fixed-allowance-desktop-1440.png`, fullPage: true});
 let modal = await openFixed(page, "บุตร");
 await page.screenshot({path: `${artifacts}/fixed-allowance-composer-desktop-1440.png`});
 await modal.getByRole("button", {name: "ยกเลิก", exact: true}).click();

 await page.setViewportSize({width: 390, height: 844});
 await createZip(page);
 await expect(page.locator("li.fixed-row").first()).toBeVisible();
 const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
 expect(overflow).toBeLessThanOrEqual(1);
 await page.screenshot({path: `${artifacts}/fixed-allowance-mobile-390.png`, fullPage: true});
 modal = await openFixed(page, "บุตร");
 const stepperButton = modal.getByRole("button", {name: "เพิ่มบุตรที่เข้าเงื่อนไข"});
 const box = await stepperButton.boundingBox();
 expect(box && box.width >= 44 && box.height >= 44).toBe(true);
 await page.keyboard.press("Escape");
 await expect(modal).not.toBeVisible();
});

test("category chooser omits fixed allowances but keeps document categories", async ({page}) => {
 await createZip(page);
 await page.getByRole("button", {name: /ดูหมวดทั้งหมด/}).click();
 const dialog = page.getByRole("dialog");
 await expect(dialog.locator(".category-choice").first()).toBeVisible();
 for (const name of ["บุตร", "บิดามารดา", "คู่สมรส"]) await expect(dialog.locator(".category-choice strong", {hasText: new RegExp(`^${name}`)})).toHaveCount(0);
});
