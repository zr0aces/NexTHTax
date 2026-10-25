import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentEditor } from "../../src/ui/DocumentEditor";
import { isSubcategoryApplicable, type RecordDraft } from "../../src/domain/documents";
import type { RecordEntry } from "../../src/domain/schema";

const record: RecordEntry = {
  id: "00000000-0000-4000-8000-00000000000a", taxYear: 2026, category: "deduction_retirement", subcategory: "fund_rmf",
  date: "2026-06-01", title: "ใบยืนยันกองทุน", issuer: "", notes: "", evidenceAmountSatang: null, claimedAmountSatang: null,
  withheldAmountSatang: null, status: "waiting-review", attachmentIds: [], createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
};

function renderEditor(onSave = vi.fn((draft: RecordDraft) => Promise.resolve({ ...record, ...draft }) as Promise<RecordEntry>)) {
  render(
    <DocumentEditor
      record={record} attachments={[]} missingNames={[]} onSave={onSave} onUnsavedChange={vi.fn()}
      onAddFile={vi.fn()} onLink={vi.fn()} onUnlink={vi.fn()} onPreview={vi.fn()}
    />,
  );
  return onSave;
}

describe("DocumentEditor subtype", () => {
  it("saves a subtype-only change with the same broad category", async () => {
    const onSave = renderEditor();
    fireEvent.change(screen.getByLabelText(/ประเภทเอกสารย่อย/), { target: { value: "fund_thai_esg" } });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ category: "deduction_retirement", subcategory: "fund_thai_esg" }));
  });

  it("clears the subtype in the same update as a parent change and never saves a cross-parent pair", async () => {
    const onSave = renderEditor();
    fireEvent.change(screen.getByLabelText(/^หมวด/), { target: { value: "deduction_insurance" } });
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ category: "deduction_insurance", subcategory: null }));
    for (const [draft] of onSave.mock.calls) expect(isSubcategoryApplicable(draft.category, draft.subcategory)).toBe(true);
    expect(screen.getByRole("option", { name: "ประกันชีวิต" })).toBeInTheDocument();
  });

  it("hides the subtype selector for a non-applicable parent", () => {
    renderEditor();
    fireEvent.change(screen.getByLabelText(/^หมวด/), { target: { value: "income_salary" } });
    expect(screen.queryByLabelText(/ประเภทเอกสารย่อย/)).toBeNull();
  });
});
