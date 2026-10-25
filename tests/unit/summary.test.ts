import { describe, expect, it } from "vitest";
import { summarizeSubcategories, summarizeYear } from "../../src/domain/summary";
import type { RecordEntry } from "../../src/domain/schema";

const UUID = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const rec = (n: number, over: Partial<RecordEntry>): RecordEntry => ({
  id: UUID(n),
  taxYear: 2026,
  category: "deduction_insurance", subcategory: null,
  date: "2026-01-01",
  title: `r${n}`,
  issuer: "",
  notes: "",
  evidenceAmountSatang: null,
  claimedAmountSatang: null,
  withheldAmountSatang: null,
  status: "waiting-review",
  attachmentIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  trashedAt: null,
  ...over,
});

describe("summarizeYear", () => {
  it("separates evidence, claim base and reviewed claim totals", () => {
    const records = [
      rec(1, { evidenceAmountSatang: 10000, claimedAmountSatang: 5000, status: "reviewed" }),
      rec(2, { evidenceAmountSatang: 20000, claimedAmountSatang: 7000, status: "waiting-review" }),
    ];
    const s = summarizeYear(records, 2026);
    expect(s).toMatchObject({ ok: true, evidenceTotal: 30000, claimedTotal: 12000, reviewedClaimedTotal: 5000 });
  });
  it("excludes trashed and excluded records from totals", () => {
    const records = [
      rec(1, { claimedAmountSatang: 100, trashedAt: "2026-02-01T00:00:00.000Z" }),
      rec(2, { claimedAmountSatang: 200, status: "excluded" }),
      rec(3, { claimedAmountSatang: 300 }),
    ];
    const s = summarizeYear(records, 2026);
    expect(s).toMatchObject({ ok: true, claimedTotal: 300, excludedCount: 1, trashedCount: 1 });
  });
  it("keeps unknown claims out of totals and counts them", () => {
    const s = summarizeYear([rec(1, { claimedAmountSatang: null })], 2026);
    expect(s).toMatchObject({ ok: true, claimedTotal: 0, unknownClaimCount: 1 });
  });
  it("never adds withholding to deductions", () => {
    const s = summarizeYear([rec(1, { category: "withholding_50bis", withheldAmountSatang: 500, claimedAmountSatang: null })], 2026);
    expect(s).toMatchObject({ ok: true, withheldTotal: 500, claimedTotal: 0, unknownClaimCount: 0 });
  });
  it("only totals the selected year", () => {
    const s = summarizeYear([rec(1, { taxYear: 2025, claimedAmountSatang: 999 })], 2026);
    expect(s).toMatchObject({ ok: true, claimedTotal: 0 });
  });
  it("reports overflow instead of an incorrect total", () => {
    const big = 9_007_199_254_740_000;
    const s = summarizeYear([rec(1, { claimedAmountSatang: big, status: "reviewed" }), rec(2, { claimedAmountSatang: big })], 2026);
    expect(s).toEqual({ ok: false, error: "overflow" });
  });
});

describe("summarizeSubcategories", () => {
  it("partitions each parent once so child totals add up to the parent without double counting", () => {
    const records = [
      rec(1, { category: "deduction_retirement", subcategory: "fund_rmf", evidenceAmountSatang: 2000, claimedAmountSatang: 1000, status: "reviewed" }),
      rec(2, { category: "deduction_retirement", subcategory: "fund_thai_esg", evidenceAmountSatang: 4000, claimedAmountSatang: 3000 }),
      rec(3, { category: "deduction_retirement", subcategory: null, claimedAmountSatang: null }),
      rec(4, { category: "deduction_insurance", subcategory: "insurance_life", claimedAmountSatang: 500 }),
      rec(5, { category: "income_salary", claimedAmountSatang: 99999 }),
    ];
    const groups = summarizeSubcategories(records, 2026);
    expect(groups.map((g) => g.parent)).toEqual(["deduction_retirement", "deduction_insurance"]);
    const retirement = groups[0]!;
    expect(retirement.summary).toMatchObject({ ok: true, claimedTotal: 4000, evidenceTotal: 6000, reviewedClaimedTotal: 1000, unknownClaimCount: 1 });
    expect(retirement.children.map((c) => c.subcategory)).toEqual(["fund_rmf", "fund_thai_esg", "fund_other", null]);
    const childSum = retirement.children.reduce((n, c) => n + (c.summary.ok ? c.summary.claimedTotal : 0), 0);
    expect(childSum).toBe(4000);
    expect(retirement.children.find((c) => c.subcategory === "fund_other")?.summary).toMatchObject({ ok: true, claimedTotal: 0, unknownClaimCount: 0 });
    expect(retirement.children.find((c) => c.subcategory === null)?.summary).toMatchObject({ ok: true, claimedTotal: 0, unknownClaimCount: 1 });
  });
  it("keeps trashed and excluded records out of every child total", () => {
    const records = [
      rec(1, { category: "deduction_insurance", subcategory: "insurance_life", claimedAmountSatang: 100, trashedAt: "2026-02-01T00:00:00.000Z" }),
      rec(2, { category: "deduction_insurance", subcategory: "insurance_life", claimedAmountSatang: 200, status: "excluded" }),
      rec(3, { category: "deduction_insurance", subcategory: "insurance_life", claimedAmountSatang: 300 }),
    ];
    const life = summarizeSubcategories(records, 2026)[1]!.children.find((c) => c.subcategory === "insurance_life");
    expect(life?.summary).toMatchObject({ ok: true, claimedTotal: 300, excludedCount: 1, trashedCount: 1 });
  });
  it("shows parent overflow as unavailable while each child stays individually summed", () => {
    const big = 9_007_199_254_740_000;
    const group = summarizeSubcategories([
      rec(1, { category: "deduction_retirement", subcategory: "fund_rmf", claimedAmountSatang: big }),
      rec(2, { category: "deduction_retirement", subcategory: "fund_thai_esg", claimedAmountSatang: big }),
    ], 2026)[0]!;
    expect(group.summary).toEqual({ ok: false, error: "overflow" });
    expect(group.children.find((c) => c.subcategory === "fund_rmf")?.summary).toMatchObject({ ok: true, claimedTotal: big });
  });
});
