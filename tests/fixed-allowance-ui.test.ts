import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FixedAllowanceEditor } from "../src/ui/fixed-allowance-editor";
import { makeYear } from "../src/domain/workspace";
import { newId, type TaxRecord, type TaxYearData, type Workspace } from "../src/domain/model";

// Fictional fixtures (สมมติ). Server-rendered markup checks the editor's notices and disabled controls.
function rec(categoryId: string, facts: TaxRecord["facts"] = {}, extra: Partial<TaxRecord> = {}): TaxRecord {
  return {
    id: newId(), categoryId, title: "สิทธิทดสอบ (สมมติ)", amount: 0, date: "2026-12-31", eligibleAmount: null,
    provider: "", reference: "", note: "", documentStatus: "none", eligibility: "confirmed",
    checklist: [], attachments: [], facts, ...extra,
  };
}
function workspaceWith(data: TaxYearData): Workspace {
  return {
    manifest: {schemaVersion: 1, id: "fictional-fixed", name: "แฟ้มสมมติ", revision: 0, createdAt: "2026-10-25T00:00:00.000Z", updatedAt: "2026-10-25T00:00:00.000Z", years: [2569]},
    years: {"2569": data}, files: new Map(), warnings: [],
  };
}
function render(data: TaxYearData, categoryId: string): string {
  return renderToStaticMarkup(createElement(FixedAllowanceEditor, {
    workspace: workspaceWith(data), year: 2569, categoryId, onClose: () => {}, onSave: async () => {},
  }));
}
/** Opening tag of the element with this id, so assertions read its attributes only. */
const tagById = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
const saveButton = (html: string, label: string) => html.match(new RegExp(`<button[^>]*class="button primary"[^>]*>${label}</button>`))?.[0] ?? "";

describe("ตัวแก้ไขสิทธิยอดคงที่ (server render)", () => {
  it("สิทธิที่ยืนยันแล้วแต่ไม่รองรับยอดคงที่แสดงหมายเหตุ ปิดตัวนับ และไม่แสดงสมการ", () => {
    const data = makeYear(2569);
    data.rules.rules = data.rules.rules.map(r => r.id === "parents" ? {...r, rateBps: 500} : r);
    const html = render(data, "parents");
    expect(html).toContain("ยังตั้งค่าเป็นยอดคงที่ไม่ได้ในปีนี้");
    expect(html).toContain("เก็บเป็นรายการเอกสารได้ตามเดิม");
    expect(tagById(html, "fixed-qty-parents")).toMatch(/disabled=""/);
    expect(html).not.toContain("คน × ");
    expect(saveButton(html, "บันทึกสิทธิ")).toMatch(/disabled=""/);
  });

  it("รายการเดิมที่ไม่มีจำนวนผู้เข้าเกณฑ์ต้องแสดงคำเตือนและไม่เติมตัวเลขให้", () => {
    const data = makeYear(2569);
    data.records = [rec("parents", {})];
    const html = render(data, "parents");
    expect(html).toContain("โปรดระบุจำนวนและตรวจสิทธิ");
    expect(tagById(html, "fixed-qty-parents")).toMatch(/value=""/);
    expect(saveButton(html, "บันทึกสิทธิ")).toMatch(/disabled=""/);
  });

  it("สิทธิใหม่ยังเริ่มที่ 1 คนและบันทึกได้เมื่อยืนยันแล้ว", () => {
    const html = render(makeYear(2569), "parents");
    expect(tagById(html, "fixed-qty-parents")).toMatch(/value="1"/);
    expect(html).toContain("1 คน × 30,000 บาท");
    expect(html).not.toContain("โปรดระบุจำนวนและตรวจสิทธิ");
  });

  it("รายการซ้ำแสดงก่อนและหลังของแต่ละรายการ และปุ่มบันทึกปิดจนกว่าจะเลือกรายการหลัก", () => {
    const data = makeYear(2569);
    data.records = [rec("parents", {qualifyingCount: 1}), rec("parents", {qualifyingCount: 2})];
    const html = render(data, "parents");
    expect(html.match(/ก่อน: /g)).toHaveLength(2);
    expect(html.match(/หลัง: /g)).toHaveLength(2);
    expect(html).toContain("ยังคำนวณไม่ได้");
    expect(html).toContain("เบราว์เซอร์ไม่แจ้งว่าไฟล์ถูกเก็บไว้หรือถูกยกเลิก");
    expect(saveButton(html, "ขอ ZIP สำรองแล้วบันทึก")).toMatch(/disabled=""/);
  });
});
