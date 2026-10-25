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
}

/** Amount the user asked for at the record's current quantity. Null when quantity is missing or invalid. */
export function potentialFor(record: TaxRecord, rule: TaxRule | undefined, state: RecordState | undefined): number | null {
  if (!rule || !isAnnualCompatible(rule, rule.taxYear)) return null;
  if (state === "ineligible") return 0;
  if (state === "needs-count") return null;
  if (quantityKindOf(record.categoryId) === "confirm") return rule.cap ?? 0;
  const quantity = record.facts.qualifyingCount;
  return quantity === undefined ? null : quantity * (rule.cap ?? 0);
}

/** Classifies each record of fixed categories exactly like the engine's validRows/duplicate rules. */
export function classifyFixedRecords(data: TaxYearData): Map<string, RecordState> {
  const year = data.rules.taxYear;
  const childCount = countedChildCount(data.records, year);
  const states = new Map<string, RecordState>();
  for (const id of FIXED_ALLOWANCE_IDS) {
    const rule = data.rules.rules.find(r => r.id === id);
    const rows = data.records.filter(r => r.categoryId === id);
    let countedSeen = false;
    for (const record of rows) {
      if (record.eligibility === "ineligible") { states.set(record.id, "ineligible"); continue; }
      if (!rule || !isAnnualCompatible(rule, year)) { states.set(record.id, "rule-pending"); continue; }
      if (record.eligibility !== "confirmed") { states.set(record.id, "unconfirmed"); continue; }
      if (!validTaxDate(record.date, year) || !isActiveOn(rule, record.date)) { states.set(record.id, "invalid-date"); continue; }
      if (countedSeen) { states.set(record.id, "duplicate"); continue; }
      countedSeen = true;
      const count = record.facts.qualifyingCount;
      const max = maxQualifyingCount(id, childCount);
      if (quantityKindOf(id) === "count" && (count === undefined || count > max)) states.set(record.id, "needs-count");
      else states.set(record.id, "counted");
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
    rows.push({ ruleId: id, name: rule?.name ?? id, quantityKind, status, primary, quantity, rate: compatible ? (rule?.cap ?? 0) : 0, potential, included, pendingRecords, records });
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
  const storedBase = countedChildCount(data.records, year);
  const baseCount = base ? (base.qualifyingCount ?? 0) : storedBase;
  const baseConfirmed = base ? base.confirmed : data.records.some(r => r.categoryId === "child" && r.eligibility === "confirmed");
  if (additional?.confirmed && !baseConfirmed) throw new Error("ต้องยืนยันบุตรพื้นฐานก่อน จึงนำบุตรส่วนเพิ่มมาคำนวณได้");
  if (additional && additional.qualifyingCount !== null && additional.qualifyingCount > baseCount) throw new Error("จำนวนบุตรส่วนเพิ่มต้องไม่มากกว่าจำนวนบุตรพื้นฐาน กรุณาแก้จำนวนเอง ระบบไม่ปรับลดให้");

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
    const checklist = [...new Set(draft.checklist.filter(item => rule.documents.includes(item)))];
    const documentStatus = attachments.length === 0 ? "none" : rule.documents.every(item => checklist.includes(item)) ? "complete" : "partial";
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
