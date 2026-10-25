import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaxWorksheet, TAX_CAVEATS } from "../../src/ui/TaxWorksheet";
import { manifestSchema, type Manifest } from "../../src/domain/schema";
import type { TaxInputs } from "../../src/domain/taxInputs";
import { shippedBundle } from "../fixtures/tax/2025-slice";
import { planFixture } from "../fixtures/plan";

const WS = "11111111-2222-4333-8444-555555555555";
const manifestWith = (taxInputs: TaxInputs | null): Manifest =>
  manifestSchema.parse({
    schemaVersion: 3, workspaceId: WS, revision: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    taxpayer: { displayName: "ผู้ทดสอบ" },
    years: { "2025": { taxYear: 2025, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs, scenarios: [] } },
    records: [], attachments: {},
  });

function fillForm(): void {
  fireEvent.change(screen.getByLabelText(/เงินเดือนรวมทั้งปี/), { target: { value: "600000" } });
  fireEvent.change(screen.getByLabelText(/อายุ ณ สิ้นปีภาษี/), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText(/จำนวนบุตร/), { target: { value: "0" } });
  for (const label of [/ภาษีหัก ณ ที่จ่ายรวม/, /เงินสมทบประกันสังคม/, /เบี้ยประกันสุขภาพที่จ่ายจริง/]) fireEvent.change(screen.getByLabelText(label), { target: { value: "0" } });
  for (const [label, value] of [[/อยู่ในประเทศไทย/, "yes"], [/มีสถานภาพสมรส/, "no"], [/อายุ 65 ปีขึ้นไป/, "no"], [/มีรายได้อื่น/, "no"], [/มีรายการลดหย่อนอื่น/, "no"]] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByLabelText(/รายได้และภาษีหัก ณ ที่จ่ายครบแล้ว/));
  fireEvent.click(screen.getByLabelText(/รายการลดหย่อนครบแล้ว/));
}

describe("TaxWorksheet persisted worksheet", () => {
  it("does not flatten richer imported worksheets or erase their evidence links", () => {
    const manifest = planFixture();
    manifest.years["2025"]!.taxInputs!.deductions.push({ id: "00000000-0000-4000-8000-000000000099", category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: 800000, eligibility: "yes", sourceRecordIds: [manifest.records[0]!.id] });
    const before = JSON.stringify(manifest);
    const onSave = vi.fn();
    render(<TaxWorksheet manifest={manifest} taxYear={2025} bundle={null} ruleDigest={null} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/เงินเดือนรวมทั้งปี/), { target: { value: "700000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    expect(screen.getByText(/จึงไม่บันทึกทับข้อมูลเดิม/)).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    expect(JSON.stringify(manifest)).toBe(before);
  });
  it("keeps secondary details collapsed and the main limitation visible", () => {
    render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={null} ruleDigest={null} onSave={vi.fn()} />);
    expect(screen.getByText("ขอบเขตและข้อควรรู้ก่อนใช้").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/เป็นเครื่องมือประมาณการ ไม่ใช่การยื่นภาษี/)).toBeVisible();
  });

  it("reports unsaved drafts to the navigation guard and clears it on unmount", () => {
    const onUnsavedChange = vi.fn();
    const { unmount } = render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={null} ruleDigest={null} onSave={vi.fn()} onUnsavedChange={onUnsavedChange} />);
    expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(screen.getByLabelText(/เงินเดือนรวมทั้งปี/), { target: { value: "600000" } });
    expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
    unmount();
    expect(onUnsavedChange).toHaveBeenLastCalledWith(false);
  });

  it("disables worksheet writes in a read-only workspace", () => {
    const onSave = vi.fn();
    render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={null} ruleDigest={null} onSave={onSave} disabled />);
    expect(screen.getByLabelText(/เงินเดือนรวมทั้งปี/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps a failed save editable and dirty so the user can retry", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("พื้นที่ไม่เพียงพอ"));
    const onUnsavedChange = vi.fn();
    render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={null} ruleDigest={null} onSave={onSave} onUnsavedChange={onUnsavedChange} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    expect(await screen.findByText("พื้นที่ไม่เพียงพอ")).toBeVisible();
    expect(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" })).toBeEnabled();
    expect(onUnsavedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText(/เงินเดือนรวมทั้งปี/)).toHaveValue("600000");
  });





  it("shows caveats and never a final tax while the rules are blocked", () => {
    render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={shippedBundle()} ruleDigest={null} onSave={vi.fn()} />);
    for (const c of TAX_CAVEATS) expect(screen.getByText(c)).toBeInTheDocument();
    expect(screen.getByText(/ยอดภาษีสุดท้าย ยอดชำระเพิ่ม และยอดขอคืน ยังไม่แสดง/)).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีข้อมูลภาษีที่บันทึก/)).toBeInTheDocument();
  });

  it("saves the typed worksheet through the handler and then shows intermediate lines from the saved data", async () => {
    const onSave = vi.fn((_t: TaxInputs) => Promise.resolve());
    const { rerender } = render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={shippedBundle()} ruleDigest={null} onSave={onSave} />);
    fillForm();
    expect(screen.getByText(/มีการแก้ไขที่ยังไม่บันทึก/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]![0];
    expect(saved.incomeItems[0]).toMatchObject({ kind: "salary", grossAmountSatang: 60_000_000, treatment: "progressive" });
    expect(saved.confirmedSourcesDigest).toBeNull();
    rerender(<TaxWorksheet manifest={manifestWith(saved)} taxYear={2025} bundle={shippedBundle()} ruleDigest={null} onSave={onSave} />);
    expect(await screen.findByText("21,500.00")).toBeInTheDocument();
    expect(screen.getByText(/ภาษีตามขั้นบันได \(ก่อนปัดเศษ ยังไม่ใช่ยอดชำระ\)/)).toBeInTheDocument();
  });

  it("asks for missing facts and does not save an invalid amount", () => {
    const onSave = vi.fn((_t: TaxInputs) => Promise.resolve());
    render(<TaxWorksheet manifest={manifestWith(null)} taxYear={2025} bundle={shippedBundle()} ruleDigest={null} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText(/เงินเดือนรวมทั้งปี/), { target: { value: "12.345" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกข้อมูลภาษี" }));
    expect(screen.getByText(/รูปแบบจำนวนเงินไม่ถูกต้อง/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });


});
