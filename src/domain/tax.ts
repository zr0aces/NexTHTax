import { numericBlockers, type AnyRuleBundle, type RuleBundleV2 } from "./rules";

// Pure calculator for the 2025 (ปีภาษี 2568) salary slice. Integer satang only, BigInt intermediates, no floats.
// This engine never returns a final tax figure: the rounding rule is not verified yet (see numericBlockers).
// Every output is an estimate under the declared facts and is not a filing.

export type Answer = "yes" | "no" | "unknown";

export interface SalaryCaseInput {
  /** Total reviewed salary income for the year, satang. */
  salarySatang: number;
  /** Social security contributions actually paid, satang. Null = not yet declared. */
  socialSecuritySatang: number | null;
  /** Health insurance premium actually paid, satang. Null = not yet declared. */
  healthPremiumSatang: number | null;
  /** Any life, annuity, fund, donation, credit or other claim. "yes" is outside this slice. */
  otherDeductionClaims: Answer;
  /** Non-salary income or non-progressive salary treatment. "yes" is outside this slice. */
  otherIncome: Answer;
  married: Answer;
  elderlyOrDisabled: Answer;
  resident: Answer;
  ageAtYearEnd: number | null;
  dependentClaimCount: number | null;
  /** Withholding recorded on the salary evidence, satang. Shown as an input only; not settled here. */
  withholdingSatang: number | null;
}

export interface TaxLine {
  id: string;
  labelTh: string;
  amountSatang: number;
  sourceIds: string[];
}

export type SalaryCaseResult =
  | { status: "incomplete"; missing: string[] }
  | { status: "unsupported"; reasons: string[] }
  | {
      status: "intermediate";
      lines: TaxLine[];
      /** Bracket tax before any rounding rule. Not a payable amount. */
      taxBeforeRoundingSatang: number;
      /** True when a satang fraction arose and needs the (unverified) rounding rule. */
      hasUnroundedFraction: boolean;
      blockers: string[];
    };

/** Source IDs come from the bundle component table, never from literals in this module. */
const sourcesFor = (bundle: RuleBundleV2, component: "salary_expense" | "personal_allowance" | "social_security" | "health_insurance"): string[] =>
  [...(bundle.calculation.components[component]?.sourceIds ?? [])];

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Progressive tax on taxable satang. Each band is width × rate / 100; the remainder flags an unrounded fraction. */
export function bracketTaxSatang(taxable: bigint, bundle: RuleBundleV2): { tax: bigint; fraction: boolean } {
  let prev = 0n;
  let numerator = 0n;
  for (const band of bundle.calculation.brackets) {
    if (taxable <= prev) break;
    const top = band.upToSatang === null ? taxable : min(BigInt(band.upToSatang), taxable);
    numerator += (top - prev) * BigInt(band.ratePercent);
    if (band.upToSatang === null) break;
    prev = BigInt(band.upToSatang);
  }
  return { tax: numerator / 100n, fraction: numerator % 100n !== 0n };
}

/** Missing answers are reported as incomplete; out-of-slice facts are unsupported. Nothing defaults to zero. */
export function calculateSalaryCase(bundle: AnyRuleBundle | null, input: SalaryCaseInput): SalaryCaseResult {
  if (!bundle || bundle.schemaVersion !== 2) return { status: "unsupported", reasons: ["ไม่มีตารางตัวเลขในกฎที่ปักไว้"] };

  const missing: string[] = [];
  if (input.resident === "unknown") missing.push("สถานะการอยู่ในประเทศ");
  if (input.married === "unknown") missing.push("สถานภาพสมรส");
  if (input.elderlyOrDisabled === "unknown") missing.push("อายุ 65 ปีขึ้นไปหรือคนพิการ");
  if (input.ageAtYearEnd === null) missing.push("อายุ ณ สิ้นปีภาษี");
  if (input.dependentClaimCount === null) missing.push("จำนวนบุตรหรือผู้อยู่ในอุปการะ");
  if (input.otherDeductionClaims === "unknown") missing.push("รายการลดหย่อนอื่น");
  if (input.otherIncome === "unknown") missing.push("รายได้อื่นนอกจากเงินเดือน");
  if (input.socialSecuritySatang === null) missing.push("เงินสมทบประกันสังคม");
  if (input.healthPremiumSatang === null) missing.push("เบี้ยประกันสุขภาพ");
  if (input.withholdingSatang === null) missing.push("ภาษีหัก ณ ที่จ่าย");
  if (missing.length > 0) return { status: "incomplete", missing };

  const reasons: string[] = [];
  if (input.resident === "no") reasons.push("ผู้ไม่อยู่ในประเทศไทยยังไม่รองรับ");
  if (input.married === "yes") reasons.push("สถานภาพสมรสและคู่สมรสยังไม่รองรับในชุดนี้");
  if (input.elderlyOrDisabled === "yes" || (input.ageAtYearEnd ?? 0) >= 65) reasons.push("อายุ 65 ปีขึ้นไปหรือคนพิการยังไม่รองรับ");
  if ((input.dependentClaimCount ?? 0) > 0) reasons.push("ค่าลดหย่อนบุตรและผู้อยู่ในอุปการะยังไม่รองรับ");
  if (input.otherIncome === "yes") reasons.push("มีรายได้อื่นหรือเงินได้เสียภาษีแบบแยกที่ยังไม่รองรับ");
  if (input.otherDeductionClaims === "yes") reasons.push("มีรายการลดหย่อนอื่นที่ยังไม่รองรับ (เช่น เบี้ยชีวิต กองทุน บริจาค)");
  if (reasons.length > 0) return { status: "unsupported", reasons };

  const c = bundle.calculation;
  const salary = BigInt(input.salarySatang);
  const expenseRaw = (salary * BigInt(c.salaryExpenseRatePercent)) / 100n;
  const expenseFraction = (salary * BigInt(c.salaryExpenseRatePercent)) % 100n !== 0n;
  const expense = min(expenseRaw, BigInt(c.salaryExpenseCapSatang));
  const afterExpense = salary - expense;

  const ssPaid = BigInt(input.socialSecuritySatang ?? 0);
  const ssDeduction = min(ssPaid, BigInt(c.socialSecurityCapSatang));
  const healthPaid = BigInt(input.healthPremiumSatang ?? 0);
  const healthDeduction = min(healthPaid, BigInt(c.healthInsuranceCapSatang));
  const allowance = BigInt(c.personalAllowanceSatang);

  const rawTaxable = afterExpense - allowance - ssDeduction - healthDeduction;
  const taxable = rawTaxable > 0n ? rawTaxable : 0n;
  const { tax, fraction } = bracketTaxSatang(taxable, bundle);

  const lines: TaxLine[] = [
    { id: "salary", labelTh: "เงินเดือนรวม", amountSatang: input.salarySatang, sourceIds: [] },
    { id: "expense", labelTh: "หักค่าใช้จ่ายร้อยละ 50 (ไม่เกินเพดาน)", amountSatang: Number(expense), sourceIds: sourcesFor(bundle, "salary_expense") },
    { id: "after_expense", labelTh: "คงเหลือหลังหักค่าใช้จ่าย", amountSatang: Number(afterExpense), sourceIds: [] },
    { id: "allowance", labelTh: "ค่าลดหย่อนส่วนตัว", amountSatang: Number(allowance), sourceIds: sourcesFor(bundle, "personal_allowance") },
    { id: "social_security", labelTh: "เงินสมทบประกันสังคม (ไม่เกินเพดาน)", amountSatang: Number(ssDeduction), sourceIds: sourcesFor(bundle, "social_security") },
    { id: "health", labelTh: "เบี้ยประกันสุขภาพ (ไม่เกินเพดาน)", amountSatang: Number(healthDeduction), sourceIds: sourcesFor(bundle, "health_insurance") },
    { id: "taxable", labelTh: "เงินได้สุทธิ (ก่อนปัดเศษ)", amountSatang: Number(taxable), sourceIds: [] },
  ];

  const blockers = numericBlockers(bundle);
  const hasUnroundedFraction = fraction || expenseFraction;
  if (hasUnroundedFraction) blockers.push("มีเศษสตางค์จากการคำนวณที่ยังไม่มีกฎการปัด");
  return {
    status: "intermediate",
    lines,
    taxBeforeRoundingSatang: Number(tax),
    hasUnroundedFraction,
    blockers,
  };
}

