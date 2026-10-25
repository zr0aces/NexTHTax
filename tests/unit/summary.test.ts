import { describe, expect, it } from "vitest";
import { summarizeYear } from "../../src/domain/summary";
import type { RecordEntry } from "../../src/domain/schema";

const UUID = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const rec = (n: number, over: Partial<RecordEntry>): RecordEntry => ({
  id: UUID(n),
  taxYear: 2026,
  category: "deduction_insurance",
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
