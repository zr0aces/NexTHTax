import { describe, expect, it } from "vitest";
import { confirmationState, salaryInputFromWorksheet, sourceProjection, worksheetProjection, taxInputsSchema, type TaxInputs } from "../../src/domain/taxInputs";
import type { RecordEntry } from "../../src/domain/schema";

const ID = "00000000-0000-4000-8000-00000000000a";
const rec = (over: Partial<RecordEntry>): RecordEntry => ({
  id: ID, taxYear: 2026, category: "deduction_retirement", subcategory: "fund_rmf", date: "2026-03-01", title: "RMF", issuer: "", notes: "",
  evidenceAmountSatang: 1000, claimedAmountSatang: 1000, withheldAmountSatang: null, status: "reviewed", attachmentIds: [],
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null, ...over,
});
const base: TaxInputs = {
  incomeItems: [], deductions: [],
  facts: { resident: "yes", ageAtYearEnd: 40, elderlyOrDisabled: "no", married: "no", separateFiling: "unknown", spouseHasIncome: "unknown", dependentClaimCount: 0 },
  incomeComplete: "yes", withholdingComplete: "unknown", deductionsComplete: "unknown", finalTaxGroupsComplete: "unknown",
  confirmedSourcesDigest: null, confirmedWorksheetDigest: null,
};

describe("source projection", () => {
  it("changes when a meaningful source field changes and ignores unrelated fields", () => {
    const a = sourceProjection([rec({})], 2026);
    expect(sourceProjection([rec({ claimedAmountSatang: 2000 })], 2026)).not.toBe(a);
    expect(sourceProjection([rec({ subcategory: "fund_thai_esg" })], 2026)).not.toBe(a);
    expect(sourceProjection([rec({ title: "ชื่ออื่น" })], 2026)).toBe(a);
  });
  it("is order-independent and limited to the requested tax year", () => {
    const r1 = rec({ id: "00000000-0000-4000-8000-00000000000b" });
    expect(sourceProjection([rec({}), r1], 2026)).toBe(sourceProjection([r1, rec({})], 2026));
    expect(sourceProjection([rec({ taxYear: 2025 })], 2026)).toBe(sourceProjection([], 2026));
  });
});

describe("worksheet projection and confirmation state", () => {
  const ctx = { taxYear: 2026, sourcesDigest: "a".repeat(64), ruleDigest: null, engineVersion: 1 };
  it("ignores confirmation fields so confirming does not self-invalidate", () => {
    const confirmed = { ...base, confirmedSourcesDigest: "a".repeat(64), confirmedWorksheetDigest: "b".repeat(64) };
    expect(worksheetProjection(confirmed, ctx)).toBe(worksheetProjection(base, ctx));
  });
  it("changes when a substantive worksheet answer changes", () => {
    expect(worksheetProjection({ ...base, facts: { ...base.facts, married: "yes" } }, ctx)).not.toBe(worksheetProjection(base, ctx));
  });
  it("reports unconfirmed, confirmed, then needs-reconfirmation after a source edit", () => {
    const current = { sourcesDigest: "a".repeat(64), worksheetDigest: "b".repeat(64) };
    expect(confirmationState(base, current)).toBe("unconfirmed");
    expect(confirmationState(null, current)).toBe("unconfirmed");
    const confirmed = { ...base, confirmedSourcesDigest: current.sourcesDigest, confirmedWorksheetDigest: current.worksheetDigest };
    expect(confirmationState(confirmed, current)).toBe("confirmed");
    expect(confirmationState(confirmed, { ...current, sourcesDigest: "c".repeat(64) })).toBe("needs-reconfirmation");
  });
  it("rejects a deduction whose broad category is free text", () => {
    const bad = { ...base, deductions: [{ id: ID, sourceRecordIds: [], category: "other", subcategory: null, existingContributionSatang: null, eligibility: "unknown" }] };
    expect(taxInputsSchema.safeParse(bad).success).toBe(false);
  });
});

describe("salaryInputFromWorksheet", () => {
  const salaryItem = (over: Record<string, unknown> = {}) => ({
    id: "00000000-0000-4000-8000-0000000000a1", sourceRecordIds: [], kind: "salary" as const, grossAmountSatang: 60_000_000,
    withheldAmountSatang: 0, treatment: "progressive" as const, electionGroup: null, ...over,
  });
  const health = (amount: number | null, eligibility: "yes" | "no" | "unknown" = "yes") => ({
    id: "00000000-0000-4000-8000-0000000000b1", sourceRecordIds: [], category: "deduction_insurance" as const, subcategory: "insurance_health" as const,
    existingContributionSatang: amount, eligibility,
  });
  const complete: TaxInputs = {
    ...base, incomeItems: [salaryItem()], deductions: [], incomeComplete: "yes", withholdingComplete: "yes", deductionsComplete: "yes", finalTaxGroupsComplete: "yes",
  };
  it("returns null when there is no salary item", () => {
    expect(salaryInputFromWorksheet(null)).toBeNull();
    expect(salaryInputFromWorksheet({ ...complete, incomeItems: [] })).toBeNull();
  });
  it("keeps group sums null until the deduction and withholding groups are confirmed complete", () => {
    const open = salaryInputFromWorksheet({ ...complete, deductionsComplete: "unknown", withholdingComplete: "unknown" });
    expect(open).toMatchObject({ healthPremiumSatang: null, socialSecuritySatang: null, withholdingSatang: null, otherDeductionClaims: "unknown" });
  });
  it("sums health premiums, excludes eligibility no, and flags other claims as unsupported", () => {
    const r = salaryInputFromWorksheet({ ...complete, deductions: [health(1_000_00), health(2_000_00, "no")] });
    expect(r).toMatchObject({ salarySatang: 60_000_000, healthPremiumSatang: 1_000_00, otherDeductionClaims: "no", otherIncome: "no" });
    const other = salaryInputFromWorksheet({ ...complete, deductions: [{ ...health(5_00), category: "deduction_retirement", subcategory: "fund_rmf" }] });
    expect(other?.otherDeductionClaims).toBe("yes");
  });
  it("marks non-salary income and non-progressive treatment as other income", () => {
    expect(salaryInputFromWorksheet({ ...complete, incomeItems: [salaryItem(), { ...salaryItem({ id: "00000000-0000-4000-8000-0000000000a2" }), kind: "domestic-interest" as never }] })?.otherIncome).toBe("yes");
    expect(salaryInputFromWorksheet({ ...complete, incomeItems: [salaryItem({ treatment: "final" })] })?.otherIncome).toBe("yes");
  });
});
