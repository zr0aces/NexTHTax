import { expect, test } from "@playwright/test";

// Headless Chromium only. Native directory picker and branded Chrome/Edge flows need the manual evidence in the plan.

test("entry screen loads without login and makes only same-origin requests", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173/").origin;
  const foreign: string[] = [];
  page.on("request", (req) => {
    if (!req.url().startsWith(origin) && !req.url().startsWith("data:") && !req.url().startsWith("blob:")) foreign.push(req.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "NexTHTax เอกสารภาษีบนเครื่อง" })).toBeVisible();
  await expect(page.getByText("ไม่ต้องสมัครสมาชิก")).toBeVisible();
  await expect(page.getByRole("button", { name: "เปิดโฟลเดอร์ข้อมูลที่มีอยู่" })).toBeEnabled();
  expect(foreign).toEqual([]);
});

test("no taxpayer-related browser persistence is written at entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "NexTHTax เอกสารภาษีบนเครื่อง" })).toBeVisible();
  const storage = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }));
  expect(storage).toEqual({ local: 0, session: 0 });
});

test("app shell works offline after the offline-ready state", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByText("พร้อมใช้งานออฟไลน์แล้ว")).toBeVisible({ timeout: 60_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "NexTHTax เอกสารภาษีบนเครื่อง" })).toBeVisible();
  await context.setOffline(false);
});
