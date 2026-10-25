import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync("/home/san/.cache/ms-playwright")) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/home/san/.cache/ms-playwright";
}
if (!process.env.LD_LIBRARY_PATH && existsSync("/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu")) {
  process.env.LD_LIBRARY_PATH = "/home/san/.cache/pw-libs/extracted/usr/lib/x86_64-linux-gnu";
}
export default defineConfig({testDir:"tests/e2e",fullyParallel:false,workers:1,use:{baseURL:"http://127.0.0.1:4173",headless:true,viewport:{width:1440,height:1050}},webServer:{command:"npm run preview -- --port 4173",url:"http://127.0.0.1:4173",reuseExistingServer:true},reporter:"list"});
