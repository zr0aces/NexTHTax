import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentCategories } from "../../src/ui/DocumentCategories";
import { planFixture } from "../fixtures/plan";

describe("DocumentCategories evidence navigation", () => {
  it("makes category selection explicit without changing records or creating them", () => {
    const records = planFixture().records, before = JSON.stringify(records), onSelect = vi.fn();
    const { rerender, container } = render(<DocumentCategories records={records} taxYear={2025} scope={null} onSelect={onSelect} />);
    const choice = screen.getByRole("button", { name: "เลือกประเภท กองทุนและเงินออมเพื่อเกษียณ / ThaiESGX" });
    expect(choice).toHaveAttribute("aria-pressed", "false");
    expect(choice).toHaveAttribute("aria-controls", "document-list");
    expect(document.getElementById(choice.getAttribute("aria-describedby")!)).toHaveTextContent("0 เอกสาร · ยังไม่มีเอกสาร");
    fireEvent.click(choice);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith({ category: "deduction_retirement", subcategory: "fund_thai_esgx" });
    expect(JSON.stringify(records)).toBe(before);
    rerender(<DocumentCategories records={records} taxYear={2025} scope={{ category: "deduction_retirement", subcategory: "fund_thai_esgx" }} onSelect={onSelect} />);
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("button button")).toBeNull();
  });
  it("shows explicit zero, unknown and partial evidence without treating unknown as zero", () => {
    const record = planFixture().records[0]!;
    const { rerender } = render(<DocumentCategories records={[{ ...record, evidenceAmountSatang: 0, claimedAmountSatang: 9000000 }]} taxYear={2025} scope={null} onSelect={vi.fn()} />);
    const parent = screen.getByRole("button", { name: "เลือกหมวด เบี้ยประกัน" });
    expect(parent).toHaveTextContent("ยอดที่ระบุ 0.00 บาท");
    expect(parent).not.toHaveTextContent("90,000.00");
    rerender(<DocumentCategories records={[{ ...record, evidenceAmountSatang: null }]} taxYear={2025} scope={null} onSelect={vi.fn()} />);
    expect(parent).toHaveTextContent("ยังไม่ระบุยอด");
    expect(parent).toHaveTextContent("ยังไม่ทราบยอด 1 รายการ");
    expect(parent).not.toHaveTextContent("0.00 บาท");
    rerender(<DocumentCategories records={[record, { ...record, id: "00000000-0000-4000-8000-000000000099", evidenceAmountSatang: null }]} taxYear={2025} scope={null} onSelect={vi.fn()} />);
    expect(parent).toHaveTextContent("ยอดที่ระบุ 8,000.00 บาท");
    expect(parent).toHaveTextContent("ยังไม่ทราบยอด 1 รายการ");
  });
  it("retains counts while evidence overflow is unavailable and ignores other years", () => {
    const record = planFixture().records[0]!;
    render(<DocumentCategories records={[{ ...record, evidenceAmountSatang: Number.MAX_SAFE_INTEGER }, { ...record, id: "00000000-0000-4000-8000-000000000099", evidenceAmountSatang: 1 }, { ...record, taxYear: 2026 }]} taxYear={2025} scope={null} onSelect={vi.fn()} />);
    const parent = screen.getByRole("button", { name: "เลือกหมวด เบี้ยประกัน" });
    expect(parent).toHaveTextContent("2 เอกสาร");
    expect(parent).toHaveTextContent("ยอดเกินช่วงที่รวมได้อย่างแม่นยำ");
    expect(parent).not.toHaveTextContent("0.00 บาท");
  });
});
