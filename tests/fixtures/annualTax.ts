// Synthetic algorithm fixtures ONLY. Not verified 2026 law; never import from production code.
import { annualRuleSchema, type AnnualRuleBundle } from "../../src/domain/rules";
import { emptyAnnualInputs } from "../../src/domain/annualTax";
import { shippedBundle, testOnlyTrustedClone } from "./tax/2025-slice";
import type { TaxInputs } from "../../src/domain/taxInputs";
import { planFixture } from "./plan";

export const ID = "00000000-0000-4000-8000-000000000099";
export const D = "00000000-0000-4000-8000-000000000098";
export const baht = (value: number) => value * 100;
export function annualInputs(): TaxInputs {
  const t = emptyAnnualInputs();
  t.incomeItems = [{ id: ID, sourceRecordIds: [], kind: "salary", grossAmountSatang: baht(600000), withheldAmountSatang: baht(20000), treatment: "progressive", electionGroup: null }];
  t.facts = { ...t.facts, resident: "yes", married: "no", elderlyOrDisabled: "no", ageAtYearEnd: 40, dependentClaimCount: 0 };
  t.incomeComplete = "yes"; t.withholdingComplete = "yes"; t.deductionsComplete = "yes"; t.finalTaxGroupsComplete = "yes";
  return t;
}
export function annualManifest(inputs: TaxInputs | null = annualInputs()) {
  const m = planFixture();
  m.years = { "2026": { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: inputs, scenarios: [] } };
  m.records = m.records.map((r) => ({ ...r, taxYear: 2026, date: "2026-10-01" }));
  return m;
}
export function syntheticAnnualRules(): AnnualRuleBundle {
  const b = testOnlyTrustedClone(shippedBundle()), source = b.sources[0]!.id;
  const rule = (category: AnnualRuleBundle["annual"]["deductions"][number]["category"], subcategory: AnnualRuleBundle["annual"]["deductions"][number]["subcategory"], cap: number, group: AnnualRuleBundle["annual"]["deductions"][number]["group"], priority: number, percentOfIncome: number | null = null, multiplier: 1 | 2 = 1) => ({ category, subcategory, status: "verified" as const, sourceIds: [source], reason: "synthetic test fixture only", capSatang: baht(cap), percentOfIncome, multiplier, group, priority });
  return annualRuleSchema.parse({ ...b, schemaVersion: 3, taxYear: 2026, version: "synthetic-test-only", annual: {
    rounding: "floor-tax-baht-before-withholding", settlementSourceIds: [source],
    lifeHealthCapSatang: baht(100000), retirementCapSatang: baht(500000), esgCapSatang: baht(300000), specialDonationPercent: 10, generalDonationPercent: 10,
    deductions: [rule("deduction_insurance", "insurance_life", 100000, "life_health", 1), rule("deduction_insurance", "insurance_health", 25000, "life_health", 2), rule("deduction_social_security", null, 9000, "none", 3), rule("deduction_retirement", "fund_provident", 500000, "retirement", 4, 15), rule("deduction_retirement", "fund_rmf", 500000, "retirement", 5, 30), rule("deduction_retirement", "fund_thai_esg", 300000, "esg", 6, 30), rule("donation_conditional", null, 9000000, "special_donation", 7, null, 2), rule("donation_general", null, 9000000, "general_donation", 8)],
  } });
}
