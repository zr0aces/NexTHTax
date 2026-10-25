import { describe, expect, it } from "vitest";
import { annualInputReasons, calculateAnnualTax } from "../../src/domain/annualTax";
import { annualRuleSchema, parseRuleBundle } from "../../src/domain/rules";
import type { TaxInputs } from "../../src/domain/taxInputs";
import { annualInputs, annualManifest, syntheticAnnualRules, ID, D, baht } from "../fixtures/annualTax";

const calculate = (inputs = annualInputs(), bundle = syntheticAnnualRules()) => calculateAnnualTax({ inputs, bundle, records: [], taxYear: 2026, trusted: true, confirmed: true });
function claim(t: TaxInputs, category: TaxInputs["deductions"][number]["category"], subcategory: TaxInputs["deductions"][number]["subcategory"], amount: number) {
  t.deductions.push({ id: `00000000-0000-4000-8000-${String(t.deductions.length + 1).padStart(12, "0")}`, sourceRecordIds: [], category, subcategory, existingContributionSatang: baht(amount), eligibility: "yes" });
}
describe("annual engine (synthetic rules, not legal signoff)", () => {
  it("settles positive, zero and refund without subtracting withholding from taxable income", () => {
    const t = annualInputs();
    expect(calculate(t)).toMatchObject({ status: "complete", taxableSatang: baht(440000), taxSatang: baht(21500), payableSatang: baht(1500), refundSatang: 0 });
    t.incomeItems[0]!.withheldAmountSatang = baht(21500);
    expect(calculate(t)).toMatchObject({ status: "complete", payableSatang: 0, refundSatang: 0 });
    t.incomeItems[0]!.withheldAmountSatang = baht(30000);
    expect(calculate(t)).toMatchObject({ status: "complete", refundSatang: baht(8500), payableSatang: 0 });
  });
  it("enforces combined life/health and type limits, retaining original requested amounts", () => {
    const t = annualInputs(); claim(t, "deduction_insurance", "insurance_life", 90000); claim(t, "deduction_insurance", "insurance_health", 30000);
    const result = calculate(t);
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(result.lines.map((l) => [l.requestedSatang, l.allowedSatang])).toEqual([[baht(90000), baht(90000)], [baht(30000), baht(10000)]]);
    expect(t.deductions[1]!.existingContributionSatang).toBe(baht(30000));
  });
  it("allocates retirement/shared/percent caps deterministically, independent of input order", () => {
    const t = annualInputs(); t.incomeItems[0]!.grossAmountSatang = baht(2000000);
    claim(t, "deduction_retirement", "fund_rmf", 600000); claim(t, "deduction_retirement", "fund_provident", 300000); claim(t, "deduction_retirement", "fund_thai_esg", 400000);
    const a = calculate(t); t.deductions.reverse(); expect(calculate(t)).toEqual(a);
    expect(a.status).toBe("complete");
    if (a.status === "complete") expect(a.lines.map((l) => l.allowedSatang)).toEqual([baht(300000), baht(200000), baht(300000)]);
  });
  it("applies staged donations once, special donation before general", () => {
    const t = annualInputs(); claim(t, "donation_general", null, 100000); claim(t, "donation_conditional", null, 100000);
    const r = calculate(t); expect(r.status).toBe("complete");
    if (r.status === "complete") {
      expect(r.lines.map((l) => l.allowedSatang)).toEqual([baht(44000), baht(39600)]);
      expect(r.taxableSatang).toBe(baht(356400));
    }
  });
  it("combines repeated same-type claims before applying the cap", () => {
    const t = annualInputs(); claim(t, "deduction_insurance", "insurance_health", 20000); claim(t, "deduction_insurance", "insurance_health", 20000);
    const r = calculate(t); expect(r.status).toBe("complete");
    if (r.status === "complete") expect(r.lines).toMatchObject([{ requestedSatang: baht(40000), allowedSatang: baht(25000) }]);
  });
  it("distinguishes null/zero, rejected eligibility and unknown eligibility", () => {
    const t = annualInputs(); t.incomeItems[0]!.grossAmountSatang = 0; t.incomeItems[0]!.withheldAmountSatang = 0;
    expect(calculate(t)).toMatchObject({ status: "complete", taxSatang: 0 });
    t.incomeItems[0]!.grossAmountSatang = null; expect(calculate(t).status).toBe("blocked");
    const d = annualInputs(); claim(d, "deduction_insurance", "insurance_health", 10000); d.deductions[0]!.eligibility = "unknown"; expect(calculate(d).status).toBe("blocked");
    d.deductions[0]!.eligibility = "no"; expect(calculate(d)).toMatchObject({ status: "complete", lines: [{ allowedSatang: 0 }] });
  });
  it("blocks unsupported products rather than silently zeroing them", () => {
    for (const subtype of ["fund_thai_esgx", "fund_ltf", "fund_ssf", "insurance_annuity"] as const) {
      const t = annualInputs(); claim(t, subtype.startsWith("insurance") ? "deduction_insurance" : "deduction_retirement", subtype, 10000);
      expect(calculate(t).status).toBe("blocked");
    }
  });
  it("blocks missing, wrong-year, untrusted, partial, unconfirmed and incomplete cases", () => {
    const args = { taxYear: 2026, inputs: annualInputs(), records: [], bundle: syntheticAnnualRules(), trusted: true, confirmed: true };
    for (const patch of [{ bundle: null }, { taxYear: 2025 }, { trusted: false }, { confirmed: false }, { bundle: { ...args.bundle, officialReviewed: false } }, { bundle: { ...args.bundle, calculation: { ...args.bundle.calculation, roundingVerified: false } } }]) expect(calculateAnnualTax({ ...args, ...patch }).status).toBe("blocked");
    const t = annualInputs(); t.incomeComplete = "unknown"; expect(calculate(t).status).toBe("blocked");
    t.facts.married = "yes"; expect(calculate(t).status).toBe("blocked");
  });
  it("rejects overflow instead of rounding an unsafe sum", () => {
    const t = annualInputs(); t.incomeItems[0]!.grossAmountSatang = Number.MAX_SAFE_INTEGER;
    t.incomeItems.push({ ...t.incomeItems[0]!, id: D }); expect(calculate(t).status).toBe("blocked");
    const c = annualInputs(); claim(c, "deduction_retirement", "fund_rmf", 1); claim(c, "deduction_retirement", "fund_rmf", 1);
    c.deductions.forEach((d) => { d.existingContributionSatang = Number.MAX_SAFE_INTEGER; }); expect(calculate(c).status).toBe("blocked");
  });
  it("floors final annual tax to baht before subtracting exact withholding", () => {
    const t = annualInputs(); t.incomeItems[0]!.grossAmountSatang = baht(600000) + 99; t.incomeItems[0]!.withheldAmountSatang = baht(21500) + 50;
    expect(calculate(t)).toMatchObject({ status: "complete", taxSatang: baht(21500), refundSatang: 50 });
  });
  it("rejects duplicate, wrong-year, excluded, missing, trashed and reclassified sources", () => {
    const m = annualManifest(), t = annualInputs(), r = m.records[0]!;
    claim(t, "deduction_insurance", "insurance_health", 8000); t.deductions[0]!.sourceRecordIds = [r.id];
    expect(annualInputReasons(t, [r], 2026)).toEqual([]);
    for (const patch of [{ taxYear: 2025 }, { status: "excluded" as const }, { trashedAt: "2026-10-25T00:00:00.000Z" }, { subcategory: "insurance_life" as const }]) expect(annualInputReasons(t, [{ ...r, ...patch }], 2026).length).toBeGreaterThan(0);
    expect(annualInputReasons(t, [], 2026).length).toBeGreaterThan(0);
    t.incomeItems[0]!.sourceRecordIds = [r.id]; expect(annualInputReasons(t, [r], 2026).join()).toContain("ซ้ำ");
    expect(ID).not.toBe(D);
  });
  it("validates annual source references, category alignment and settlement review", () => {
    const b = syntheticAnnualRules(); expect(parseRuleBundle(b)).toEqual(b);
    const bad = structuredClone(b); bad.annual.settlementSourceIds = ["missing"]; expect(annualRuleSchema.safeParse(bad).success).toBe(false);
    const wrong = structuredClone(b); wrong.annual.deductions[0]!.subcategory = "fund_rmf"; expect(annualRuleSchema.safeParse(wrong).success).toBe(false);
    const duplicate = structuredClone(b); duplicate.annual.deductions.push(duplicate.annual.deductions[0]!); expect(annualRuleSchema.safeParse(duplicate).success).toBe(false);
  });
});
