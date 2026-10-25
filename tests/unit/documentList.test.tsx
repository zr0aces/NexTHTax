import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
  return render(
    <DocumentList records={list} selectedId={null} onSelect={vi.fn()} onAdd={vi.fn()} onTrash={vi.fn()} onRestore={vi.fn()} onPurge={vi.fn()} />,
  );
}

const shownTitles = () => screen.queryAllByRole("button").map((b) => b.textContent ?? "").filter((t) => t.includes("·"));
const categorySelect = () => screen.getByLabelText(/^หมวด/) as HTMLSelectElement;
const subtypeSelect = () => screen.queryByLabelText(/ประเภทเอกสารย่อย/) as HTMLSelectElement | null;

describe("DocumentList subtype search and filter", () => {
  it("finds an RMF record through its subtype label even when the title lacks it", () => {
    renderList();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "rmf" } });
    expect(shownTitles()).toHaveLength(1);
    expect(shownTitles()[0]).toContain("ใบยืนยันการซื้อ");
  });
  it("shows the subtype filter only for the two broad parents", () => {
    renderList();
    expect(subtypeSelect()).toBeNull();
    fireEvent.change(categorySelect(), { target: { value: "deduction_insurance" } });
    expect(subtypeSelect()).not.toBeNull();
    fireEvent.change(categorySelect(), { target: { value: "income_salary" } });
    expect(subtypeSelect()).toBeNull();
  });
  it("keeps unclassified distinct from the explicit other option of each parent", () => {
    renderList();
    fireEvent.change(categorySelect(), { target: { value: "deduction_retirement" } });
    fireEvent.change(subtypeSelect()!, { target: { value: "unclassified" } });
    expect(shownTitles()).toEqual([expect.stringContaining("ยังไม่จัดประเภท")]);
    fireEvent.change(subtypeSelect()!, { target: { value: "fund_other" } });
    expect(shownTitles()).toEqual([expect.stringContaining("ใบยืนยัน ทั่วไป")]);
  });
  it("resets a stale subtype filter when the parent changes or all categories is chosen", () => {
    renderList();
    fireEvent.change(categorySelect(), { target: { value: "deduction_retirement" } });
    fireEvent.change(subtypeSelect()!, { target: { value: "fund_rmf" } });
    expect(shownTitles()).toHaveLength(1);
    fireEvent.change(categorySelect(), { target: { value: "deduction_insurance" } });
    expect(subtypeSelect()!.value).toBe("");
    expect(shownTitles()).toEqual([expect.stringContaining("กรมธรรม์สุขภาพ")]);
    fireEvent.change(categorySelect(), { target: { value: "" } });
    expect(subtypeSelect()).toBeNull();
    expect(shownTitles()).toHaveLength(records.length);
  });
  it("labels subtype only for applicable parents in the list row", () => {
    renderList();
    expect(shownTitles().find((t) => t.includes("เงินเดือนเดือนแรก"))).not.toContain("ยังไม่ระบุประเภท");
    expect(shownTitles().find((t) => t.includes("ยังไม่จัดประเภท"))).toContain("ยังไม่ระบุประเภท");
  });
});
