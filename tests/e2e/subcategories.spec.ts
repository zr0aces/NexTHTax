import { expect, test, type Page } from "@playwright/test";

// Headless Chromium only. The native folder picker is replaced by an Origin Private File System folder so the
// real App flow (create, edit, autosave, reopen) runs unchanged. Branded Chrome/Edge and the native picker remain manual checks.

let counter = 0;

async function stubFolderPicker(page: Page): Promise<void> {
  const folder = `e2e-subtype-${Date.now()}-${counter++}`;
  await page.addInitScript((name: string) => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    };
  }, folder);
}

async function createWorkspaceWithRecord(page: Page, title: string, category: string, subtype: string): Promise<void> {
  await stubFolderPicker(page);
  await page.goto("/");
  await page.getByRole("button", { name: "เลือกโฟลเดอร์ว่างเพื่อเริ่มใหม่" }).click();
  await page.getByLabel(/ชื่อผู้เสียภาษี/).fill("ผู้ทดสอบ");
  await page.getByRole("button", { name: "สร้างข้อมูลในโฟลเดอร์นี้" }).click();
  await page.getByRole("button", { name: "เพิ่มรายการ" }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.getByLabel(/^หมวด/).selectOption(category);
  await editor.getByLabel(/ประเภทเอกสารย่อย/).selectOption(subtype);
  await editor.getByLabel(/ชื่อรายการ/).fill(title);
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
}

async function reopenFolder(page: Page): Promise<void> {
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(page.getByRole("heading", { name: "รายการเอกสาร" })).toBeVisible();
}

test("a saved subtype survives reload and reopen", async ({ page }) => {
  await createWorkspaceWithRecord(page, "กองทุน ThaiESG ทดสอบ", "deduction_retirement", "fund_thai_esg");
  await reopenFolder(page);
  await page.getByRole("button", { name: /กองทุน ThaiESG ทดสอบ/ }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("fund_thai_esg");
});

test("a parent change clears the subtype and search matches the subtype label", async ({ page }) => {
  await createWorkspaceWithRecord(page, "ใบยืนยันการซื้อ", "deduction_retirement", "fund_rmf");
  const search = page.getByRole("searchbox");
  await search.fill("rmf");
  await expect(page.getByRole("button", { name: /ใบยืนยันการซื้อ/ })).toBeVisible();
  await search.fill("");

  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.getByLabel(/^หมวด/).selectOption("deduction_insurance");
  await expect(editor.getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");

  await reopenFolder(page);
  await page.getByRole("button", { name: /ใบยืนยันการซื้อ/ }).click();
  await expect(page.getByRole("form", { name: "แก้ไขรายการ" }).getByLabel(/ประเภทเอกสารย่อย/)).toHaveValue("");
});
