import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TaxPlanPanel, type TaxPlanPanelProps } from "../../src/ui/TaxPlanPanel";
import { planCompletionProjection } from "../../src/domain/planning";
import { sha256Hex } from "../../src/storage/hash";
import { confirmFixture, planFixture } from "../fixtures/plan";
import { shippedBundle, testOnlyTrustedClone } from "../fixtures/tax/2025-slice";

function props(): TaxPlanPanelProps {
  return { manifest: planFixture(), taxYear: 2025, bundle: shippedBundle(), ruleDigest: null, trustedRules: false, onUnsavedChange: vi.fn(), onSave: vi.fn().mockResolvedValue(undefined), onVerifyEvidence: vi.fn().mockResolvedValue(undefined) };
}

describe("simple saved tax plan", () => {
  it("requires a valid budget and preserves unknown eligibility rather than defaulting to eligible", async () => {
    const p = props();
    p.manifest.years["2025"]!.plan = null;
    p.manifest.years["2025"]!.scenarios = [];
    render(<TaxPlanPanel {...p} />);
    fireEvent.change(screen.getByLabelText(/เบี้ยสุขภาพที่จะจ่ายเพิ่ม/), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแผน" }));
    expect(screen.getByText(/กรอกยอดเพิ่มและงบประมาณให้ถูกต้อง/)).toBeVisible();
    expect(p.onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/งบประมาณที่จ่ายเพิ่มได้/), { target: { value: "5000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแผน" }));
    expect(screen.getByText(/ยอดที่วางแผนเกินงบประมาณ/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/งบประมาณที่จ่ายเพิ่มได้/), { target: { value: "10000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแผน" }));
    await waitFor(() => expect(p.onSave).toHaveBeenCalledWith(expect.objectContaining({ budgetSatang: 1000000, contributions: [expect.objectContaining({ eligibility: "unknown", liquidityAccepted: "unknown" })] }), expect.objectContaining({ paid: false, completionDigest: null }), false));
  });
  it("keeps unverified savings unavailable, not zero or tax-authority-approved", async () => {
    render(<TaxPlanPanel {...props()} />);
    expect(screen.getByText(/กำหนดเวลาตามกฎหมาย: ยังไม่ยืนยัน/)).toBeVisible();
    expect(screen.getByText(/ตามแผนที่บันทึก: ยังประเมินไม่ได้ \(ไม่ใช่ 0\)/)).toBeVisible();
    expect(screen.getByText(/จากรายการที่ทำครบแล้ว: ยังประเมินไม่ได้/)).toBeVisible();
    expect(screen.getByText(/กฎปีนี้ยังไม่ตรงกับชุดที่ตรวจทานแล้ว/)).toBeVisible();
  });
  it("separates saved projected savings from verified completion and checks attachment bytes on reopen", async () => {
    const p = props();
    p.bundle = testOnlyTrustedClone(shippedBundle()); p.trustedRules = true;
    await confirmFixture(p.manifest);
    p.manifest.years["2025"]!.plan!.completionDigest = await sha256Hex(new TextEncoder().encode(planCompletionProjection(p.manifest, 2025)));
    render(<TaxPlanPanel {...p} />);
    expect(await screen.findByText(/สถานะแผน: ทำรายการครบแล้ว · ความคืบหน้า 1\/1/)).toBeVisible();
    expect(screen.getByText(/ตามแผนที่บันทึก: จ่ายเพิ่ม 10,000.00 บาท · ประหยัดภาษี 1,000.00 บาท · เงินจ่ายสุทธิ 9,000.00 บาท/)).toBeVisible();
    expect(screen.getByText(/จากรายการที่ทำครบแล้ว: จ่ายเพิ่ม 8,000.00 บาท · ประหยัดภาษี 800.00 บาท · เงินจ่ายสุทธิ 7,200.00 บาท/)).toBeVisible();
    expect(p.onVerifyEvidence).toHaveBeenCalledWith(p.manifest.records[0]!.id);
  });
  it("withholds completed estimates when evidence bytes cannot be verified", async () => {
    const p = props();
    p.bundle = testOnlyTrustedClone(shippedBundle()); p.trustedRules = true;
    await confirmFixture(p.manifest);
    p.manifest.years["2025"]!.plan!.completionDigest = await sha256Hex(new TextEncoder().encode(planCompletionProjection(p.manifest, 2025)));
    p.onVerifyEvidence = vi.fn().mockRejectedValue(new Error("hash mismatch"));
    render(<TaxPlanPanel {...p} />);
    await waitFor(() => expect(p.onVerifyEvidence).toHaveBeenCalled());
    expect(screen.getByText(/สถานะแผน: ต้องตรวจสอบใหม่/)).toBeVisible();
    expect(screen.getByText(/จากรายการที่ทำครบแล้ว: ยังประเมินไม่ได้/)).toBeVisible();
  });
  it("keeps failed saves editable and guarded, including raw invalid edits", async () => {
    const p = props(); p.onSave = vi.fn().mockRejectedValue(new Error("disk full"));
    render(<TaxPlanPanel {...p} />);
    fireEvent.change(screen.getByLabelText(/เบี้ยสุขภาพที่จะจ่ายเพิ่ม/), { target: { value: "9000" } });
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแผน" }));
    expect(await screen.findByText("disk full")).toBeVisible();
    expect(p.onUnsavedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByLabelText(/เบี้ยสุขภาพที่จะจ่ายเพิ่ม/)).toHaveValue("9000");
    expect(screen.getByRole("button", { name: "บันทึกแผน" })).toBeEnabled();
  });
  it("disables writes for read-only folders", () => {
    const p = props(); render(<TaxPlanPanel {...p} disabled />);
    expect(screen.getByLabelText(/เบี้ยสุขภาพที่จะจ่ายเพิ่ม/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "บันทึกแผน" }));
    expect(p.onSave).not.toHaveBeenCalled();
  });
});
