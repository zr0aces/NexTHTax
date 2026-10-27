import bundled from "../../public/rules/2569.json";
import { ruleSetSchema, yearSchema, type RuleSet } from "./model";

/** Validation checks structure and invariants, not the legal authority of an imported file. */
export function importRules(raw: unknown, year: number): RuleSet {
  yearSchema.parse(year);
  const set = ruleSetSchema.parse(raw);
  if (set.taxYear !== year) throw new Error("ชุดกฎไม่ตรงกับปีภาษีที่เลือก");
  const ids = new Set<string>();
  for (const rule of set.rules) {
    if (rule.taxYear !== year || ids.has(rule.id)) throw new Error("ปีภาษีหรือรหัสสิทธิในชุดกฎซ้ำ/ไม่ถูกต้อง");
    ids.add(rule.id);
    if (rule.sharedCap && !Object.hasOwn(set.sharedCaps,rule.sharedCap) && !(rule.sharedCap === "donation-special" && rule.formula === "donation" && rule.multiplier === 2)) throw new Error("ไม่พบวงเงินร่วมของสิทธิ");
    const isDate = (date:string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date;
    if (!isDate(rule.effectiveFrom) || (rule.effectiveTo !== null && !isDate(rule.effectiveTo))) throw new Error("วันที่สิทธิไม่มีอยู่จริง");
    if (rule.status === "verified" && rule.kind !== "documents" && (!isDate(rule.reviewedAt) || !rule.version.trim())) throw new Error("สิทธิยืนยันต้องมีวันที่ตรวจสอบและรุ่นกฎ");
    const from = Date.parse(rule.effectiveFrom);
    const to = rule.effectiveTo === null ? Infinity : Date.parse(rule.effectiveTo);
    if (!Number.isFinite(from) || to < from || Number.isNaN(to)) throw new Error("ช่วงวันที่ของสิทธิไม่ถูกต้อง");
    if (rule.status === "verified" && rule.kind !== "documents" && !rule.sources.length) throw new Error("สิทธิยืนยันแล้วต้องมีแหล่งอ้างอิง");
    if (rule.formula === "fixed" && rule.id !== "personal") throw new Error("รุ่นนี้รองรับสิทธิพื้นฐานอัตโนมัติเฉพาะส่วนตัว");
    if (rule.formula === "donation" && (!["donation", "donation-double", "donation-education", "donation-sport"].includes(rule.id) || rule.multiplier !== (rule.id === "donation" ? 1 : 2))) throw new Error("สูตรบริจาคไม่ตรงกับประเภทที่รองรับ");
    if (rule.formula === "salary" && rule.kind !== "expense") throw new Error("สูตรค่าใช้จ่ายไม่ตรงประเภท");
    if (rule.kind === "credit" && rule.status === "verified") throw new Error("รุ่นนี้ยังไม่รองรับการคำนวณเครดิตภาษี");
  }
  const pension=set.rules.find(r=>r.formula === "pension" && r.status === "verified");
  if (pension && (pension.sharedCap !== "retirement" || !Object.hasOwn(set.sharedCaps,"life-health") || !Object.hasOwn(set.sharedCaps,"retirement"))) throw new Error("สูตรบำนาญต้องมีวงเงินชีวิตและเกษียณร่วม");
  if (set.rules.filter(r=>r.formula === "salary" && r.status === "verified").length > 1) throw new Error("มีสูตรค่าใช้จ่ายเงินเดือนยืนยันมากกว่าหนึ่งรายการ");
  const specialRates=new Set(set.rules.filter(r=>r.formula === "donation" && r.multiplier > 1 && r.status === "verified").map(r=>r.rateBps));
  if (specialRates.size > 1) throw new Error("บริจาคพิเศษที่ใช้ฐานร่วมต้องมีสัดส่วนเพดานเดียวกัน");
  let last = -1;
  let lastRate = -1;
  set.brackets.forEach((bracket, index) => {
    if (bracket.rateBps < lastRate || (bracket.upTo === null && index !== set.brackets.length - 1) || (bracket.upTo !== null && bracket.upTo <= last)) throw new Error("ลำดับขั้นภาษีไม่ถูกต้อง");
    last = bracket.upTo ?? Number.MAX_SAFE_INTEGER;
    lastRate = bracket.rateBps;
  });
  if (set.brackets.length && set.brackets.at(-1)?.upTo !== null) throw new Error("ขั้นภาษีสุดท้ายต้องรองรับยอดเกินเพดาน");
  return set;
}

const current = importRules(bundled, 2569);
export function getRules(year: number): RuleSet {
  yearSchema.parse(year);
  if (year === 2569) return structuredClone(current);
  return {
    schemaVersion: 1, taxYear: year, version: `${year}.pending`, status: "pending",
    rules: current.rules.map(rule => ({...structuredClone(rule), taxYear: year, status: rule.kind === "documents" ? "expired" : "pending", cap: null, rateBps: null, sharedCap: null, effectiveFrom: `${year - 543}-01-01`, effectiveTo: `${year - 543}-12-31`, version: `${year}.pending`, reviewedAt: "", description: "กฎภาษีปีนี้ยังไม่ยืนยัน จัดเก็บเอกสารได้ แต่ไม่รวมยอดคำนวณ", sources: [], conditions: ["กฎภาษีปีนี้ยังไม่ยืนยัน จัดเก็บเอกสารได้ แต่ไม่ใช้วงเงินหรือเงื่อนไขปีก่อนเป็นสิทธิของปีนี้"]})),
    sharedCaps: {}, brackets: [], notes: ["กฎภาษีปีนี้ยังไม่ยืนยัน ไม่มีการนำวงเงินปีก่อนมาใช้"],
  };
}
