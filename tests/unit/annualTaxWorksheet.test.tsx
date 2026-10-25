import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnnualTaxWorksheet } from "../../src/ui/AnnualTaxWorksheet";
import { annualInputs, annualManifest, syntheticAnnualRules } from "../fixtures/annualTax";
import { annualSourceProjection } from "../../src/domain/annualTax";
import { sha256Hex } from "../../src/storage/hash";
import { worksheetProjection } from "../../src/domain/taxInputs";

const props = (manifest = annualManifest(null)) => ({ manifest, taxYear: 2026, bundle: null, ruleDigest: null, trustedRules: false, onSave: vi.fn().mockResolvedValue(undefined), onUnsavedChange: vi.fn(), onUpgrade: vi.fn(), supportsAnnual: true, disabled: false });
describe("explicit annual worksheet", () => {
  it("does not select existing documents or create income rows on open", () => {
    const p = props(); render(<AnnualTaxWorksheet {...p} />);
    expect(screen.queryByLabelText("เงินได้ทั้งปี (บาท)")).toBeNull();
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "เลือกใช้คำนวณ" })).toBeDisabled();
  });
  it("selects evidence only on user action, preserves raw evidence, and prevents using the same record twice", async () => {
    const p = props(), before = JSON.stringify(p.manifest); render(<AnnualTaxWorksheet {...p} />);
    fireEvent.change(screen.getByLabelText("เลือกเอกสารปีนี้"), { target: { value: p.manifest.records[0]!.id } });
    fireEvent.click(screen.getByRole("button", { name: "เลือกใช้คำนวณ" }));
    expect(screen.getByLabelText("ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)")).toHaveValue("8,000.00");
    expect(screen.getByLabelText(/ยืนยันว่าจ่ายจริง/)).toHaveValue("unknown");
    expect(within(screen.getByLabelText("เลือกเอกสารปีนี้")).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)"), { target: { value: "7000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledOnce());
    expect(p.onSave.mock.calls[0]![0].deductions[0]).toMatchObject({ existingContributionSatang: 700000, sourceRecordIds: [p.manifest.records[0]!.id], eligibility: "unknown" });
    expect(JSON.stringify(p.manifest)).toBe(before);
  });
  it("retains invalid/manual drafts on validation and write failures", async () => {
    const p = props(); p.onSave.mockRejectedValue(new Error("disk full")); render(<AnnualTaxWorksheet {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "เพิ่มรายได้กรอกเอง" }));
    expect(screen.getByText(/กรอกเอง — ยังไม่มีหลักฐานแนบ/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("เงินได้ทั้งปี (บาท)"), { target: { value: "12.345" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    expect(p.onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText("เงินได้ทั้งปี (บาท)")).toHaveValue("12.345");
    fireEvent.change(screen.getByLabelText("เงินได้ทั้งปี (บาท)"), { target: { value: "600000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    await screen.findByText("disk full");
    expect(screen.getByLabelText("เงินได้ทั้งปี (บาท)")).toHaveValue("600000");
    expect(p.onUnsavedChange).toHaveBeenLastCalledWith(true);
  });
  it("preserves richer imported rows/treatments/facts instead of flattening them", async () => {
    const t = annualInputs(); t.incomeItems.push({ ...t.incomeItems[0]!, id: crypto.randomUUID(), kind: "domestic-dividend", treatment: "final", electionGroup: "kept" });
    t.facts.spouseHasIncome = "yes";
    const p = props(annualManifest(t)); render(<AnnualTaxWorksheet {...p} />);
    fireEvent.change(screen.getAllByLabelText("เงินได้ทั้งปี (บาท)")[0]!, { target: { value: "700000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledOnce());
    expect(p.onSave.mock.calls[0]![0].incomeItems[1]).toEqual(t.incomeItems[1]);
    expect(p.onSave.mock.calls[0]![0].facts.spouseHasIncome).toBe("yes");
    expect(screen.queryByText("ประมาณการจ่ายเพิ่ม", { exact: true })).toBeNull();
  });
  it("clears completeness when a row changes and disables all writes read-only", () => {
    const p = props(annualManifest(annualInputs()));
    const view = render(<AnnualTaxWorksheet {...p} />);
    const check = screen.getByRole("checkbox", { name: /ยืนยันว่ามีเฉพาะเงินเดือน/ }); expect(check).toBeChecked();
    fireEvent.change(screen.getByLabelText("เงินได้ทั้งปี (บาท)"), { target: { value: "700000" } }); expect(check).not.toBeChecked();
    view.rerender(<AnnualTaxWorksheet {...p} disabled />);
    expect(screen.getByLabelText("เงินได้ทั้งปี (บาท)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" })).toBeDisabled();
  });
  it("hides settlement immediately when evidence or rules change, before replacement hashes finish", async () => {
    const t = annualInputs(), m = annualManifest(t), ruleDigest = "a".repeat(64);
    const sources = await sha256Hex(new TextEncoder().encode(annualSourceProjection(m.records, 2026)));
    t.confirmedSourcesDigest = sources;
    t.confirmedWorksheetDigest = await sha256Hex(new TextEncoder().encode(worksheetProjection(t, { taxYear: 2026, sourcesDigest: sources, ruleDigest, engineVersion: 2 })));
    const p = { ...props(m), bundle: syntheticAnnualRules(), trustedRules: true, ruleDigest };
    const view = render(<AnnualTaxWorksheet {...p} />);
    await screen.findByText("ประมาณการจ่ายเพิ่ม", { exact: true });
    const next = structuredClone(m); next.records[0]!.evidenceAmountSatang = 900000;
    view.rerender(<AnnualTaxWorksheet {...p} manifest={next} />);
    expect(screen.queryByText("ประมาณการจ่ายเพิ่ม", { exact: true })).toBeNull();
    await waitFor(() => expect(screen.getByText(/ข้อมูลหรือเอกสารเปลี่ยน ต้องตรวจและยืนยันใหม่/)).toBeVisible());
    view.rerender(<AnnualTaxWorksheet {...p} ruleDigest={"b".repeat(64)} />);
    expect(screen.queryByText("ประมาณการขอคืน", { exact: true })).toBeNull();
  });
  it("never renders final totals with the production missing-rule condition", async () => {
    render(<AnnualTaxWorksheet {...props(annualManifest(annualInputs()))} />);
    expect(screen.getByText(/ยังไม่มีกฎคำนวณรายปี 2569 ที่ครบถ้วน/)).toBeVisible();
    expect(screen.queryByText("ประมาณการจ่ายเพิ่ม", { exact: true })).toBeNull();
  });
});
