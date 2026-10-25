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
          id: "11111111-2222-4333-8444-555555555555", taxYear: 2026, category: "other", date: "2026-01-02", title: "=cmd",
          issuer: "a,b", notes: "", evidenceAmountSatang: 100, claimedAmountSatang: null, withheldAmountSatang: null,
          status: "waiting-review", attachmentIds: [], createdAt: "x", updatedAt: "x", trashedAt: null,
        },
        {
          id: "66666666-7777-4888-8999-aaaaaaaaaaaa", taxYear: 2025, category: "other", date: "2025-01-02", title: "old",
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
