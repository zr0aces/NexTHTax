import { describe, it, expect } from "vitest";
import { calculate } from "../src/domain/engine";
import { makeYear } from "../src/domain/workspace";
import { newId, type Attachment, type TaxRecord, type TaxYearData } from "../src/domain/model";
import { applyFixedDrafts, classifyFixedRecords, countedAmountOf, fixedAllowanceRows, isAnnualCompatible, potentialFor, type FixedDraft } from "../src/domain/fixed-allowances";

// Fictional fixtures (สมมติ). Baseline behavior of fixed-allowance categories under the 2569 snapshot.
const B = (value: number) => Math.round(value * 100);
function year(income: number | null = 1_000_000): TaxYearData {
  const data = makeYear(2569);
  data.profile.income = income === null ? null : B(income);
  return data;
}
function rec(categoryId: string, facts: TaxRecord["facts"] = {}, extra: Partial<TaxRecord> = {}): TaxRecord {
  return {
    id: newId(), categoryId, title: "สิทธิทดสอบ (สมมติ)", amount: 0, date: "2026-12-31", eligibleAmount: null,
    provider: "", reference: "", note: "", documentStatus: "none", eligibility: "confirmed",
    checklist: [], attachments: [], facts, ...extra,
  };
}
function category(data: TaxYearData, id: string) {
  return calculate(data).categories.find(c => c.ruleId === id)!;
}

describe("baseline สิทธิยอดคงที่ก่อนปรับโครงสร้าง", () => {
  it("ส่วนตัวนับครั้งเดียวจากกฎ fixed ไม่ต้องมีรายการ", () => {
    const out = calculate(year());
    expect(out.personal).toBe(B(60000));
    expect(category(year(), "personal").allowed).toBe(B(60000));
  });

  it("บุตรคูณจำนวนผู้เข้าเกณฑ์กับสิทธิต่อคน และยอดจ่ายเป็นศูนย์", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }, { amount: 0 })];
    const result = category(data, "child");
    expect(result.paid).toBe(0);
    expect(result.allowed).toBe(B(60000));
  });

  it("ยังไม่ยืนยันหรือ amount เป็นศูนย์ไม่ทำให้ยอดรวมเปลี่ยนและไม่ถือเป็นยอดรอตรวจทางเงิน", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }, { eligibility: "unchecked" })];
    expect(category(data, "child").allowed).toBe(0);
    expect(category(data, "child").pending).toBe(0);
    expect(calculate(data).deductions).toBe(0);
  });

  it("ไม่มีจำนวนผู้เข้าเกณฑ์ทำให้เป็นรอตรวจ ไม่นับเป็นศูนย์แบบเงียบ", () => {
    const data = year();
    data.records = [rec("child", {}, { amount: B(0) })];
    const out = calculate(data);
    expect(category(data, "child").allowed).toBe(0);
    expect(out.warnings.join()).toContain("ต้องระบุจำนวนผู้เข้าเกณฑ์");
  });

  it("บุตรส่วนเพิ่มต้องไม่เกินจำนวนบุตรพื้นฐานที่ยืนยัน", () => {
    const data = year();
    data.records = [rec("child-additional", { qualifyingCount: 1 })];
    expect(category(data, "child-additional").allowed).toBe(0);
    expect(category(data, "child-additional").pending).toBe(0);
    data.records.push(rec("child", { qualifyingCount: 2 }));
    expect(category(data, "child-additional").allowed).toBe(B(30000));
  });

  it("บุตรส่วนเพิ่มมากกว่าบุตรพื้นฐานถูกแยกเป็นรอตรวจ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 1 }), rec("child-additional", { qualifyingCount: 2 })];
    expect(category(data, "child-additional").allowed).toBe(0);
  });

  it("บิดามารดาจำกัดไม่เกิน 4 คน", () => {
    const ok = year();
    ok.records = [rec("parents", { qualifyingCount: 4 })];
    expect(category(ok, "parents").allowed).toBe(B(120000));
    const over = year();
    over.records = [rec("parents", { qualifyingCount: 5 })];
    expect(category(over, "parents").allowed).toBe(0);
  });

  it("คู่สมรสใช้ยืนยันหนึ่งสิทธิ และรายการซ้ำนับเพียงรายการแรก", () => {
    const data = year();
    data.records = [rec("spouse"), rec("spouse")];
    const out = calculate(data);
    expect(category(data, "spouse").allowed).toBe(B(60000));
    expect(out.warnings.join()).toContain("รวมทั้งปี");
  });

  it("ผู้พิการ/ทุพพลภาพที่อุปการะคูณจำนวนคน", () => {
    const data = year();
    data.records = [rec("disability-care", { qualifyingCount: 1 })];
    expect(category(data, "disability-care").allowed).toBe(B(60000));
  });

  it("รายการที่วันที่ไม่อยู่ในปีภาษีไม่ถูกนับ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }, { date: "2025-12-31" })];
    expect(category(data, "child").allowed).toBe(0);
  });

  it("กฎที่ยังไม่ยืนยันไม่ให้สิทธิคงที่แม้มีจำนวนผู้เข้าเกณฑ์", () => {
    const data = year();
    data.rules.rules = data.rules.rules.map(r => r.id === "child" ? {...r, status: "pending"} : r);
    data.records = [rec("child", { qualifyingCount: 2 }, { eligibility: "pending" })];
    expect(category(data, "child").allowed).toBe(0);
  });
});

const attachment = (name = "ใบรับรอง.pdf"): Attachment => ({id: newId(), path: `years/2569/documents/family/${newId()}.pdf`, originalName: name, mime: "application/pdf", size: 10, hash: "a".repeat(64)});
const draft = (categoryId: FixedDraft["categoryId"], qualifyingCount: number | null, confirmed = true, extra: Partial<FixedDraft> = {}): FixedDraft =>
  ({categoryId, qualifyingCount, confirmed, checklist: [], newAttachments: [], canonicalId: null, ...extra});
const rowOf = (data: TaxYearData, id: string) => fixedAllowanceRows(data, calculate(data)).find(r => r.ruleId === id)!;

describe("potentialFor", () => {
  it("บุตรคูณจำนวนกับสิทธิต่อคน และคู่สมรสใช้วงเงินหนึ่งสิทธิ", () => {
    const data = year();
    const rule = data.rules.rules.find(r => r.id === "child")!;
    expect(potentialFor(rec("child", { qualifyingCount: 3 }), rule, "unconfirmed")).toBe(B(90000));
    expect(potentialFor(rec("child", {}), rule, "needs-count")).toBeNull();
    expect(potentialFor(rec("child", { qualifyingCount: 3 }), rule, "ineligible")).toBe(0);
  });
});

describe("สิทธิยอดคงที่: projection", () => {
  it("แถวส่วนตัวแสดงยอดที่นำมาคำนวณจริงโดยไม่มีรายการ", () => {
    const data = year();
    const row = rowOf(data, "personal");
    expect(row.status).toBe("included");
    expect(row.included).toBe(B(60000));
    expect(row.records).toHaveLength(0);
  });

  it("บุตรยืนยันแล้วเป็น included และไม่มีรอตรวจ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 })];
    expect(rowOf(data, "child")).toMatchObject({status: "included", potential: B(60000), included: B(60000), pendingRecords: 0});
  });

  it("ยังไม่ยืนยันแสดงยอดตามจำนวนแต่ยอดที่นำมาคำนวณเป็นศูนย์และยังรอตรวจ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }, { eligibility: "unchecked" })];
    expect(rowOf(data, "child")).toMatchObject({status: "pending", potential: B(60000), included: 0, pendingRecords: 1});
  });

  it("รายการซ้ำที่ยืนยันทั้งคู่เป็น conflict และนับเพียงรายการแรก", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }), rec("child", { qualifyingCount: 5 })];
    expect(rowOf(data, "child")).toMatchObject({status: "conflict", included: B(60000), pendingRecords: 1});
  });

  it("ส่วนเพิ่มที่ไม่มีบุตรพื้นฐานยืนยันเป็นรอตรวจและไม่มียอดคำนวณ", () => {
    const data = year();
    data.records = [rec("child-additional", { qualifyingCount: 1 })];
    expect(rowOf(data, "child-additional")).toMatchObject({status: "pending", potential: null, included: 0, pendingRecords: 1});
  });

  it("ปิดการยืนยันด้วยสถานะไม่เข้าเงื่อนไขไม่แสดงเป็นรอตรวจ", () => {
    const data = year();
    data.records = [rec("parents", { qualifyingCount: 1 }, { eligibility: "ineligible" })];
    expect(rowOf(data, "parents")).toMatchObject({status: "excluded", potential: 0, pendingRecords: 0});
  });

  it("กฎที่ไม่ยืนยันแสดงสถานะกฎรอและไม่คำนวณยอดตามจำนวน", () => {
    const data = year();
    data.rules.rules = data.rules.rules.map(r => r.id === "spouse" ? {...r, status: "pending"} : r);
    data.records = [rec("spouse")];
    expect(rowOf(data, "spouse")).toMatchObject({status: "rule-pending", potential: null, included: 0});
  });
});

describe("สิทธิยอดคงที่: annual upsert แบบ atomic", () => {
  it("สร้างบุตรพื้นฐานและส่วนเพิ่มเป็นสองรายการในการบันทึกเดียว โดยไม่มียอดจ่ายหรือวันที่จ่าย", () => {
    const data = year();
    const next = applyFixedDrafts(data, [draft("child", 2), draft("child-additional", 1)]);
    expect(next.records).toHaveLength(2);
    for (const r of next.records) {
      expect(r.amount).toBe(0);
      expect(r.eligibleAmount).toBeNull();
      expect(r.date).toBe("2026-12-31");
      expect(r.eligibility).toBe("confirmed");
    }
    expect(next.profile.selectedCategories).toEqual(expect.arrayContaining(["child", "child-additional"]));
    expect(calculate(next).deductions).toBe(B(90000));
    expect(data.records).toHaveLength(0);
  });

  it("แก้รายการเดิมใช้ ID เดิม เก็บยอดจ่ายและไฟล์เดิม และไม่เพิ่มรายการซ้ำ", () => {
    const data = year();
    const legacy = rec("child", { qualifyingCount: 1 }, { amount: B(500), title: "บุตรเดิม", attachments: [attachment()] });
    data.records = [legacy];
    const next = applyFixedDrafts(data, [draft("child", 2, false, {canonicalId: legacy.id})]);
    expect(next.records).toHaveLength(1);
    expect(next.records[0].id).toBe(legacy.id);
    expect(next.records[0].amount).toBe(B(500));
    expect(next.records[0].title).toBe("บุตรเดิม");
    expect(next.records[0].attachments).toEqual(legacy.attachments);
    expect(next.records[0].facts.qualifyingCount).toBe(2);
    expect(next.records[0].eligibility).toBe("unchecked");
  });

  it("รายการซ้ำต้องเลือกรายการหลักเอง ไม่เขียนทับรายการแรกโดยเงียบ", () => {
    const data = year();
    data.records = [rec("parents", { qualifyingCount: 1 }), rec("parents", { qualifyingCount: 2 })];
    expect(() => applyFixedDrafts(data, [draft("parents", 3)])).toThrow("เลือกรายการหลัก");
    expect(data.records[0].facts.qualifyingCount).toBe(1);
  });

  it("เลือกรายการหลักแล้วรายการอื่นที่ยืนยันอยู่ถูกเปลี่ยนเป็นไม่นับ โดยเก็บ ID และไฟล์ครบ", () => {
    const data = year();
    const keep = rec("parents", { qualifyingCount: 1 }, {attachments: [attachment()]});
    const other = rec("parents", { qualifyingCount: 2 }, {attachments: [attachment("อีกไฟล์.pdf")]});
    data.records = [keep, other];
    const next = applyFixedDrafts(data, [draft("parents", 1, true, {canonicalId: keep.id})]);
    expect(next.records.map(r => r.id)).toEqual([keep.id, other.id]);
    expect(next.records[1].eligibility).toBe("unchecked");
    expect(next.records[1].attachments).toEqual(other.attachments);
    expect(calculate(next).categories.find(c => c.ruleId === "parents")!.allowed).toBe(B(30000));
  });

  it("ส่วนเพิ่มมากกว่าบุตรพื้นฐานหรือยืนยันโดยไม่มีบุตรพื้นฐานถูกปฏิเสธ", () => {
    const data = year();
    expect(() => applyFixedDrafts(data, [draft("child", 1), draft("child-additional", 2)])).toThrow("ไม่มากกว่า");
    expect(() => applyFixedDrafts(data, [draft("child", 1, false), draft("child-additional", 1, true)])).toThrow("ยืนยันบุตรพื้นฐาน");
  });

  it("ปิดบุตรพื้นฐานต้องรีเซ็ตส่วนเพิ่มเป็น 0 ในการบันทึกเดียวกัน เพราะไม่ปรับลดให้เอง", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 }), rec("child-additional", { qualifyingCount: 1 })];
    expect(() => applyFixedDrafts(data, [
      draft("child", 2, false, {canonicalId: data.records[0].id}),
      draft("child-additional", 1, false, {canonicalId: data.records[1].id}),
    ])).toThrow("ไม่มากกว่า");
    const next = applyFixedDrafts(data, [
      draft("child", 2, false, {canonicalId: data.records[0].id}),
      draft("child-additional", 0, false, {canonicalId: data.records[1].id}),
    ]);
    expect(next.records.map(r => r.facts.qualifyingCount)).toEqual([2, 0]);
    expect(next.records.every(r => r.eligibility === "unchecked")).toBe(true);
    expect(calculate(next).deductions).toBe(0);
  });

  it("จำนวนนอกขอบเขตหรือคู่สมรสที่ส่งจำนวนถูกปฏิเสธ และยืนยันศูนย์คนไม่ได้", () => {
    const data = year();
    expect(() => applyFixedDrafts(data, [draft("child", 21)])).toThrow("จำนวนเต็ม");
    expect(() => applyFixedDrafts(data, [draft("parents", 5)])).toThrow("จำนวนเต็ม");
    expect(() => applyFixedDrafts(data, [draft("child", 0, true)])).toThrow("อย่างน้อย 1");
    expect(() => applyFixedDrafts(data, [draft("spouse", 1)])).toThrow("ไม่ใช้จำนวน");
  });

  it("รายการเดิมที่วันที่ไม่อยู่ในปีภาษีไม่ถูกยืนยันโดยไม่ปรับวันที่เงียบ", () => {
    const data = year();
    const bad = rec("child", { qualifyingCount: 1 }, {date: "2025-12-31"});
    data.records = [bad];
    expect(() => applyFixedDrafts(data, [draft("child", 1, true, {canonicalId: bad.id})])).toThrow("วันที่");
    const next = applyFixedDrafts(data, [draft("child", 1, false, {canonicalId: bad.id})]);
    expect(next.records[0].date).toBe("2025-12-31");
  });

  it("ไม่รองรับกฎที่ยังไม่ยืนยันหรือปีที่กฎไม่ตรง จึงไม่ commit", () => {
    const data = year();
    data.rules.rules = data.rules.rules.map(r => r.id === "parents" ? {...r, status: "pending"} : r);
    expect(() => applyFixedDrafts(data, [draft("parents", 1)])).toThrow("ยังตั้งค่า");
  });

  it("ส่วนเพิ่มผิดแล้วไม่ทำให้บุตรพื้นฐานถูกบันทึกบางส่วน", () => {
    const data = year();
    const before = JSON.stringify(data);
    expect(() => applyFixedDrafts(data, [draft("child", 2), draft("child-additional", 3)])).toThrow();
    expect(JSON.stringify(data)).toBe(before);
  });

  it("ผู้ใช้เคยระบุไม่เข้าเงื่อนไข คงสถานะไว้จนกว่าจะยืนยันใหม่", () => {
    const data = year();
    const legacy = rec("spouse", {}, {eligibility: "ineligible"});
    data.records = [legacy];
    expect(applyFixedDrafts(data, [draft("spouse", null, false, {canonicalId: legacy.id})]).records[0].eligibility).toBe("ineligible");
    expect(applyFixedDrafts(data, [draft("spouse", null, true, {canonicalId: legacy.id})]).records[0].eligibility).toBe("confirmed");
  });
});

describe("ข้อมูลเดิมไม่ถูกเขียนทับโดยไม่ตั้งใจ", () => {
  const docRule = () => year().rules.rules.find(r => r.id === "parents")!;
  const managedDoc = () => docRule().documents[0];

  it("รายการเดิมที่ไม่มีการแก้ไขเอกสาร คงรายการตรวจนอกเหนือจากกฎและ documentStatus เดิม", () => {
    const data = year();
    const legacy = rec("parents", { qualifyingCount: 1 }, {documentStatus: "partial", checklist: ["ข้อมูลเก่าที่ไม่อยู่ในกฎ", managedDoc()]});
    data.records = [legacy];
    const next = applyFixedDrafts(data, [draft("parents", 2, false, {canonicalId: legacy.id, checklist: [managedDoc()]})]);
    expect(next.records[0].checklist).toEqual(["ข้อมูลเก่าที่ไม่อยู่ในกฎ", managedDoc()]);
    expect(next.records[0].documentStatus).toBe("partial");
    expect(next.records[0].facts.qualifyingCount).toBe(2);
  });

  it("รายการตรวจที่ไม่อยู่ในกฎถูกเก็บไว้เมื่อผู้ใช้ติ๊กรายการตรวจของกฎ", () => {
    const data = year();
    const legacy = rec("parents", { qualifyingCount: 1 }, {checklist: ["ข้อมูลเก่าที่ไม่อยู่ในกฎ"]});
    data.records = [legacy];
    const next = applyFixedDrafts(data, [draft("parents", 1, false, {canonicalId: legacy.id, checklist: [managedDoc()]})]);
    expect(next.records[0].checklist).toEqual(["ข้อมูลเก่าที่ไม่อยู่ในกฎ", managedDoc()]);
    expect(next.records[0].documentStatus).toBe("none");
  });

  it("เพิ่มเอกสารแล้วคำนวณ documentStatus ใหม่ โดยยังคงรายการตรวจเดิมนอกกฎ", () => {
    const data = year();
    const legacy = rec("parents", { qualifyingCount: 1 }, {documentStatus: "none", checklist: ["ข้อมูลเก่าที่ไม่อยู่ในกฎ"]});
    data.records = [legacy];
    const next = applyFixedDrafts(data, [draft("parents", 1, false, {canonicalId: legacy.id, checklist: [managedDoc()], newAttachments: [attachment()]})]);
    expect(next.records[0].attachments).toHaveLength(1);
    expect(next.records[0].checklist).toEqual(["ข้อมูลเก่าที่ไม่อยู่ในกฎ", managedDoc()]);
    expect(next.records[0].documentStatus).toBe("complete");
  });

  it("ไม่มีเอกสารและรายการตรวจที่ผู้ใช้เปลี่ยน คง documentStatus เดิมแม้ค่าไม่สอดคล้องกับไฟล์", () => {
    const data = year();
    const legacy = rec("parents", { qualifyingCount: 1 }, {documentStatus: "complete", checklist: []});
    data.records = [legacy];
    const next = applyFixedDrafts(data, [draft("parents", 1, false, {canonicalId: legacy.id})]);
    expect(next.records[0].documentStatus).toBe("complete");
  });
});

describe("ขอบเขตบุตรส่วนเพิ่มและการยืนยันบุตรพื้นฐาน", () => {
  it("บุตรพื้นฐานที่ยังไม่ยืนยันใช้จำนวนเป็น 0 สำหรับเพดานส่วนเพิ่ม แม้ส่งจำนวน 2 มา", () => {
    const data = year();
    expect(() => applyFixedDrafts(data, [draft("child", 2, false), draft("child-additional", 1, false)])).toThrow("ไม่มากกว่า");
    expect(applyFixedDrafts(data, [draft("child", 2, true), draft("child-additional", 2, false)]).records).toHaveLength(2);
  });

  it("ไม่มีร่างบุตรพื้นฐานแต่บุตรที่ยืนยันในแฟ้มใช้เป็นเพดานเท่าที่ engine นับ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 2 })];
    expect(() => applyFixedDrafts(data, [draft("child-additional", 3, false)])).toThrow("ไม่มากกว่า");
    expect(applyFixedDrafts(data, [draft("child-additional", 2, false)]).records).toHaveLength(2);
    data.records = [rec("child", { qualifyingCount: 2 }, { eligibility: "unchecked" })];
    expect(() => applyFixedDrafts(data, [draft("child-additional", 1, false)])).toThrow("ไม่มากกว่า");
  });

  it("ค่าที่แสดงในฟอร์มและยอดที่คำนวณได้ตรงกับเพดานเดียวกัน", () => {
    const data = year();
    const base = draft("child", 2, true);
    const extra = draft("child-additional", 2, false);
    expect(() => applyFixedDrafts(data, [base, extra])).not.toThrow();
    expect(() => applyFixedDrafts(data, [draft("child", 2, false), extra])).toThrow("ไม่มากกว่า");
  });
});

describe("สิทธิที่ไม่รองรับยอดคงที่ในปีนี้", () => {
  function nonAnnual(): TaxYearData {
    const data = year();
    data.rules.rules = data.rules.rules.map(r => r.id === "parents" ? {...r, rateBps: 500} : r);
    return data;
  }

  it("กฎที่ยืนยันแล้วแต่มีอัตราต่อรายได้ไม่ใช่สิทธิยอดคงที่ และคำสั่งบันทึกถูกปฏิเสธ", () => {
    const data = nonAnnual();
    const rule = data.rules.rules.find(r => r.id === "parents")!;
    expect(rule.status).toBe("verified");
    expect(isAnnualCompatible(rule, 2569)).toBe(false);
    expect(classifyFixedRecords({...data, records: [rec("parents", {qualifyingCount: 1})]}).size).toBe(1);
    expect(() => applyFixedDrafts(data, [draft("parents", 1)])).toThrow("เก็บเป็นเอกสาร");
  });

  it("รายการเดิมของสิทธิที่ไม่รองรับถูกจัดเป็นกฎรอ ไม่นับเป็นยอดสิทธิ", () => {
    const data = nonAnnual();
    const stored = rec("parents", {qualifyingCount: 1});
    data.records = [stored];
    expect(classifyFixedRecords(data).get(stored.id)).toBe("rule-pending");
    expect(rowOf(data, "parents")).toMatchObject({status: "rule-pending", rate: 0, potential: null});
  });
});

describe("รายการซ้ำก่อนและหลังบันทึก", () => {
  it("เลือกรายการหลักใหม่ให้รายการเดิมเป็นไม่ยืนยัน และรายการที่เลือกเป็นนับได้", () => {
    const data = year();
    const first = rec("parents", { qualifyingCount: 1 });
    const second = rec("parents", { qualifyingCount: 2 });
    data.records = [first, second];
    const before = classifyFixedRecords(data);
    expect(before.get(first.id)).toBe("counted");
    expect(before.get(second.id)).toBe("duplicate");
    const next = applyFixedDrafts(data, [draft("parents", 2, true, {canonicalId: second.id})]);
    const after = classifyFixedRecords(next);
    expect(after.get(second.id)).toBe("counted");
    expect(after.get(first.id)).toBe("unconfirmed");
    expect(countedAmountOf(next.records[1], next.rules.rules.find(r => r.id === "parents"), after.get(second.id))).toBe(B(60000));
  });
});

describe("เครื่องมือคำนวณเดียวสำหรับสิทธิยอดคงที่", () => {
  it("ยอดที่นับต่อรายการตรงกับยอดที่ engine อนุญาตของหมวดนั้นทุกแบบ", () => {
    const data = year();
    data.records = [rec("child", { qualifyingCount: 3 }), rec("spouse"), rec("disability-care", { qualifyingCount: 2 })];
    const out = calculate(data);
    for (const record of data.records) {
      const rule = data.rules.rules.find(r => r.id === record.categoryId);
      const state = classifyFixedRecords(data).get(record.id);
      expect(countedAmountOf(record, rule, state)).toBe(out.categories.find(c => c.ruleId === record.categoryId)!.allowed);
    }
  });
});

