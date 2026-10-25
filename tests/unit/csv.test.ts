import { describe, expect, it } from "vitest";
import { escapeCell, formatPlainBaht, recordsToCsv } from "../../src/transfer/csv";

describe("escapeCell", () => {
  it("neutralizes spreadsheet formula prefixes", () => {
    for (const v of ["=HYPERLINK(\"x\")", "+1", "-2", "@cmd", "\tcmd", " =1+1", "\r=1"]) {
      expect(escapeCell(v).startsWith("'") || escapeCell(v).startsWith("\"'")).toBe(true);
    }
  });
  it("quotes commas, quotes and newlines", () => {
    expect(escapeCell('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
  it("keeps Thai text unchanged", () => {
    expect(escapeCell("เงินเดือน")).toBe("เงินเดือน");
  });
});

describe("formatPlainBaht", () => {
  it("formats satang without float math", () => {
    expect(formatPlainBaht(123405)).toBe("1234.05");
    expect(formatPlainBaht(null)).toBe("");
  });
});

describe("recordsToCsv", () => {
  it("writes BOM, CRLF and only selected-year live records", () => {
    const csv = recordsToCsv(
      [
        {
          id: "11111111-2222-4333-8444-555555555555", taxYear: 2026, category: "other", subcategory: null, date: "2026-01-02", title: "=cmd",
          issuer: "a,b", notes: "", evidenceAmountSatang: 100, claimedAmountSatang: null, withheldAmountSatang: null,
          status: "waiting-review", attachmentIds: [], createdAt: "x", updatedAt: "x", trashedAt: null,
        },
        {
          id: "66666666-7777-4888-8999-aaaaaaaaaaaa", taxYear: 2025, category: "other", subcategory: null, date: "2025-01-02", title: "old",
          issuer: "", notes: "", evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null,
          status: "waiting-review", attachmentIds: [], createdAt: "x", updatedAt: "x", trashedAt: null,
        },
      ],
      2026,
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).not.toContain("old");
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"a,b"');
  });
});

describe("subtype CSV columns", () => {
  const row = (over: Record<string, unknown>) => ({
    id: "11111111-2222-4333-8444-555555555555", taxYear: 2026, category: "other", subcategory: null, date: "2026-01-02", title: "รายการ",
    issuer: "", notes: "", evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null,
    status: "waiting-review" as const, attachmentIds: [], createdAt: "x", updatedAt: "x", trashedAt: null, ...over,
  });
  const lines = (csv: string) => csv.replace("﻿", "").split("\r\n").filter((l) => l !== "");
  it("appends two subtype headers after the ten existing columns", () => {
    const header = lines(recordsToCsv([], 2026))[0]!.split(",");
    expect(header).toHaveLength(12);
    expect(header.slice(10)).toEqual(["รหัสประเภทเอกสารย่อย", "ประเภทเอกสารย่อย"]);
  });
  it("writes ID and label for typed rows, a blank ID with the unclassified label for null, and blanks for other parents", () => {
    const csv = recordsToCsv(
      [
        row({ category: "deduction_retirement", subcategory: "fund_rmf", title: "RMF ปี 2026" }),
        row({ category: "deduction_retirement", subcategory: null, title: "ยังไม่ทราบ" }),
        row({ category: "deduction_insurance", subcategory: "insurance_health", title: "ประกันสุขภาพ" }),
        row({ category: "income_salary", subcategory: null, title: "เงินเดือน" }),
      ],
      2026,
    );
    const body = lines(csv).slice(1).map((l) => l.split(","));
    expect(body.map((cells) => cells.slice(-2))).toEqual([
      ["fund_rmf", "RMF"],
      ["", "ยังไม่ระบุประเภท"],
      ["insurance_health", "ประกันสุขภาพ"],
      ["", ""],
    ]);
  });
  it("keeps subtype text inert against spreadsheet formulas", () => {
    expect(recordsToCsv([row({ category: "deduction_retirement", subcategory: "fund_thai_esg" })], 2026)).not.toMatch(/,=|,\+|,-|,@/);
  });
});
