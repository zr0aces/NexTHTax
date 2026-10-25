import { planFixture } from "../fixtures/plan";
import { expect, test, type Page } from "@playwright/test";
async function data(page: Page) {
  return page.evaluate(async () => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    return JSON.parse(await (await (await folder.getFileHandle("data.json")).getFile()).text());
  });
}
test.beforeEach(async ({ page }, info) => {
  await page.addInitScript((name) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, `annual-tax-${info.workerIndex}-${Date.now()}`);
  await page.goto("/");
  await page.getByRole("button", { name: "เลือกโฟลเดอร์ว่างเพื่อเริ่มใหม่" }).click();
  await page.getByLabel(/ชื่อผู้เสียภาษี/).fill("ทดสอบภาษี 2569");
  await page.getByRole("button", { name: "สร้างข้อมูลในโฟลเดอร์นี้" }).click();
});
test("focuses a category list, returns without losing an invalid draft, then cancels incompatible navigation", async ({ page }) => {
  await page.getByRole("button", { name: "เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / RMF", exact: true }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /รายการเอกสาร/ })).toBeFocused();
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้" }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("12.345");
  await page.getByRole("button", { name: "เปลี่ยนหมวด", exact: true }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร ปี/ })).toBeFocused();
  await page.getByRole("button", { name: "กลับรายการเดิม", exact: true }).click();
  await expect(editor.getByLabel(/ยอดตามหลักฐาน/)).toHaveValue("12.345");
  await page.getByRole("button", { name: "เปลี่ยนหมวด", exact: true }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / ThaiESG", exact: true }).click();
  await page.getByRole("button", { name: "กลับรายการเดิม", exact: true }).click();
  await expect(editor.getByLabel(/ยอดตามหลักฐาน/)).toHaveValue("12.345");
  expect((await data(page)).records[0]).toMatchObject({ subcategory: "fund_rmf", evidenceAmountSatang: null });
});
test("selects evidence explicitly, saves and reopens the annual worksheet while keeping production settlement blocked", async ({ page }) => {
  await page.getByRole("button", { name: "เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / RMF", exact: true }).click();
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้" }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("10000");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByLabel("ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)")).toHaveCount(0);
  await page.getByLabel("เลือกเอกสารปีนี้").selectOption({ label: "รอเอกสาร RMF · กองทุนและเงินออมเพื่อเกษียณ / RMF" });
  await page.getByRole("button", { name: "เลือกใช้คำนวณ", exact: true }).click();
  await expect(page.getByLabel("ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)")).toHaveValue("10,000.00");
  await page.getByLabel("ยืนยันว่าจ่ายจริงและเข้าเงื่อนไขสิทธิปีนี้").selectOption("yes");
  await page.getByRole("button", { name: "เพิ่มรายได้กรอกเอง" }).click();
  await page.getByLabel("เงินได้ทั้งปี (บาท)").fill("600000");
  await page.getByLabel("ภาษีหัก ณ ที่จ่าย (บาท)").fill("20000");
  await page.getByLabel("อายุ ณ สิ้นปีภาษี").fill("40");
  await page.getByLabel("จำนวนผู้อยู่ในอุปการะที่ขอหัก").fill("0");
  await page.getByLabel("เป็นผู้มีถิ่นที่อยู่ในไทย").selectOption("yes");
  await page.getByLabel("มีสถานภาพสมรส").selectOption("no");
  await page.getByLabel("อายุ 65 ปีขึ้นไปหรือเป็นคนพิการ").selectOption("no");
  await page.getByRole("checkbox", { name: /ยืนยันว่ามีเฉพาะเงินเดือน/ }).check();
  await page.getByRole("button", { name: "บันทึกข้อมูลภาษี", exact: true }).click();
  await expect(page.getByText("บันทึกข้อมูลภาษีแล้ว กรุณาตรวจและยืนยันข้อมูลล่าสุด", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันข้อมูลที่บันทึกแล้ว", exact: true }).click();
  await expect(page.getByText("ยืนยันแล้วตามข้อมูลที่บันทึก", { exact: true })).toBeVisible();
  await expect(page.getByText(/ยังไม่มีกฎคำนวณรายปี 2569 ที่ครบถ้วน/)).toBeVisible();
  await expect(page.getByText("ประมาณการจ่ายเพิ่ม", { exact: true })).toHaveCount(0);
  const saved = await data(page);
  expect(saved.schemaVersion).toBe(5); expect(saved.years["2026"].taxInputs.deductions[0].sourceRecordIds).toEqual([saved.records[0].id]);
  await page.reload(); await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByLabel("เงินได้ทั้งปี (บาท)")).toHaveValue("600,000.00");
  await expect(page.getByLabel("ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)")).toHaveValue("10,000.00");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/annual-tax-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("9000"); await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByText("ข้อมูลหรือเอกสารเปลี่ยน ต้องตรวจและยืนยันใหม่", { exact: true })).toBeVisible();
});

test("keeps an existing 2026 health plan accessible without flattening its baseline or actuals", async ({ page }) => {
  await page.getByRole("button", { name: "ปิดโฟลเดอร์", exact: true }).click();
  const m = planFixture(), y = m.years["2025"]!;
  m.years = { "2026": { ...y, taxYear: 2026 } };
  m.records = []; m.attachments = {}; m.years["2026"]!.plan!.evidenceRecordId = null;
  await page.evaluate(async (manifest) => {
    const dir = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    const file = await (await dir.getFileHandle("data.json")).createWritable();
    await file.write(JSON.stringify({ ...manifest, schemaVersion: 4 })); await file.close();
  }, m);
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByLabel("เงินได้ทั้งปี (บาท)")).toHaveValue("600,000.00");
  await page.getByRole("button", { name: "แผนสุขภาพเดิม", exact: true }).click();
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("10,000.00");
  await page.getByLabel(/งบประมาณที่จ่ายเพิ่มได้/).fill("12000");
  await page.getByRole("button", { name: "บันทึกแผน", exact: true }).click();
  await expect(page.getByText("บันทึกแผนแล้ว", { exact: true })).toBeVisible();
  const after = await data(page);
  expect(after.schemaVersion).toBe(4);
  expect(after.years["2026"].plan.actualAmountSatang).toBe(800000);
  expect(after.years["2026"].taxInputs).toEqual(y.taxInputs);
});
