import { newId, recordSchema, type Attachment, type TaxRecord, type TaxRule, type TaxYearData } from "./model";
import type { Calculation } from "./engine";

/** Fixed annual allowances that the quick-claim UI may set. IDs are the only classification source. */
export const FIXED_ALLOWANCE_IDS = ["spouse", "child", "child-additional", "parents", "disability-care"] as const;
export type FixedAllowanceId = (typeof FIXED_ALLOWANCE_IDS)[number];
export type QuantityKind = "count" | "confirm";

const countIds = new Set<string>(["child", "child-additional", "parents", "disability-care"]);
const MAX_RECORDS = 5000;
const MAX_ATTACHMENTS = 20;

export const isFixedAllowanceId = (id: string): id is FixedAllowanceId => (FIXED_ALLOWANCE_IDS as readonly string[]).includes(id);
/** Engine family IDs whose allowance is cap × qualifyingCount. */
export const isCountedFamily = (id: string) => countIds.has(id);
export const quantityKindOf = (id: string): QuantityKind => countIds.has(id) ? "count" : "confirm";
export const maxQualifyingCount = (ruleId: string, childCount: number) => ruleId === "parents" ? 4 : ruleId === "child-additional" ? childCount : 20;
/** The only copy of the allowance formula: cap × count for count kinds, one cap for confirm kinds. */
export const fixedAllowanceTotal = (ruleId: string, cap: number, quantity: number) => quantityKindOf(ruleId) === "count" ? cap * quantity : cap;
/** Base child count that caps additional children. Only a confirmed base counts, as the engine's countedChildCount does. */
export const additionalCapBase = (baseConfirmed: boolean, baseCount: number | null | undefined) => baseConfirmed ? (baseCount ?? 0) : 0;
/** A count the engine accepts for a counted family. Missing or out-of-range counts stay pending. */
export function countIsUsable(ruleId: string, count: number | undefined, childCount: number): count is number {
  return count !== undefined && count <= maxQualifyingCount(ruleId, childCount);
}
/** The only records the engine counts: confirmed, dated inside the tax year, and active on that date. */
export const isCountableRecord = (record: TaxRecord, rule: TaxRule, year: number) =>
  record.eligibility === "confirmed" && validTaxDate(record.date, year) && isActiveOn(rule, record.date);
const sameSet = (a: string[], b: string[]) => { const x = new Set(a), y = new Set(b); return x.size === y.size && [...x].every(item => y.has(item)); };
export const annualReferenceDate = (year: number) => `${year - 543}-12-31`;
export const yearStartDate = (year: number) => `${year - 543}-01-01`;

/** Same rules the engine has always applied to a record date within a tax year. */
export function validTaxDate(date: string, year: number): boolean {
  return date.startsWith(`${year - 543}-`) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function isActiveOn(rule: TaxRule, date: string): boolean {
  return rule.status === "verified" && date >= rule.effectiveFrom && (rule.effectiveTo === null || date <= rule.effectiveTo);
}
/** Confirmed child records count only when their date is valid; the engine uses the first one. */
export function countedChildCount(records: TaxRecord[], taxYear: number): number {
  return records.find(r => r.categoryId === "child" && r.eligibility === "confirmed" && validTaxDate(r.date, taxYear))?.facts.qualifyingCount ?? 0;
}

/** Quick claim is allowed only for known IDs whose snapshot metadata is a plain per-person/per-claim cap for the whole year. */
export function isAnnualCompatible(rule: TaxRule, year: number): boolean {
  return isFixedAllowanceId(rule.id) && rule.taxYear === year && rule.status === "verified" && rule.kind === "deduction"
    && rule.formula === "paid" && rule.cap !== null && rule.rateBps === null && rule.sharedCap === null && rule.multiplier === 1
    && rule.effectiveFrom <= yearStartDate(year) && (rule.effectiveTo === null || rule.effectiveTo >= annualReferenceDate(year));
}

export type RecordState = "counted" | "duplicate" | "unconfirmed" | "ineligible" | "invalid-date" | "needs-count" | "rule-pending";
export type FixedStatus = "none" | "included" | "pending" | "conflict" | "excluded" | "rule-pending";
export interface FixedRecordView { record: TaxRecord; state: RecordState; }
export interface FixedRow {
  ruleId: string; name: string; quantityKind: QuantityKind | "personal";
  status: FixedStatus;
  /** Record shown as the row's representative: the counted one, else the first non-ineligible one. */
  primary: TaxRecord | null;
  quantity: number | null;
  /** Per-person (count kinds) or per-claim cap from the year snapshot; 0 when the rule is not compatible. */
  rate: number;
  /** Amount the user asked for at current quantity; null when unknown. Not the amount the engine uses. */
  potential: number | null;
  /** Amount the engine actually allowed for this category. */
  included: number;
  /** Records awaiting confirmation or conflict review. Independent of money amounts. */
  pendingRecords: number;
  records: FixedRecordView[];
  /** True when the rule is verified but cannot be used as an annual fixed amount (documents only). */
  unsupported?: boolean;
}

/** Amount the user asked for at the record's current quantity. Null when quantity is missing or invalid. */
export function potentialFor(record: TaxRecord, rule: TaxRule | undefined, state: RecordState | undefined): number | null {
  if (!rule || !isAnnualCompatible(rule, rule.taxYear)) return null;
  if (state === "ineligible") return 0;
  if (state === "needs-count") return null;
  const quantity = quantityKindOf(record.categoryId) === "count" ? record.facts.qualifyingCount : 1;
  return quantity === undefined ? null : fixedAllowanceTotal(record.categoryId, rule.cap ?? 0, quantity);
}

/** Amount the engine counts for one record in a given state. Zero unless the record is counted. */
export function countedAmountOf(record: TaxRecord, rule: TaxRule | undefined, state: RecordState | undefined): number {
  if (!rule || state !== "counted") return 0;
  return fixedAllowanceTotal(record.categoryId, rule.cap ?? 0, record.facts.qualifyingCount ?? 0);
}

/** Classifies each record of fixed categories with the same predicates the engine uses. */
export function classifyFixedRecords(data: TaxYearData): Map<string, RecordState> {
  const year = data.rules.taxYear;
  const childCount = countedChildCount(data.records, year);
  const states = new Map<string, RecordState>();
  for (const id of FIXED_ALLOWANCE_IDS) {
    const rule = data.rules.rules.find(r => r.id === id);
    const compatible = rule && isAnnualCompatible(rule, year) ? rule : undefined;
    const rows = data.records.filter(r => r.categoryId === id);
    const counted = compatible ? rows.find(r => isCountableRecord(r, compatible, year)) : undefined;
    for (const record of rows) {
      if (record.eligibility === "ineligible") { states.set(record.id, "ineligible"); continue; }
      if (!compatible) { states.set(record.id, "rule-pending"); continue; }
      if (record.eligibility !== "confirmed") { states.set(record.id, "unconfirmed"); continue; }
      if (!isCountableRecord(record, compatible, year)) { states.set(record.id, "invalid-date"); continue; }
      if (record !== counted) { states.set(record.id, "duplicate"); continue; }
      const usable = quantityKindOf(id) !== "count" || countIsUsable(id, record.facts.qualifyingCount, childCount);
      states.set(record.id, usable ? "counted" : "needs-count");
    }
  }
  return states;
}

/** One projection for overview, records, prepare and reports. `calc` must be calculate(data) computed once per year. */
export function fixedAllowanceRows(data: TaxYearData, calc: Calculation): FixedRow[] {
  const year = data.rules.taxYear;
  const states = classifyFixedRecords(data);
  const personal = data.rules.rules.find(r => r.id === "personal");
  const rows: FixedRow[] = [{
    ruleId: "personal", name: personal?.name ?? "ส่วนตัว", quantityKind: "personal", status: calc.personal > 0 ? "included" : "rule-pending",
    primary: null, quantity: null, rate: personal?.cap ?? 0, potential: calc.personal, included: calc.personal, pendingRecords: 0, records: [],
  }];
  for (const id of FIXED_ALLOWANCE_IDS) {
    const rule = data.rules.rules.find(r => r.id === id);
    const records = data.records.filter(r => r.categoryId === id).map(record => ({record, state: states.get(record.id) ?? "rule-pending"}));
    const included = calc.categories.find(c => c.ruleId === id)?.allowed ?? 0;
    const count = records.filter(v => v.state === "counted").length;
    const duplicates = records.filter(v => v.state === "duplicate");
    const pending = records.filter(v => v.state === "unconfirmed" || v.state === "invalid-date" || v.state === "needs-count");
    const compatible = Boolean(rule && isAnnualCompatible(rule, year));
    const primaryView = records.find(v => v.state === "counted") ?? records.find(v => v.state !== "ineligible") ?? records[0];
    const primary = primaryView?.record ?? null;
    const quantityKind = quantityKindOf(id);
    const quantity = quantityKind === "count" ? (primary?.facts.qualifyingCount ?? null) : null;
    const potential = primaryView ? potentialFor(primaryView.record, rule, primaryView.state) : null;
    let status: FixedStatus;
    let pendingRecords = 0;
    if (!compatible) status = "rule-pending";
    else if (records.length === 0) status = "none";
    else if (count > 0 && duplicates.length > 0) { status = "conflict"; pendingRecords = duplicates.length; }
    else if (count > 0) status = "included";
    else if (pending.length > 0) { status = "pending"; pendingRecords = pending.length; }
    else status = "excluded";
    rows.push({ ruleId: id, name: rule?.name ?? id, quantityKind, status, primary, quantity, rate: compatible ? (rule?.cap ?? 0) : 0, potential, included, pendingRecords, records, unsupported: !compatible && rule?.status === "verified" });
  }
  return rows;
}

export interface FixedDraft {
  categoryId: FixedAllowanceId;
  /** Required integer for count kinds; must be null for confirm kinds. */
  qualifyingCount: number | null;
  confirmed: boolean;
  checklist: string[];
  newAttachments: Attachment[];
  /** Chosen representative when more than one record exists for the category. */
  canonicalId: string | null;
}

/** Pure annual upsert. Builds one candidate year; throws before anything is committed. */
export function applyFixedDrafts(data: TaxYearData, drafts: FixedDraft[]): TaxYearData {
  const year = data.rules.taxYear;
  const ids = drafts.map(d => d.categoryId);
  if (new Set(ids).size !== ids.length) throw new Error("สิทธิเดียวกันถูกส่งซ้ำในการบันทึกครั้งเดียว");
  const base = drafts.find(d => d.categoryId === "child");
  const additional = drafts.find(d => d.categoryId === "child-additional");
  // Same base the engine counts: a confirmed base draft, or the stored confirmed child when no base draft is sent.
  const baseCount = base ? additionalCapBase(base.confirmed, base.qualifyingCount) : countedChildCount(data.records, year);
  const baseConfirmed = base ? base.confirmed : data.records.some(r => r.categoryId === "child" && r.eligibility === "confirmed");
  if (additional?.confirmed && !baseConfirmed) throw new Error("ต้องยืนยันบุตรพื้นฐานก่อน จึงนำบุตรส่วนเพิ่มมาคำนวณได้");
  if (additional && additional.qualifyingCount !== null && additional.qualifyingCount > baseCount) throw new Error("จำนวนบุตรส่วนเพิ่มต้องไม่มากกว่าจำนวนบุตรที่ยืนยันแล้ว (ยังไม่ยืนยันบุตรพื้นฐานให้ถือเป็น 0 คน) กรุณาแก้จำนวนเอง ระบบไม่ปรับลดให้");

  let records = [...data.records];
  const created: TaxRecord[] = [];
  const selected = [...data.profile.selectedCategories];
  for (const draft of drafts) {
    const rule = data.rules.rules.find(r => r.id === draft.categoryId);
    if (!rule || !isAnnualCompatible(rule, year)) throw new Error("สิทธิประเภทนี้ยังตั้งค่าแบบยอดคงที่ไม่ได้ในปีนี้ กรุณาเก็บเป็นเอกสารแทน");
    const isCount = quantityKindOf(draft.categoryId) === "count";
    const count = draft.qualifyingCount;
    if (isCount) {
      const max = maxQualifyingCount(draft.categoryId, baseCount);
      if (count === null || !Number.isInteger(count) || count < 0 || count > max) throw new Error(`จำนวนผู้เข้าเกณฑ์ต้องเป็นจำนวนเต็มระหว่าง 0 ถึง ${max}`);
      if (draft.confirmed && count < 1) throw new Error("ต้องระบุจำนวนอย่างน้อย 1 คนก่อนยืนยันให้นำสิทธินี้มาคำนวณ");
    } else if (count !== null) {
      throw new Error("สิทธิคู่สมรสไม่ใช้จำนวนผู้รับสิทธิ");
    }
    const rows = records.filter(r => r.categoryId === draft.categoryId);
    if (rows.length > 1 && !draft.canonicalId) throw new Error("พบรายการซ้ำของสิทธินี้ กรุณาเลือกรายการหลักก่อนบันทึก");
    const canonical = draft.canonicalId ? rows.find(r => r.id === draft.canonicalId) : rows[0];
    if (draft.canonicalId && !canonical) throw new Error("รายการหลักที่เลือกไม่อยู่ในแฟ้มแล้ว กรุณาเปิดหน้านี้ใหม่");
    if (canonical && draft.confirmed && !(validTaxDate(canonical.date, year) && isActiveOn(rule, canonical.date))) throw new Error("รายการเดิมมีวันที่ไม่อยู่ในปีภาษี จึงยืนยันจากรายการนี้ไม่ได้ กรุณาตรวจรายการก่อน");
    const attachments = [...(canonical?.attachments ?? []), ...draft.newAttachments];
    if (attachments.length > MAX_ATTACHMENTS) throw new Error("แนบได้ไม่เกิน 20 ไฟล์ต่อรายการ");
    // Only documents this form manages are compared. Stored items outside rule.documents are kept as they are.
    const managed = (item: string) => rule.documents.includes(item);
    const storedChecklist = canonical?.checklist ?? [];
    const chosen = [...new Set(draft.checklist.filter(managed))];
    const documentsChanged = draft.newAttachments.length > 0 || !sameSet(chosen, storedChecklist.filter(managed));
    const checklist = canonical && !documentsChanged ? canonical.checklist : [...new Set([...storedChecklist.filter(item => !managed(item)), ...chosen])];
    const documentStatus = canonical && !documentsChanged ? canonical.documentStatus
      : attachments.length === 0 ? "none" : rule.documents.every(item => checklist.includes(item)) ? "complete" : "partial";
    const eligibility = draft.confirmed ? "confirmed" : canonical?.eligibility === "ineligible" ? "ineligible" : "unchecked";
    const facts = isCount ? {...(canonical?.facts ?? {}), qualifyingCount: count as number} : {...(canonical?.facts ?? {})};
    if (canonical) {
      const next = recordSchema.parse({...canonical, eligibility, checklist, attachments, documentStatus, facts});
      records = records.map(r => r.id === canonical.id ? next : r.categoryId === draft.categoryId && r.eligibility === "confirmed" ? {...r, eligibility: "unchecked"} : r);
    } else {
      const next = recordSchema.parse({id: newId(), categoryId: draft.categoryId, title: rule.name, amount: 0, date: annualReferenceDate(year), eligibleAmount: null, provider: "", reference: "", note: "", documentStatus, eligibility, checklist, attachments, facts});
      created.push(next);
    }
    if (!selected.includes(draft.categoryId)) selected.push(draft.categoryId);
  }
  const next = [...records, ...created];
  if (next.length > MAX_RECORDS) throw new Error("ปีนี้ครบ 5,000 รายการแล้ว กรุณาแยกแฟ้ม");
  return {...data, profile: {...data.profile, selectedCategories: selected}, records: next};
}
