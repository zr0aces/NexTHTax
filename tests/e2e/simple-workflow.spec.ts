import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((name) => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle(name, { create: true });
    };
  }, `simple-workflow-${testInfo.workerIndex}-${Date.now()}`);
  await page.goto("/");
  await page.getByRole("button", { name: "เลือกโฟลเดอร์ว่างเพื่อเริ่มใหม่" }).click();
  await page.getByLabel(/ชื่อผู้เสียภาษี/).fill("ผู้ทดสอบ");
  await page.getByRole("button", { name: "สร้างข้อมูลในโฟลเดอร์นี้" }).click();
  await expect(page.getByRole("heading", { name: /คำนวณและวางแผนภาษี/ })).toBeVisible();
});

test("shows one task at a time with shared year selection and accessible tools", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
  await expect(nav.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("combobox", { name: "ปีภาษี", exact: true })).toHaveCount(1);
  await expect(page.getByText("ขอบเขตและข้อควรรู้ก่อนใช้").locator("..")).not.toHaveAttribute("open", "");
  await expect(page.getByText(/ยังไม่แสดงยอดชำระหรือขอคืน/)).toBeVisible();

  await nav.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await expect(page.getByRole("heading", { name: /รายการเอกสาร/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /คำนวณและวางแผนภาษี/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /สรุปปีภาษี/ })).not.toBeVisible();
  await page.getByText(/สรุปเอกสารและความคืบหน้าปี/).click();
  await expect(page.getByRole("heading", { name: /สรุปปีภาษี/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "ปีภาษี", exact: true })).toHaveCount(1);

  await nav.getByRole("button", { name: "เครื่องมือ" }).click();
  await expect(page.getByText("สำรองและกู้คืนข้อมูล", { exact: true })).toBeVisible();
  await expect(page.getByText(/ตรวจสอบและเลือกกฎภาษีปี/)).toBeVisible();
});

test("protects worksheet drafts on navigation and switches years without leaking drafts", async ({ page }) => {
  await page.getByLabel(/เงินเดือนรวมทั้งปี/).fill("600000");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("600000");

  const previousYear = String(Number(await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).inputValue()) - 1);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).selectOption(previousYear);
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("600000");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).selectOption(previousYear);
  await expect(page.getByRole("heading", { name: `คำนวณและวางแผนภาษี ปี ${previousYear}` })).toBeVisible();
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("");
});

test("saves and reopens tax inputs and fits a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel(/เงินเดือนรวมทั้งปี/).fill("600000");
  await page.getByRole("button", { name: "บันทึกข้อมูลภาษี", exact: true }).click();
  await expect(page.getByText("บันทึกข้อมูลภาษีแล้ว ต้องยืนยันใหม่ก่อนใช้ผลคำนวณ")).toBeVisible();
  await page.getByRole("button", { name: "เครื่องมือ" }).click();
  await page.getByRole("button", { name: "คำนวณและวางแผน", exact: true }).click();
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("600,000.00");
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(page.getByLabel(/เงินเดือนรวมทั้งปี/)).toHaveValue("600,000.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/simple-workflow-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "test-results/simple-workflow-desktop.png", fullPage: true });
});

test("saves one plan, protects its draft, and keeps years separate on reopen", async ({ page }) => {
  await page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/).fill("10000");
  await page.getByLabel(/งบประมาณที่จ่ายเพิ่มได้/).fill("10000");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("10000");
  await page.getByRole("button", { name: "บันทึกแผน", exact: true }).click();
  await expect(page.getByText("บันทึกแผนแล้ว", { exact: true })).toBeVisible();
  await expect(page.getByText(/ตามแผนที่บันทึก: ยังประเมินไม่ได้/)).toBeVisible();
  const year = await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).inputValue();
  await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).selectOption(String(Number(year) - 1));
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("");
  await page.getByRole("combobox", { name: "ปีภาษี", exact: true }).selectOption(year);
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("10,000.00");
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/)).toHaveValue("10,000.00");
  await page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/).fill("9000");
  await page.getByRole("button", { name: "บันทึกแผน", exact: true }).click();
  await expect(page.getByText("บันทึกแผนแล้ว", { exact: true })).toBeVisible();
  const count = await page.evaluate(async (y) => {
    const folder = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    const file = await (await folder.getFileHandle("data.json")).getFile();
    return JSON.parse(await file.text()).years[y].scenarios.length;
  }, year);
  expect(count).toBe(1);
});

test("confirms a paid action with verified evidence, then invalidates it when evidence changes", async ({ page }) => {
  await page.getByLabel(/เงินเดือนรวมทั้งปี/).fill("600000");
  await page.getByRole("button", { name: "บันทึกข้อมูลภาษี", exact: true }).click();
  await expect(page.getByText("บันทึกข้อมูลภาษีแล้ว ต้องยืนยันใหม่ก่อนใช้ผลคำนวณ")).toBeVisible();
  await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await page.getByRole("button", { name: "+ เพิ่มรายการ", exact: true }).click();
  const editor = page.getByRole("form", { name: "แก้ไขรายการ" });
  await editor.getByLabel(/^หมวด/).selectOption("deduction_insurance");
  await editor.getByLabel(/ประเภทเอกสารย่อย/).selectOption("insurance_health");
  await editor.getByLabel(/ชื่อรายการ/).fill("หลักฐานตามแผน");
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("8000");
  await editor.getByLabel(/ยอดที่เลือกใช้สิทธิ/).fill("8000");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await editor.locator('input[type="file"]').setInputFiles({ name: "health.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nsynthetic evidence\n%%EOF") });
  await expect(editor.getByText("เพิ่มไฟล์แนบแล้ว", { exact: true })).toBeVisible();
  await editor.getByRole("combobox", { name: /สถานะการตรวจทาน/ }).selectOption("reviewed");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await page.getByRole("button", { name: "คำนวณและวางแผน", exact: true }).click();
  await page.getByLabel(/เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี/).fill("10000");
  await page.getByLabel(/งบประมาณที่จ่ายเพิ่มได้/).fill("10000");
  await page.getByRole("combobox", { name: "สิทธิของรายการ", exact: true }).selectOption("yes");
  await page.getByLabel(/ฉันตรวจและยอมรับเงื่อนไข/).check();
  await page.getByLabel(/ฉันจ่ายยอดนี้ได้/).check();
  await page.getByLabel(/ยอดนี้ยังไม่รวมในข้อมูลภาษีตั้งต้น/).check();
  await page.getByText("ติดตามการชำระและหลักฐาน", { exact: true }).click();
  await page.getByLabel(/ยอดที่จ่ายจริงสำหรับแผนนี้/).fill("8000");
  await page.getByLabel(/ฉันชำระยอดนี้แล้ว/).check();
  await page.getByRole("combobox", { name: "หลักฐานประกันสุขภาพของแผน", exact: true }).selectOption({ label: "หลักฐานตามแผน · ตรวจทานแล้ว" });
  await page.getByRole("button", { name: "ยืนยันทำรายการครบแล้ว", exact: true }).click();
  await expect(page.getByText(/สถานะแผน: ทำรายการครบแล้ว · ความคืบหน้า 1\/1/)).toBeVisible();
  await expect(page.getByText(/จากรายการที่ทำครบแล้ว: ยังประเมินไม่ได้/)).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" }).click();
  await expect(page.getByText(/สถานะแผน: ทำรายการครบแล้ว · ความคืบหน้า 1\/1/)).toBeVisible();
  await page.getByRole("button", { name: "เอกสาร", exact: true }).click();
  await page.getByRole("button", { name: /หลักฐานตามแผน/ }).click();
  await editor.getByLabel(/ยอดตามหลักฐาน/).fill("7000");
  await expect(editor.getByRole("status")).toHaveText("บันทึกแล้ว");
  await page.getByRole("button", { name: "คำนวณและวางแผน", exact: true }).click();
  await expect(page.getByText(/สถานะแผน: ต้องตรวจสอบใหม่ · ความคืบหน้า 0\/1/)).toBeVisible();
});
