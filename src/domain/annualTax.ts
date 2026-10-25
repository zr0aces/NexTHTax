import { SIMULATION_VERSION, simulationTable } from "./taxSimulation";
import { categoryLabel, subcategoryLabel } from "./documents";
import { numericBlockers, type AnyRuleBundle } from "./rules";
import { sumSatang } from "./money";
import type { RecordEntry } from "./schema";
import { sourceProjection, taxInputsSchema, type TaxInputs } from "./taxInputs";

export type AnnualResult =
  | { status: "blocked"; reasons: string[] }
  | { status: "complete"; basis: "reviewed" | "simulation"; rulesVersion: string; lines: AnnualDeductionLine[]; salarySatang: number; expenseSatang: number; personalAllowanceSatang: number; taxableSatang: number; taxSatang: number; withheldSatang: number; payableSatang: number; refundSatang: number };
export interface AnnualDeductionLine {
  label: string;
  requestedSatang: number;
  allowedSatang: number;
  reason: string;
}

export function emptyAnnualInputs(): TaxInputs {
  return {
    incomeItems: [], deductions: [],
    facts: { resident: "unknown", ageAtYearEnd: null, elderlyOrDisabled: "unknown", married: "unknown", separateFiling: "unknown", spouseHasIncome: "unknown", dependentClaimCount: null },
    incomeComplete: "unknown", withholdingComplete: "unknown", deductionsComplete: "unknown", finalTaxGroupsComplete: "unknown",
    confirmedSourcesDigest: null, confirmedWorksheetDigest: null,
  };
}

/** Annual review includes descriptive edits too; leave the frozen 2025 confirmation contract unchanged. */
export function annualSourceProjection(records: readonly RecordEntry[], taxYear: number): string {
  const descriptions = records.filter((r) => r.taxYear === taxYear)
    .map((r) => [r.id, r.title, r.issuer, r.notes, r.updatedAt])
    .sort((a, b) => a[0]!.localeCompare(b[0]!, "en"));
  return JSON.stringify([sourceProjection(records, taxYear), descriptions]);
}

/** Recheck source existence, year, active state and classification, not just fingerprint equality. */
export function annualInputReasons(t: TaxInputs, records: readonly RecordEntry[], taxYear: number): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  const ids = new Set<string>();
  const byId = new Map(records.map((r) => [r.id, r]));
  for (const item of [...t.incomeItems, ...t.deductions]) {
    if (ids.has(item.id)) reasons.push("รหัสรายการคำนวณซ้ำ");
    ids.add(item.id);
    for (const id of item.sourceRecordIds) {
      const r = byId.get(id);
      if (seen.has(id)) reasons.push("เอกสารถูกเลือกใช้ซ้ำ");
      seen.add(id);
      if (!r || r.taxYear !== taxYear || r.trashedAt !== null || r.status === "excluded") reasons.push("เอกสารต้นทางหาย ผิดปี อยู่ในถังขยะ หรือไม่นับในสรุป");
      else if ("kind" in item ? item.kind !== "salary" || !["income_salary", "withholding_50bis"].includes(r.category) : r.category !== item.category || r.subcategory !== item.subcategory) reasons.push("ประเภทเอกสารต้นทางไม่ตรงกับรายการคำนวณ กรุณาเลือกใหม่");
    }
  }
  return [...new Set(reasons)];
}

interface AnnualArguments {
  taxYear: number; inputs: TaxInputs | null; records: readonly RecordEntry[];
  bundle: AnyRuleBundle | null; trusted: boolean; confirmed: boolean;
}
/** Reviewed path never accepts unreviewed tables, including the bundled simulation. */
export function calculateAnnualTax(args: AnnualArguments): AnnualResult { return calculateAnnualCase(args, false); }

/** Explicit opt-in uses ONLY the bundled assumptions, never an arbitrary imported unreviewed table. */
export function calculateAnnualSimulation(args: Omit<AnnualArguments, "bundle" | "trusted">): AnnualResult {
  return calculateAnnualCase({ ...args, bundle: simulationTable(), trusted: false }, true);
}

function calculateAnnualCase(args: {
  taxYear: number; inputs: TaxInputs | null; records: readonly RecordEntry[];
  bundle: AnyRuleBundle | null; trusted: boolean; confirmed: boolean;
}, simulation: boolean): AnnualResult {
  const { taxYear, inputs: t, records, bundle, trusted, confirmed } = args;
  const reasons: string[] = [];
  if (taxYear !== 2026) reasons.push("เครื่องคำนวณใหม่นี้รองรับเฉพาะปีภาษี 2569");
  if (!t || !taxInputsSchema.safeParse(t).success) return { status: "blocked", reasons: ["กรอกและบันทึกข้อมูลภาษีก่อน"] };
  if (!confirmed) reasons.push("ยืนยันข้อมูลล่าสุดและตรวจรายการไม่ซ้ำก่อนคำนวณ");
  reasons.push(...annualInputReasons(t, records, taxYear));
  const f = t.facts;
  if (f.resident !== "yes" || f.married !== "no" || f.elderlyOrDisabled !== "no" || f.ageAtYearEnd === null || f.ageAtYearEnd >= 65 || f.dependentClaimCount !== 0 || f.separateFiling === "yes" || f.spouseHasIncome === "yes") reasons.push("รองรับเฉพาะผู้มีถิ่นที่อยู่ในไทย โสด อายุต่ำกว่า 65 ปี ไม่เป็นคนพิการ และไม่มีค่าลดหย่อนผู้อยู่ในอุปการะ กรุณาตรวจสถานะให้ครบ");
  if ([t.incomeComplete, t.withholdingComplete, t.deductionsComplete, t.finalTaxGroupsComplete].some((a) => a !== "yes")) reasons.push("ยืนยันรายได้ ภาษีหัก ณ ที่จ่าย และค่าลดหย่อนให้ครบ รวมถึงไม่ซ้ำกับยอดกรอกเอง");
  if (t.incomeItems.length === 0 || t.incomeItems.some((i) => i.kind !== "salary" || i.treatment !== "progressive" || i.electionGroup !== null)) reasons.push("รองรับเฉพาะรายได้เงินเดือนแบบขั้นบันได ไม่มีรายได้หรือวิธีคำนวณอื่น");
  if (t.incomeItems.some((i) => i.grossAmountSatang === null || i.withheldAmountSatang === null)) reasons.push("ยังไม่ทราบยอดเงินเดือนหรือภาษีหัก ณ ที่จ่าย กรอก 0 หากไม่มีจริง");
  if (t.deductions.some((d) => d.eligibility === "unknown" || (d.eligibility !== "no" && d.existingContributionSatang === null))) reasons.push("ตรวจยอดและยืนยันสิทธิของรายการลดหย่อนแต่ละรายการก่อน");
  if (!bundle || bundle.schemaVersion !== 3 || bundle.taxYear !== taxYear) reasons.push("ยังไม่มีกฎคำนวณรายปี 2569 ที่ครบถ้วน กรุณาตรวจและเลือกกฎในเครื่องมือ ไม่ใช้กฎปีอื่นแทน");
  else if (!simulation) {
    reasons.push(...numericBlockers(bundle));
    if (!trusted) reasons.push("กฎไม่ตรงกับชุดที่แอปตรวจรับจากแหล่งทางการ");
    if (bundle.calculation.components.withholding_settlement?.status !== "verified") reasons.push("กฎชำระภาษีและขอคืนยังไม่ยืนยัน");
  }
  if (reasons.length || !bundle || bundle.schemaVersion !== 3) return { status: "blocked", reasons: [...new Set(reasons)] };

  const salarySum = sumSatang(t.incomeItems.map((i) => i.grossAmountSatang!));
  const withheldSum = sumSatang(t.incomeItems.map((i) => i.withheldAmountSatang!));
  if (!salarySum.ok || !withheldSum.ok) return { status: "blocked", reasons: ["ยอดรวมเกินช่วงที่คำนวณได้อย่างแม่นยำ"] };
  const min = (a: bigint, b: bigint) => a < b ? a : b;
  const max0 = (a: bigint) => a > 0n ? a : 0n;
  const salary = BigInt(salarySum.satang), c = bundle.calculation, a = bundle.annual;
  const expense = min(salary * BigInt(c.salaryExpenseRatePercent) / 100n, BigInt(c.salaryExpenseCapSatang));
  let taxable = max0(salary - expense - BigInt(c.personalAllowanceSatang));
  const lines: AnnualDeductionLine[] = [];
  const totals = new Map<string, bigint>();
  const labelFor = (d: TaxInputs["deductions"][number]) => d.subcategory === null ? categoryLabel(d.category) : subcategoryLabel(d.subcategory);
  for (const d of t.deductions) {
    const label = labelFor(d);
    if (d.eligibility === "no") { lines.push({ label, requestedSatang: d.existingContributionSatang ?? 0, allowedSatang: 0, reason: "ไม่ได้เลือกใช้สิทธิ" }); continue; }
    const key = `${d.category}/${d.subcategory}`;
    const rule = a.deductions.find((r) => `${r.category}/${r.subcategory}` === key);
    if (!rule || (simulation ? rule.status !== "partial" : rule.status !== "verified")) reasons.push(`${label}: ${simulation ? "โหมดจำลองยังไม่รองรับประเภทนี้ ไม่ตัดรายการทิ้งหรือแสดงภาษีทั้งปีที่ไม่ครบ" : rule?.reason || "ยังไม่มีกฎที่ตรวจรับสำหรับประเภทนี้ ไม่รวมเป็นศูนย์เงียบ ๆ"}`);
    const total = (totals.get(key) ?? 0n) + BigInt(d.existingContributionSatang!);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) reasons.push("ยอดค่าลดหย่อนรวมเกินช่วงที่คำนวณได้");
    totals.set(key, total);
  }
  if (reasons.length) return { status: "blocked", reasons: [...new Set(reasons)] };
  // Canonical allocation is rule-owned, independent of document/input ordering.
  const rules = [...a.deductions].sort((x, y) => x.priority - y.priority || `${x.category}/${x.subcategory}`.localeCompare(`${y.category}/${y.subcategory}`, "en"));
  const groups = new Map<string, bigint>([["life_health", BigInt(a.lifeHealthCapSatang)], ["retirement", BigInt(a.retirementCapSatang)], ["esg", BigInt(a.esgCapSatang)]]);
  for (const phase of ["allowance", "special_donation", "general_donation"] as const) {
    const base = taxable;
    if (phase !== "allowance") groups.set(phase, base * BigInt(phase === "special_donation" ? a.specialDonationPercent : a.generalDonationPercent) / 100n);
    for (const r of rules) {
      const donation = r.group === "special_donation" || r.group === "general_donation";
      if (phase === "allowance" ? donation : r.group !== phase) continue;
      const paid = totals.get(`${r.category}/${r.subcategory}`);
      if (paid === undefined) continue;
      let allowed = min(paid * BigInt(r.multiplier), BigInt(r.capSatang));
      if (r.percentOfIncome !== null) allowed = min(allowed, (phase === "allowance" ? salary : base) * BigInt(r.percentOfIncome) / 100n);
      if (r.group !== "none") {
        allowed = min(allowed, groups.get(r.group) ?? 0n);
        groups.set(r.group, (groups.get(r.group) ?? 0n) - allowed);
      }
      allowed = min(allowed, taxable);
      taxable -= allowed;
      lines.push({ label: r.subcategory === null ? categoryLabel(r.category) : subcategoryLabel(r.subcategory), requestedSatang: Number(paid), allowedSatang: Number(allowed), reason: allowed < paid * BigInt(r.multiplier) ? (simulation ? "จำกัดตามเพดานสมมติ วงเงินร่วม หรือเงินได้คงเหลือ" : "จำกัดตามเพดานรายประเภท วงเงินร่วม หรือเงินได้คงเหลือ") : simulation ? "ตามสมมติฐานจำลอง ยังไม่ตรวจรับสิทธิ" : r.multiplier === 2 ? "ใช้ตัวคูณตามกฎที่ตรวจรับแล้ว" : "ตามยอดที่ยืนยันและกฎที่ตรวจรับแล้ว" });
    }
  }
  // Keep fractional band arithmetic until final tax; never round each band separately.
  let previous = 0n, numerator = 0n;
  for (const band of c.brackets) {
    if (taxable <= previous) break;
    const top = band.upToSatang === null ? taxable : min(taxable, BigInt(band.upToSatang));
    numerator += (top - previous) * BigInt(band.ratePercent);
    if (band.upToSatang === null) break;
    previous = BigInt(band.upToSatang);
  }
  const tax = numerator / 10000n * 100n;
  const balance = tax - BigInt(withheldSum.satang);
  return { status: "complete", basis: simulation ? "simulation" : "reviewed", rulesVersion: simulation ? SIMULATION_VERSION : bundle.version, lines, salarySatang: salarySum.satang, expenseSatang: Number(expense), personalAllowanceSatang: c.personalAllowanceSatang, taxableSatang: Number(taxable), taxSatang: Number(tax), withheldSatang: withheldSum.satang, payableSatang: Number(max0(balance)), refundSatang: Number(max0(-balance)) };
}
