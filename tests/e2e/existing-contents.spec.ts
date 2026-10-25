import { expect, test, type Page } from "@playwright/test";
import { planFixture, PLAN_ID, EVIDENCE_ID } from "../fixtures/plan";

async function existingFolder(page: Page, version: 1 | 2, name: string) {
  await page.addInitScript(({ version, name }) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const folder = await root.getDirectoryHandle(name, { create: true });
      try { await folder.getFileHandle("data.json"); }
      catch {
        const file = await folder.getFileHandle("data.json", { create: true });
        const writable = await file.createWritable();
        await writable.write(JSON.stringify({
          schemaVersion: version, workspaceId: "11111111-2222-4333-8444-555555555555", revision: 1,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
          taxpayer: { displayName: "aaa" }, years: {}, records: [], attachments: {},
        }));
        await writable.close();
      }
      return folder;
    };
  }, { version, name });
}

test("opens and edits a saved v2 worksheet instead of a newer empty year, retaining its scenarios", async ({ page }) => {
  await existingFolder(page, 2, `existing-worksheet-${Date.now()}`);
  await page.goto("/");
  const { plan: _plan, ...year } = planFixture().years["2025"]!;
  year.taxInputs!.deductions = [
    { id: PLAN_ID, category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: 0, eligibility: "yes", sourceRecordIds: [] },
    { id: EVIDENCE_ID, category: "deduction_social_security", subcategory: null, existingContributionSatang: 0, eligibility: "yes", sourceRecordIds: [] },
  ];
  // Distinct event IDs are required across income and deductions.
  year.taxInputs!.incomeItems[0]!.id = "00000000-0000-4000-8000-000000000099";
  await page.evaluate(async (savedYear) => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    const file = await folder.getFileHandle("data.json");
    const data = JSON.parse(await (await file.getFile()).text());
    data.years = { "2025": savedYear, "2026": { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] } };
    const writable = await file.createWritable(); await writable.write(JSON.stringify(data)); await writable.close();
  }, year);
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "ปีภาษี", exact: true })).toHaveValue("2025");
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("600,000.00");
  await expect(page.getByRole("button", { name: "บันทึกแผน", exact: true })).toBeDisabled();
  await page.getByLabel(/เงินเดือนรวมทั้งปี/).fill("700000");
  await page.getByRole("button", { name: "บันทึกข้อมูลภาษี", exact: true }).click();
  await expect(page.getByText("บันทึกข้อมูลภาษีแล้ว ต้องยืนยันใหม่ก่อนใช้ผลคำนวณ")).toBeVisible();
  const saved = await page.evaluate(async () => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    return JSON.parse(await (await (await folder.getFileHandle("data.json")).getFile()).text());
  });
  expect(saved.schemaVersion).toBe(2);
  expect(saved.years["2025"].taxInputs.incomeItems[0].grossAmountSatang).toBe(70000000);
  expect(saved.years["2025"].scenarios).toEqual(year.scenarios);
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("700,000.00");
});

test("offers the preserved-original copy upgrade only when the user requests newer features", async ({ page }) => {
  const source = `existing-copy-${Date.now()}`, target = `${source}-upgraded`;
  await existingFolder(page, 1, source);
  await page.goto("/");
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร ปี/ })).toBeVisible();
  const before = await page.evaluate(async (name) => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    return (await (await dir.getFileHandle("data.json")).getFile()).text();
  }, source);
  await page.getByRole("button", { name: "สร้างสำเนาสำหรับคุณสมบัติใหม่", exact: true }).click();
  await expect(page.getByRole("heading", { name: "สร้างสำเนาสำหรับคุณสมบัติใหม่" })).toBeVisible();
  await page.evaluate((name) => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
  }, target);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "สร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่าง", exact: true }).click();
  await expect(page.getByRole("heading", { name: /เลือกหมวดเอกสาร/ })).toBeVisible();
  await page.getByRole("button", { name: "คำนวณภาษี", exact: true }).click();
  const contents = await page.evaluate(async ({ source, target }) => {
    const root = await navigator.storage.getDirectory();
    const read = async (name: string) => (await (await (await root.getDirectoryHandle(name)).getFileHandle("data.json")).getFile()).text();
    return { source: await read(source), target: await read(target) };
  }, { source, target });
  expect(contents.source).toBe(before);
  expect(JSON.parse(contents.target).schemaVersion).toBe(5);
  await expect(page.getByRole("heading", { name: /คำนวณภาษี ปี 2569/ })).toBeVisible();
});

for (const version of [1, 2] as const) {
  test(`opens schema ${version} contents directly, edits them, and reopens without a format change`, async ({ page }, testInfo) => {
    await existingFolder(page, version, `existing-${version}-${testInfo.workerIndex}-${Date.now()}`);
    await page.goto("/");
    await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("heading", { name: "สร้างสำเนาสำหรับคุณสมบัติใหม่" })).toHaveCount(0);
    await expect(page.getByText("aaa", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "การแก้ไขข้อมูลรูปแบบเดิม" })).toContainText(`schema ${version}`);
    await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
    await page.getByRole("button", { name: "แสดงทุกหมวด", exact: true }).click();
    await page.getByRole("button", { name: "+ เพิ่มรายการ", exact: true }).click();
    const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
    await editor.getByLabel(/ชื่อรายการ/).fill("existing content");
    await editor.getByLabel(/หมายเหตุ/).fill("original note");
    await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
    await page.reload();
    await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
    // Old-format records open directly in the editor, not a blank calculator or copy gate.
    await expect(editor.getByLabel(/ชื่อรายการ/)).toHaveValue("existing content");
    await expect(editor.getByLabel(/หมายเหตุ/)).toHaveValue("original note");
    await editor.getByLabel(/หมายเหตุ/).fill("modified existing note");
    await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
    const saved = await page.evaluate(async () => {
      const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
      return JSON.parse(await (await (await folder.getFileHandle("data.json")).getFile()).text());
    });
    expect(saved.schemaVersion).toBe(version);
    expect(saved.records[0].notes).toBe("modified existing note");
    expect(saved.records[0].title).toBe("existing content");
    if (version === 1) expect(saved.records[0]).not.toHaveProperty("subcategory");
    await page.reload();
    await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
    await expect(editor.getByLabel(/หมายเหตุ/)).toHaveValue("modified existing note");
  });
}
