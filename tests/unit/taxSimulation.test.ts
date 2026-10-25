import { describe, expect, it } from "vitest";
import { calculateAnnualSimulation, calculateAnnualTax } from "../../src/domain/annualTax";
import { SIMULATION_VERSION, simulationAssumptions, simulationTable } from "../../src/domain/taxSimulation";
import { parseRuleBundle } from "../../src/domain/rules";
import { annualInputs, annualManifest, baht, D } from "../fixtures/annualTax";

const run = (inputs = annualInputs(), confirmed = true) => calculateAnnualSimulation({ taxYear: 2026, inputs, records: [], confirmed });
describe("explicit bundled simulation", () => {
  it("identifies the basis/version and computes hand-checked payable, zero and refund cases", () => {
    const t = annualInputs();
    expect(run(t)).toMatchObject({ status: "complete", basis: "simulation", rulesVersion: SIMULATION_VERSION, taxableSatang: baht(440000), taxSatang: baht(21500), payableSatang: baht(1500), refundSatang: 0 });
    t.incomeItems[0]!.withheldAmountSatang = baht(21500); expect(run(t)).toMatchObject({ status: "complete", payableSatang: 0, refundSatang: 0 });
    t.incomeItems[0]!.withheldAmountSatang = baht(30000); expect(run(t)).toMatchObject({ status: "complete", payableSatang: 0, refundSatang: baht(8500) });
    t.incomeItems[0]!.grossAmountSatang = 0; t.incomeItems[0]!.withheldAmountSatang = 0;
    expect(run(t)).toMatchObject({ status: "complete", taxSatang: 0 });
  });
  it("never certifies the table or unlocks the reviewed path, even with a true trusted flag", () => {
    const bundle = simulationTable();
    expect(bundle.officialReviewed).toBe(false); expect(bundle.calculation.roundingVerified).toBe(false);
    expect(bundle.annual.deductions.every((r) => r.status === "partial")).toBe(true);
    expect(parseRuleBundle(bundle)).toEqual(bundle);
    expect(calculateAnnualTax({ taxYear: 2026, inputs: annualInputs(), records: [], bundle, trusted: true, confirmed: true }).status).toBe("blocked");
    bundle.annual.deductions = []; bundle.calculation.brackets[0]!.ratePercent = 100;
    expect(run()).toMatchObject({ status: "complete", taxSatang: baht(21500) });
  });
  it("uses combined life/health, RMF percent, and the disclosed M.33 annual assumption", () => {
    const t = annualInputs();
    t.deductions = [{ id: D, sourceRecordIds: [], category: "deduction_social_security", subcategory: null, existingContributionSatang: baht(20000), eligibility: "yes" }];
    expect(run(t)).toMatchObject({ status: "complete", taxSatang: baht(20450), lines: [{ requestedSatang: baht(20000), allowedSatang: baht(10500) }] });
    t.deductions[0] = { ...t.deductions[0]!, category: "deduction_retirement", subcategory: "fund_rmf", existingContributionSatang: baht(500000) };
    expect(run(t)).toMatchObject({ status: "complete", taxSatang: baht(5500), lines: [{ allowedSatang: baht(180000) }] });
    t.deductions = [
      { ...t.deductions[0]!, category: "deduction_insurance", subcategory: "insurance_life", existingContributionSatang: baht(90000) },
      { ...t.deductions[0]!, id: crypto.randomUUID(), category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: baht(30000) },
    ];
    expect(run(t)).toMatchObject({ status: "complete", taxSatang: baht(11500), lines: [{ allowedSatang: baht(90000) }, { allowedSatang: baht(10000) }] });
    expect(simulationAssumptions().join()).toContain("10,500.00");
  });
  it("retains data, eligibility, completeness, unsupported-case, year and overflow gates", () => {
    expect(run(annualInputs(), false).status).toBe("blocked");
    const t = annualInputs(); t.incomeItems[0]!.grossAmountSatang = null; expect(run(t).status).toBe("blocked");
    for (const field of ["incomeComplete", "withholdingComplete", "deductionsComplete", "finalTaxGroupsComplete"] as const) {
      const incomplete = annualInputs(); incomplete[field] = "unknown"; expect(run(incomplete).status).toBe("blocked");
    }
    const married = annualInputs(); married.facts.married = "yes"; expect(run(married).status).toBe("blocked");
    const otherIncome = annualInputs(); otherIncome.incomeItems[0]!.kind = "domestic-interest"; expect(run(otherIncome).status).toBe("blocked");
    expect(calculateAnnualSimulation({ taxYear: 2025, inputs: annualInputs(), records: [], confirmed: true }).status).toBe("blocked");
    const over = annualInputs(); over.incomeItems[0]!.grossAmountSatang = Number.MAX_SAFE_INTEGER;
    over.incomeItems.push({ ...over.incomeItems[0]!, id: D }); expect(run(over).status).toBe("blocked");
    const eligibility = annualInputs(); eligibility.deductions = [{ id: D, sourceRecordIds: [], category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: 0, eligibility: "unknown" }];
    expect(run(eligibility).status).toBe("blocked");
  });
  it("retains duplicate and invalid source checks", () => {
    const m = annualManifest(), r = m.records[0]!, t = annualInputs();
    t.deductions = [{ id: D, sourceRecordIds: [r.id, r.id], category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: baht(8000), eligibility: "yes" }];
    expect(calculateAnnualSimulation({ taxYear: 2026, inputs: t, records: [r], confirmed: true }).status).toBe("blocked");
    t.deductions[0]!.sourceRecordIds = [r.id];
    for (const patch of [{ taxYear: 2025 }, { trashedAt: "2026-10-25T00:00:00.000Z" }, { status: "excluded" as const }, { subcategory: "insurance_life" as const }]) expect(calculateAnnualSimulation({ taxYear: 2026, inputs: t, records: [{ ...r, ...patch }], confirmed: true }).status).toBe("blocked");
  });
  it("blocks every ambiguous/unsupported selected type instead of omitting it", () => {
    for (const subcategory of ["fund_thai_esgx", "fund_ltf", "fund_ssf", "fund_provident", "fund_gpf", "fund_nsf", "insurance_annuity"] as const) {
      const t = annualInputs(); t.deductions = [{ id: D, sourceRecordIds: [], category: subcategory.startsWith("fund") ? "deduction_retirement" : "deduction_insurance", subcategory, existingContributionSatang: baht(10000), eligibility: "yes" }];
      expect(run(t).status).toBe("blocked");
    }
    const donation = annualInputs(); donation.deductions = [{ id: D, sourceRecordIds: [], category: "donation_general", subcategory: null, existingContributionSatang: baht(1000), eligibility: "yes" }];
    expect(run(donation).status).toBe("blocked");
  });
});
