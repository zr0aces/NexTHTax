import { useState } from "react";
import { DocumentCategories } from "../../src/ui/DocumentCategories";
import { documentScopeKey, type DocumentScope } from "../../src/domain/documents";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DocumentList } from "../../src/ui/DocumentList";
import type { RecordEntry } from "../../src/domain/schema";

const rec = (n: number, over: Partial<RecordEntry>): RecordEntry => ({
  id: `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`, taxYear: 2026, category: "other", subcategory: null,
  date: `2026-01-0${n}`, title: `รายการ${n}`, issuer: "", notes: "", evidenceAmountSatang: null, claimedAmountSatang: null,
  withheldAmountSatang: null, status: "waiting-review", attachmentIds: [], createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null, ...over,
});

const records = [
  rec(1, { title: "ใบยืนยันการซื้อ", category: "deduction_retirement", subcategory: "fund_rmf" }),
  rec(2, { title: "ใบยืนยัน ทั่วไป", category: "deduction_retirement", subcategory: "fund_other" }),
  rec(3, { title: "ยังไม่จัดประเภท", category: "deduction_retirement", subcategory: null }),
  rec(4, { title: "กรมธรรม์สุขภาพ", category: "deduction_insurance", subcategory: "insurance_other" }),
  rec(5, { title: "เงินเดือนเดือนแรก", category: "income_salary", subcategory: null }),
];

function renderList(list = records) {
  function Harness() {
    const [scope, setScope] = useState<DocumentScope>(null);
    return <><DocumentCategories records={list} taxYear={2026} scope={scope} onSelect={setScope} />
      <DocumentList key={documentScopeKey(scope)} scope={scope} records={list} selectedId={null} onSelect={vi.fn()} onAdd={vi.fn()} onTrash={vi.fn()} onRestore={vi.fn()} onPurge={vi.fn()} /></>;
  }
  return render(<Harness />);
}

const shownTitles = () => within(screen.getByRole("region", { name: /รายการเอกสาร/ })).queryAllByRole("button").map((b) => b.textContent ?? "").filter((t) => t.includes("·"));
const selectType = (name: string) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^เลือกประเภท .+ / ${name}$`) }));

describe("category-first document search and filter", () => {
  it("permits browsing but disables every mutation in read-only mode", () => {
    const onAdd = vi.fn(), onSelect = vi.fn(), onTrash = vi.fn(), onRestore = vi.fn(), onPurge = vi.fn();
    render(<DocumentList records={[records[0]!, { ...records[1]!, trashedAt: "2026-01-01T00:00:00.000Z" }]} selectedId={null} canEdit={false} onSelect={onSelect} onAdd={onAdd} onTrash={onTrash} onRestore={onRestore} onPurge={onPurge} />);
    expect(screen.getByRole("button", { name: "+ เพิ่มรายการ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ย้ายไปถังขยะ" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /ใบยืนยันการซื้อ/ }));
    expect(onSelect).toHaveBeenCalledWith(records[0]!.id);
    fireEvent.click(screen.getByRole("button", { name: "ดูถังขยะ" }));
    expect(screen.getByRole("button", { name: "กู้คืนจากถังขยะ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "ลบถาวร" })).toBeDisabled();
    for (const action of [onAdd, onTrash, onRestore, onPurge]) expect(action).not.toHaveBeenCalled();
  });
  it("finds an RMF record through its subtype label even when the title lacks it", () => {
    renderList();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rmf" } });
    expect(shownTitles()).toHaveLength(1);
    expect(shownTitles()[0]).toContain("ใบยืนยันการซื้อ");
  });
  it("shows every category and fund type directly, including empty types, without dropdown navigation", () => {
    renderList();
    expect(screen.getAllByRole("button", { name: /^เลือกหมวด / })).toHaveLength(15);
    for (const label of ["RMF", "ThaiESG", "ThaiESGX", "SSF", "LTF", "กบข.", "กอช."]) {
      expect(screen.getByRole("button", { name: new RegExp(`^เลือกประเภท .+ / ${label}$`) })).toBeVisible();
    }
    selectType("ThaiESGX");
    expect(shownTitles()).toHaveLength(0);
    expect(screen.getByRole("button", { name: "เพิ่มเอกสารในหมวดนี้" })).toBeEnabled();
  });
  it("keeps unclassified separate from the explicit other option of each parent", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / รอจัดประเภท" }));
    expect(shownTitles()).toEqual([expect.stringContaining("ยังไม่จัดประเภท")]);
    selectType("กองทุนอื่น ๆ");
    expect(shownTitles()).toEqual([expect.stringContaining("ใบยืนยัน ทั่วไป")]);
  });
  it("resets search/status/trash on a different scope so a stale filter cannot hide its documents", () => {
    renderList(); selectType("RMF");
    expect(shownTitles()).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    fireEvent.change(screen.getByLabelText("สถานะ"), { target: { value: "reviewed" } });
    fireEvent.click(screen.getByRole("button", { name: "ดูถังขยะ" }));
    fireEvent.click(screen.getByRole("button", { name: "เลือกหมวด เบี้ยประกัน" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByLabelText("สถานะ")).toHaveValue("");
    expect(shownTitles()).toEqual([expect.stringContaining("กรมธรรม์สุขภาพ")]);
    fireEvent.click(screen.getByRole("button", { name: "แสดงทุกหมวด" }));
    expect(shownTitles()).toHaveLength(records.length);
  });
  it("labels unclassified only for parents that support subtypes and keeps evidence as the primary amount", () => {
    renderList();
    expect(shownTitles().find((t) => t.includes("เงินเดือนเดือนแรก"))).not.toContain("รอจัดประเภท");
    expect(shownTitles().find((t) => t.includes("ยังไม่จัดประเภท"))).toContain("รอจัดประเภท");
    expect(shownTitles()[0]).toContain("ยังไม่ระบุยอด");
  });
});
