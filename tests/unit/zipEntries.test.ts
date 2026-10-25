import { describe, expect, it } from "vitest";
import { ENTRY_PATTERN } from "../../src/transfer/zip";

describe("ZIP entry allowlist", () => {
  it("accepts canonical generated names", () => {
    for (const name of [
      "data.json",
      "attachments/11111111-2222-4333-8444-555555555555.pdf",
      "rules/2026/2026-unreviewed-1.json",
      ".recovery/prev-3-11111111-2222-4333-8444-555555555555.json",
      ".recovery/pending-11111111-2222-4333-8444-555555555555.json",
    ]) {
      expect(ENTRY_PATTERN.test(name)).toBe(true);
    }
  });
  it("rejects traversal, absolute, backslash, nested and foreign names", () => {
    for (const name of [
      "../data.json",
      "/data.json",
      "attachments\\11111111-2222-4333-8444-555555555555.pdf",
      "attachments/../data.json",
      "attachments/evil.pdf",
      "attachments/11111111-2222-4333-8444-555555555555.exe",
      "rules/2026/../../x.json",
      "data.json.bak",
      "C:/data.json",
      "random.txt",
    ]) {
      expect(ENTRY_PATTERN.test(name)).toBe(false);
    }
  });
});
