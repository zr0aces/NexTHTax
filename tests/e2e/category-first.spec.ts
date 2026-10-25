import { expect, test, type Page } from "@playwright/test";
import { planFixture, ATTACHMENT_ID } from "../fixtures/plan";

async function readData(page: Page) {
  return page.evaluate(async () => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    return JSON.parse(await (await (await folder.getFileHandle("data.json")).getFile()).text());
  });
}
const typeButton = (page: Page, label: string) => page.getByRole("button", { name: `เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / ${label}`, exact: true, includeHidden: true });

async function chooseType(page: Page, label: string) {
  await page.getByRole("main").waitFor({ state: "visible" });
  const change = page.getByRole("button", { name: "เปลี่ยนหมวด", exact: true });
  if (await change.isVisible()) await change.click();
  await typeButton(page, label).click();
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((name) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, `category-first-${testInfo.workerIndex}-${Date.now()}`);
  await page.goto("/");
  await page.getByRole("button", { name: "เลือกโฟลเดอร์ว่างเพื่อเริ่มใหม่" }).click();
  await page.getByLabel(/ชื่อผู้เสียภาษี/).fill("ผู้ทดสอบหมวดเอกสาร");
  await page.getByRole("button", { name: "สร้างข้อมูลในโฟลเดอร์นี้" }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร ปี/ })).toBeVisible();
});

test("opens on all categories including empty types, and browsing by keyboard does not write", async ({ page }) => {
  await expect(page.getByRole("button", { name: /^เลือกหมวด / })).toHaveCount(15);
  await expect(page.getByRole("button", { name: /^เลือกประเภท / })).toHaveCount(15);
  const before = await readData(page);
  for (const type of ["RMF", "ThaiESG", "ThaiESGX", "SSF", "LTF", "กองทุนสำรองเลี้ยงชีพ (PVD)", "กบข.", "กอช.", "กองทุนอื่น ๆ"]) {
    await expect(typeButton(page, type)).toBeVisible();
  }
  await typeButton(page, "ThaiESGX").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /รายการเอกสาร/ })).toBeFocused();
  await expect(typeButton(page, "ThaiESGX")).toHaveAttribute("aria-pressed", "true");
  expect(await readData(page)).toEqual(before);
  await expect(page.locator("button button")).toHaveCount(0);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/category-first-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/category-first-desktop.png", fullPage: true });
});

test("adds a ready-classified waiting document, preserves raw draft guards, then reloads its saved contents", async ({ page }) => {
  await chooseType(page, "SSF");
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("fund_ssf");
  await expect(editor.getByLabel(/ชื่อรายการ/)).toHaveValue("รอเอกสาร SSF");
  const initial = await readData(page);
  expect(initial.records).toHaveLength(1);
  expect(initial.records[0]).toMatchObject({ category: "deduction_retirement", subcategory: "fund_ssf", status: "waiting-document", evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, attachmentIds: [] });
  await expect(typeButton(page, "SSF")).toContainText("ยังไม่ทราบยอด 1 รายการ");
  await editor.getByLabel(/ชื่อรายการ/).fill("หนังสือรับรองกองทุนทดสอบ");
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("12345.67");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await expect(typeButton(page, "SSF")).toContainText("ยอดที่ระบุ 12,345.67 บาท");
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("12.345");
  page.once("dialog", (dialog) => dialog.dismiss());
  await chooseType(page, "RMF");
  await expect(typeButton(page, "SSF")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "กลับรายการเดิม", exact: true }).click();
  await expect(editor.getByLabel(/ยอดตามหลักฐาน/)).toHaveValue("12.345");
  page.once("dialog", (dialog) => dialog.accept());
  await chooseType(page, "RMF");
  await expect(editor).toHaveCount(0);
  expect((await readData(page)).records[0].evidenceAmountSatang).toBe(1234567);
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await chooseType(page, "SSF");
  await page.getByRole("button", { name: /หนังสือรับรองกองทุนทดสอบ/ }).click();
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("fund_ssf");
  await expect(editor.getByLabel(/ยอดตามหลักฐาน/)).toHaveValue("12345.67");
  await expect(page.getByRole("heading", { name: /รายการเอกสาร/ })).toBeVisible();
});

test("resets hidden search/status/trash filters and preselects RMF, ThaiESGX and health documents", async ({ page }) => {
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  for (const [label, id] of [["RMF", "fund_rmf"], ["ThaiESGX", "fund_thai_esgx"]] as const) {
    await chooseType(page, label);
    await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
    await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue(id);
    await page.getByRole("searchbox").fill("non-matching");
    await page.getByRole("combobox", { name: "สถานะ", exact: true }).selectOption("reviewed");
    await page.getByRole("button", { name: "ดูถังขยะ", exact: true }).click();
  }
  await page.getByRole("button", { name: "เปลี่ยนหมวด", exact: true }).click();
  await page.getByRole("button", { name: "เลือกประเภท เบี้ยประกัน / ประกันสุขภาพ", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "สถานะ", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("insurance_health");
  expect((await readData(page)).records).toHaveLength(3);
});

test("keeps fund classification and files through review, changes, trash and restore, then purges safely", async ({ page }) => {
  await chooseType(page, "RMF");
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.locator('input[type="file"]').setInputFiles({ name: "fund.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nsynthetic fund evidence\n%%EOF") });
  await expect(editor.getByText("เพิ่มไฟล์แนบแล้ว", { exact: true })).toBeVisible();
  await editor.getByRole("combobox", { name: /สถานะการตรวจทาน/ }).selectOption("reviewed");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await editor.getByLabel(/ประเภทเอกสารย่อย/).selectOption("fund_ltf");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await expect(editor.getByRole("combobox", { name: /สถานะการตรวจทาน/ })).toHaveValue("waiting-review");
  await expect(typeButton(page, "LTF")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "ย้ายไปถังขยะ", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.getByRole("button", { name: "ดูถังขยะ", exact: true }).click();
  await page.getByRole("button", { name: "กู้คืนจากถังขยะ", exact: true }).click();
  await expect(page.getByRole("button", { name: "กู้คืนจากถังขยะ", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "กลับไปรายการ", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("fund_ltf");
  const restored = await readData(page);
  expect(restored.records[0].attachmentIds).toHaveLength(1);
  expect(restored.records[0].trashedAt).toBeNull();
  expect(Object.keys(restored.attachments)).toHaveLength(1);
  await page.getByRole("button", { name: "ย้ายไปถังขยะ", exact: true }).click();
  await page.getByRole("button", { name: "ดูถังขยะ", exact: true }).click();
  await page.getByRole("button", { name: "ลบถาวร", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "ลบรายการถาวร", exact: true }).click();
  await expect(page.getByText(/ลบถาวรแล้ว ไฟล์ที่ลบ:/)).toBeVisible();
  const purged = await readData(page);
  expect(purged.records).toHaveLength(0);
  expect(Object.keys(purged.attachments)).toHaveLength(0);
});

test("keeps a schema-3 health plan editable and preserves its format", async ({ page }) => {
  await page.getByRole("button", { name: "ปิดโฟลเดอร์", exact: true }).click();
  const fixture = planFixture();
  await page.evaluate(async (manifest) => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    const evidence = new TextEncoder().encode("%PDF-1.4\nsynthetic\n%%EOF");
    const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", evidence))].map((v) => v.toString(16).padStart(2, "0")).join("");
    const attachment = Object.values(manifest.attachments)[0]!;
    attachment.byteSize = evidence.length; attachment.sha256 = hash;
    const attachments = await folder.getDirectoryHandle("attachments", { create: true });
    const file = await (await attachments.getFileHandle(attachment.path.split("/")[1]!, { create: true })).createWritable();
    await file.write(evidence); await file.close();
    const data = await (await folder.getFileHandle("data.json")).createWritable();
    await data.write(JSON.stringify({ ...manifest, schemaVersion: 3 })); await data.close();
  }, fixture);
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("10,000.00");
  await expect(page.getByRole("button", { name: "บันทึกแผน", exact: true })).toBeEnabled();
  await page.getByLabel(/งบประมาณที่จ่ายเพิ่มได้/).fill("12000");
  await page.getByRole("button", { name: "บันทึกแผน", exact: true }).click();
  await expect(page.getByText("บันทึกแผนแล้ว", { exact: true })).toBeVisible();
  const saved = await readData(page);
  expect(saved.schemaVersion).toBe(3);
  expect(saved.years["2025"].plan.actualAmountSatang).toBe(800000);
  expect(saved.years["2025"].plan.evidenceRecordId).toBe(fixture.records[0]!.id);
  expect(saved.attachments[ATTACHMENT_ID]).toBeDefined();
  expect(saved.years["2025"].scenarios[0].budgetSatang).toBe(1200000);
});

test("views a new type in schema 3 without writes, and only copies when adding it is requested", async ({ page }) => {
  await page.getByRole("button", { name: "ปิดโฟลเดอร์", exact: true }).click();
  await page.evaluate(async () => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    (window as unknown as { originalFolder: FileSystemDirectoryHandle }).originalFolder = folder;
    const file = await folder.getFileHandle("data.json");
    const data = JSON.parse(await (await file.getFile()).text());
    data.schemaVersion = 3;
    const write = await file.createWritable(); await write.write(JSON.stringify(data)); await write.close();
  });
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  const original = await readData(page);
  await chooseType(page, "SSF");
  expect(await readData(page)).toEqual(original);
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  await expect(page.getByRole("heading", { name: "สร้างสำเนาสำหรับคุณสมบัติใหม่", exact: true })).toBeVisible();
  expect(await readData(page)).toEqual(original);
  await page.getByRole("button", { name: "ยกเลิกการย้ายข้อมูล", exact: true }).click();
  expect(await readData(page)).toEqual(original);
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await chooseType(page, "SSF");
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  await page.evaluate(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(`category-upgraded-${Date.now()}`, { create: true });
  });
  // Stable target handle for further reads, rather than choosing another empty folder on every call.
  await page.evaluate(async () => {
    const target = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => target;
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "สร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่าง", exact: true }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร/ })).toBeVisible();
  expect((await readData(page)).records).toHaveLength(0);
  await chooseType(page, "SSF");
  await page.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้", exact: true }).click();
  await expect(page.getByRole("form", { name: "แก้ไขรายการ" }).getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("fund_ssf");
  expect(await readData(page)).toMatchObject({ schemaVersion: 5, records: [{ category: "deduction_retirement", subcategory: "fund_ssf" }] });
  const source = await page.evaluate(async () => {
    const folder = (window as unknown as { originalFolder: FileSystemDirectoryHandle }).originalFolder;
    return JSON.parse(await (await (await folder.getFileHandle("data.json")).getFile()).text());
  });
  expect(source).toEqual(original);
});
