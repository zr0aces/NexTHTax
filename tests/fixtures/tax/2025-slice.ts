// Independent hand-computed fixtures for the 2025 (ปีภาษี 2568) salary slice.
// Expected values are derived below by hand from the official sources in public/rules/2025/2025-slice-rule2-1.json,
// NOT by calling the engine under test. Units: baht in comments, satang in code (x100).
//
// Rules used (all quoted in the bundle sources):
//   expense     = min(50% x salary, 100,000)                      [Ins90 2568]
//   allowance   = 60,000                                          [PND.91 2568 p.3; FAQ 62777]
//   social sec  = min(paid, 9,000)                                [FAQ 62777, partial]
//   health      = min(paid, 25,000)  (only when no life premium)  [Ins90 2568]
//   taxable     = max(0, salary - expense - allowance - ss - health)
//   bracket tax (taxable income, baht):
//     0-150,000 : 0% | 150,000-300,000 : 5% | 300,000-500,000 : 10% | 500,000-750,000 : 15%
//     750,000-1,000,000 : 20% | 1,000,000-2,000,000 : 25%          [บัญชีอัตราภาษี 2560]

import type { SalaryCaseInput } from "../../../src/domain/tax";
import { parseRuleBundle, type AnyRuleBundle, type RuleBundleV2 } from "../../../src/domain/rules";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BASE_INPUT: SalaryCaseInput = {
  salarySatang: 0,
  socialSecuritySatang: 0,
  healthPremiumSatang: 0,
  otherDeductionClaims: "no",
  otherIncome: "no",
  married: "no",
  elderlyOrDisabled: "no",
  resident: "yes",
  ageAtYearEnd: 40,
  dependentClaimCount: 0,
  withholdingSatang: 0,
};

/** Case 1: salary 600,000. Expense min(300,000; 100,000)=100,000. Taxable 600,000-100,000-60,000=440,000.
 *  Tax = 150,000x5% + 140,000x10% = 7,500 + 14,000 = 21,500 baht. */
export const CASE_SALARY_600K = { input: { ...BASE_INPUT, salarySatang: 600_000_00 }, expectedTaxSatang: 2_150_000, expectedTaxableSatang: 44_000_000 };

/** Case 2: as case 1 plus health paid 30,000 -> capped at 25,000. Taxable 415,000.
 *  Tax = 150,000x5% + 115,000x10% = 7,500 + 11,500 = 19,000 baht. */
export const CASE_HEALTH_CAPPED = { input: { ...BASE_INPUT, salarySatang: 600_000_00, healthPremiumSatang: 30_000_00 }, expectedTaxSatang: 1_900_000 };

/** Case 3: salary 100,000. Expense 50,000. 100,000-50,000-60,000 < 0 -> taxable 0 -> tax 0. */
export const CASE_BELOW_ALLOWANCE = { input: { ...BASE_INPUT, salarySatang: 100_000_00 }, expectedTaxSatang: 0 };

/** Case 4: salary 1,200,000. Expense min(600,000; 100,000)=100,000. Taxable 1,040,000.
 *  Tax = 7,500 + 200,000x10% + 250,000x15% + 250,000x20% + 40,000x25%
 *      = 7,500 + 20,000 + 37,500 + 50,000 + 10,000 = 125,000 baht. */
export const CASE_HIGH_SALARY = { input: { ...BASE_INPUT, salarySatang: 1_200_000_00 }, expectedTaxSatang: 12_500_000 };

/** Case 5: as case 1 plus social security paid 9,000 (at cap). Taxable 431,000.
 *  Tax = 7,500 + 131,000x10% = 7,500 + 13,100 = 20,600 baht. */
export const CASE_SOCIAL_SECURITY = { input: { ...BASE_INPUT, salarySatang: 600_000_00, socialSecuritySatang: 9_000_00 }, expectedTaxSatang: 2_060_000 };

/** Loads the shipped 2025 slice bundle exactly as the app parses it. */
export function shippedBundle(): AnyRuleBundle {
  const path = resolve(process.cwd(), "public/rules/2025/2025-slice-rule2-1.json");
  const bundle = parseRuleBundle(JSON.parse(readFileSync(path, "utf-8")));
  if (!bundle) throw new Error("shipped slice bundle failed validation");
  return bundle;
}

/** TEST-ONLY clone with every blocker lifted so ranking math can be exercised. It is NOT an official rule set and must never ship. */
export function testOnlyTrustedClone(bundle: AnyRuleBundle): RuleBundleV2 {
  if (bundle.schemaVersion !== 2) throw new Error("expected schema 2");
  const components = Object.fromEntries(
    Object.entries(bundle.calculation.components).map(([k, v]) => [k, { ...v, status: "verified" as const }]),
  ) as RuleBundleV2["calculation"]["components"];
  return { ...bundle, officialReviewed: true, calculation: { ...bundle.calculation, roundingVerified: true, components } };
}
