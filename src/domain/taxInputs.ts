import { z } from "zod";
import { MAX_SAFE_SATANG } from "./money";
import { SUBCATEGORY_IDS } from "./documents";
import type { RecordEntry } from "./schema";
import type { Answer, SalaryCaseInput } from "./tax";

// Input contracts and confirmation fingerprints. Tax math lives in tax.ts and only produces estimates.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const digest = z.string().regex(/^[0-9a-f]{64}$/).nullable();
const satang = z.number().int().min(0).max(MAX_SAFE_SATANG);
const answer = z.enum(["yes", "no", "unknown"]);
const text = z.string().max(200).regex(/^[^\u0000-\u001f\u007f]*$/);
const sourceIds = z.array(uuid).max(200);

export const taxInputsSchema = z.strictObject({
  incomeItems: z.array(z.strictObject({
    id: uuid,
    sourceRecordIds: sourceIds,
    kind: z.enum(["salary", "domestic-interest", "domestic-dividend"]),
    grossAmountSatang: satang.nullable(),
    withheldAmountSatang: satang.nullable(),
    treatment: z.enum(["progressive", "final", "exempt", "unknown"]),
    electionGroup: text.nullable(),
  })).max(2000),
  deductions: z.array(z.strictObject({
    id: uuid,
    sourceRecordIds: sourceIds,
    category: z.enum(["deduction_retirement", "deduction_insurance", "deduction_social_security"]),
    subcategory: z.enum(SUBCATEGORY_IDS).nullable(),
    existingContributionSatang: satang.nullable(),
    eligibility: answer,
  })).max(2000),
  facts: z.strictObject({
    resident: answer,
    ageAtYearEnd: z.number().int().min(0).max(130).nullable(),
    elderlyOrDisabled: answer,
    married: answer,
    separateFiling: answer,
    spouseHasIncome: answer,
    dependentClaimCount: z.number().int().min(0).max(100).nullable(),
  }),
  incomeComplete: answer,
  withholdingComplete: answer,
  deductionsComplete: answer,
  finalTaxGroupsComplete: answer,
  confirmedSourcesDigest: digest,
  confirmedWorksheetDigest: digest,
});

export const taxScenarioSchema = z.strictObject({
  id: uuid,
  label: text.min(1),
  budgetSatang: satang.nullable(),
  contributions: z.array(z.strictObject({
    subcategory: z.enum(SUBCATEGORY_IDS),
    additionalContributionSatang: satang,
    eligibility: answer,
    holdingAccepted: answer,
    liquidityAccepted: answer,
    riskAccepted: answer,
  })).max(SUBCATEGORY_IDS.length),
  confirmedChoiceDigest: digest,
}).superRefine((s, ctx) => {
  const ids = s.contributions.map((c) => c.subcategory);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "ประเภทในแผนซ้ำ" });
});

export type TaxInputs = z.infer<typeof taxInputsSchema>;
export type TaxScenario = z.infer<typeof taxScenarioSchema>;

/** Canonical source projection: only fields that change what the worksheet is based on. Sorted by record ID. */
export function sourceProjection(records: readonly RecordEntry[], taxYear: number): string {
  const rows = records
    .filter((r) => r.taxYear === taxYear)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((r) => [
      r.id, r.taxYear, r.date, r.category, r.subcategory, r.status, r.trashedAt !== null,
      r.claimedAmountSatang, r.evidenceAmountSatang, r.withheldAmountSatang, [...r.attachmentIds].sort(),
    ]);
  return JSON.stringify(rows);
}

/** Canonical worksheet projection. Confirmation fields and timestamps are excluded so confirming cannot invalidate itself. */
export function worksheetProjection(
  t: TaxInputs,
  ctx: { taxYear: number; sourcesDigest: string; ruleDigest: string | null; engineVersion: number },
): string {
  return JSON.stringify({
    ctx,
    incomeItems: t.incomeItems,
    deductions: t.deductions,
    facts: t.facts,
    completeness: [t.incomeComplete, t.withholdingComplete, t.deductionsComplete, t.finalTaxGroupsComplete],
  });
}

export type ConfirmationState = "unconfirmed" | "confirmed" | "needs-reconfirmation";

/** Fingerprints detect drift only. They do not prove the user consented; imported matching hashes are never trusted. */
export function confirmationState(
  t: TaxInputs | null,
  current: { sourcesDigest: string; worksheetDigest: string },
): ConfirmationState {
  if (!t || (t.confirmedSourcesDigest === null && t.confirmedWorksheetDigest === null)) return "unconfirmed";
  if (t.confirmedSourcesDigest === current.sourcesDigest && t.confirmedWorksheetDigest === current.worksheetDigest) return "confirmed";
  return "needs-reconfirmation";
}

/**
 * Maps persisted worksheet data to the calculator input. Returns null when the salary itself is not entered.
 * Completeness flags gate every sum: an unconfirmed group stays null (unknown), never zero.
 */
export function salaryInputFromWorksheet(t: TaxInputs | null): SalaryCaseInput | null {
  if (!t) return null;
  const salaryItems = t.incomeItems.filter((i) => i.kind === "salary");
  const grosses = salaryItems.map((i) => i.grossAmountSatang);
  if (salaryItems.length === 0 || grosses.some((g) => g === null)) return null;
  const salary = grosses.reduce<number>((n, g) => n + (g ?? 0), 0);

  const otherIncomeItems = t.incomeItems.length - salaryItems.length;
  const nonProgressive = salaryItems.some((i) => i.treatment !== "progressive");
  const otherIncome: Answer =
    otherIncomeItems > 0 || nonProgressive ? "yes" : t.incomeComplete === "yes" ? "no" : "unknown";

  const claimed = (subcategory: string | null, category: string) =>
    t.deductions.filter((d) => d.category === category && d.subcategory === subcategory && d.eligibility !== "no");
  const sumAmounts = (items: { existingContributionSatang: number | null }[]): number | null => {
    if (t.deductionsComplete !== "yes") return null;
    if (items.some((d) => d.existingContributionSatang === null)) return null;
    return items.reduce<number>((n, d) => n + (d.existingContributionSatang ?? 0), 0);
  };
  const healthItems = claimed("insurance_health", "deduction_insurance");
  const ssItems = t.deductions.filter((d) => d.category === "deduction_social_security" && d.eligibility !== "no");
  const otherItems = t.deductions.filter(
    (d) => d.eligibility !== "no" && !(d.category === "deduction_insurance" && d.subcategory === "insurance_health") && d.category !== "deduction_social_security",
  );
  const otherDeductionClaims: Answer = otherItems.length > 0 ? "yes" : t.deductionsComplete === "yes" ? "no" : "unknown";

  const withheldValues = salaryItems.map((i) => i.withheldAmountSatang);
  const withheldSatang =
    t.withholdingComplete !== "yes" || withheldValues.some((w) => w === null)
      ? null
      : withheldValues.reduce<number>((n, w) => n + (w ?? 0), 0);

  return {
    salarySatang: salary,
    socialSecuritySatang: sumAmounts(ssItems),
    healthPremiumSatang: sumAmounts(healthItems),
    otherDeductionClaims,
    otherIncome,
    married: t.facts.married,
    elderlyOrDisabled: t.facts.elderlyOrDisabled,
    resident: t.facts.resident,
    ageAtYearEnd: t.facts.ageAtYearEnd,
    dependentClaimCount: t.facts.dependentClaimCount,
    withholdingSatang: withheldSatang,
  };
}
