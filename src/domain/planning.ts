import type { Manifest, YearEntry } from "./schema";
import { compareHealthScenarios } from "./scenarios";
import type { AnyRuleBundle } from "./rules";
import { salaryInputFromWorksheet, sourceProjection, worksheetProjection } from "./taxInputs";

export function selectedPlanScenario(year: YearEntry | undefined) {
  return year?.plan ? year.scenarios.find((s) => s.id === year.plan!.scenarioId) ?? null : null;
}

function planConstraintReasons(year: YearEntry | undefined): string[] {
  const plan = year?.plan, scenario = selectedPlanScenario(year), contribution = scenario?.contributions[0];
  if (!plan || !scenario) return ["ยังไม่ได้บันทึกแผน"];
  const reasons: string[] = [];
  if (!plan.baselineExcludesAction) reasons.push("ต้องยืนยันว่ายอดนี้ยังไม่รวมในข้อมูลภาษีตั้งต้น");
  if (contribution?.eligibility !== "yes") reasons.push("ยังไม่ยืนยันสิทธิของรายการ");
  if (contribution?.holdingAccepted !== "yes" || contribution?.liquidityAccepted !== "yes") reasons.push("ยังไม่ยอมรับเงื่อนไขและสภาพคล่อง");
  if (scenario.budgetSatang === null) reasons.push("ยังไม่ระบุงบประมาณ");
  return reasons;
}

/** Completion is an evidence-backed declaration, independent of whether tax rules are verified. */
export function planReviewReasons(manifest: Manifest, taxYear: number): string[] {
  const year = manifest.years[String(taxYear)];
  const plan = year?.plan;
  const scenario = selectedPlanScenario(year);
  if (!plan || !scenario) return ["ยังไม่ได้บันทึกแผน"];
  const reasons = planConstraintReasons(year);
  if (!year.taxInputs) reasons.push("บันทึกข้อมูลภาษีตั้งต้นก่อน");
  if (!plan.paid) reasons.push("ยังไม่ได้ยืนยันการชำระเงิน");
  if (plan.actualAmountSatang === null) reasons.push("ยังไม่ระบุยอดที่จ่ายจริง");
  if (scenario.budgetSatang !== null && plan.actualAmountSatang !== null && plan.actualAmountSatang > scenario.budgetSatang) reasons.push("ยอดจ่ายจริงเกินงบประมาณ");
  const record = manifest.records.find((r) => r.id === plan.evidenceRecordId);
  if (!record || record.taxYear !== taxYear || record.trashedAt !== null || record.status !== "reviewed" || record.subcategory !== "insurance_health" || record.category !== "deduction_insurance") {
    reasons.push("เลือกหลักฐานประกันสุขภาพปีเดียวกันที่ตรวจทานแล้วและไม่อยู่ในถังขยะ");
  } else {
    if (record.evidenceAmountSatang !== plan.actualAmountSatang) reasons.push("ยอดจ่ายจริงต้องตรงกับยอดตามหลักฐาน");
    if (record.attachmentIds.length === 0) reasons.push("หลักฐานต้องมีไฟล์แนบ");
    if (year.taxInputs && [...year.taxInputs.incomeItems, ...year.taxInputs.deductions].some((i) => i.sourceRecordIds.includes(record.id))) reasons.push("หลักฐานนี้รวมอยู่ในข้อมูลภาษีแล้ว ห้ามนับเพิ่มซ้ำ");
  }
  return reasons;
}

/** Hash this bounded projection at the I/O boundary. Confirmation metadata cannot self-invalidate. */
export function planCompletionProjection(manifest: Manifest, taxYear: number): string {
  const year = manifest.years[String(taxYear)];
  const plan = year?.plan;
  const record = manifest.records.find((r) => r.id === plan?.evidenceRecordId);
  return JSON.stringify({
    workspaceId: manifest.workspaceId, taxYear, engineVersion: 1,
    rules: [year?.rulesVersion, year?.rulesDigest],
    worksheet: year?.taxInputs ? worksheetProjection(year.taxInputs, { taxYear, sourcesDigest: "", ruleDigest: year.rulesDigest, engineVersion: 1 }) : null,
    sources: sourceProjection(manifest.records, taxYear),
    scenario: selectedPlanScenario(year),
    action: plan ? { ...plan, completionDigest: null } : null,
    record,
    attachments: record?.attachmentIds.map((id) => manifest.attachments[id]),
  });
}

export function planStatus(manifest: Manifest, taxYear: number, digest: string | null, evidenceVerified: boolean): "planned" | "needs-review" | "completed" {
  const plan = manifest.years[String(taxYear)]?.plan;
  if (!plan) return "planned";
  if (!plan.paid) return planConstraintReasons(manifest.years[String(taxYear)]).length === 0 ? "planned" : "needs-review";
  return digest !== null && evidenceVerified && plan.completionDigest === digest && planReviewReasons(manifest, taxYear).length === 0 ? "completed" : "needs-review";
}

export interface SavingEstimate { outlaySatang: number; savingSatang: number; netCostSatang: number }
export function planEstimates(manifest: Manifest, taxYear: number, bundle: AnyRuleBundle | null, trusted: boolean, baselineConfirmed: boolean, completed: boolean): { projected: SavingEstimate | null; actual: SavingEstimate | null; reasons: string[] } {
  const year = manifest.years[String(taxYear)];
  const scenario = selectedPlanScenario(year);
  const base = salaryInputFromWorksheet(year?.taxInputs ?? null);
  const empty = (reason: string) => ({ projected: null, actual: null, reasons: [reason] });
  if (!scenario || !year?.plan) return empty("บันทึกแผนก่อนเปรียบเทียบ");
  if (!bundle || bundle.taxYear !== taxYear || !trusted) return empty("กฎปีนี้ยังไม่ตรงกับชุดที่ตรวจทานแล้วของแอป ยังไม่แสดงยอดประหยัดภาษี");
  if (!baselineConfirmed || !base) return empty("ยืนยันข้อมูลภาษีตั้งต้นล่าสุดก่อนเปรียบเทียบ");
  if (year.taxInputs?.deductions.some((d) => d.eligibility === "unknown" && d.existingContributionSatang !== 0)) return empty("สิทธิของรายการลดหย่อนตั้งต้นยังไม่ยืนยัน");
  if ([base.salarySatang, base.healthPremiumSatang, base.socialSecuritySatang, base.withholdingSatang].some((n) => n !== null && (!Number.isSafeInteger(n) || n < 0))) return empty("ยอดรวมเกินช่วงที่คำนวณได้อย่างแม่นยำ");
  const item = scenario.contributions[0];
  if (!year.plan.baselineExcludesAction || item?.holdingAccepted !== "yes" || item?.liquidityAccepted !== "yes" || scenario.budgetSatang === null) return empty("ยืนยันยอดเพิ่มเติม งบประมาณ เงื่อนไขและสภาพคล่องก่อนเปรียบเทียบ");
  const reasons: string[] = [];
  const estimate = (amount: number): SavingEstimate | null => {
    if (base.healthPremiumSatang !== null && BigInt(base.healthPremiumSatang) + BigInt(amount) > BigInt(Number.MAX_SAFE_INTEGER)) { reasons.push("ยอดเบี้ยรวมเกินช่วงที่คำนวณได้"); return null; }
    const result = compareHealthScenarios(bundle, base, [{ id: "plan", label: scenario.label, additionalHealthSatang: amount, eligible: item.eligibility }], scenario.budgetSatang);
    if (result.status === "blocked") { reasons.push(...result.reasons); return null; }
    const row = result.rows[0];
    if (!row || row.status !== "complete") { reasons.push(row?.reason ?? "ยังประเมินไม่ได้"); return null; }
    if (row.savingSatang > amount) { reasons.push("ผลประหยัดเกินยอดจ่าย ไม่แสดงผล"); return null; }
    return { outlaySatang: amount, savingSatang: row.savingSatang, netCostSatang: amount - row.savingSatang };
  };
  const projected = estimate(item.additionalContributionSatang);
  const actual = completed && planReviewReasons(manifest, taxYear).length === 0 && year.plan.actualAmountSatang !== null ? estimate(year.plan.actualAmountSatang) : null;
  return { projected, actual, reasons: [...new Set(reasons)] };
}
