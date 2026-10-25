import { describe, expect, it } from "vitest";
import { invalidatesReview, validateDraft, type RecordDraft } from "../../src/domain/documents";

const base: RecordDraft = {
  taxYear: 2026,
  category: "income_salary",
  date: "2026-03-31",
  title: "เงินเดือนมีนาคม",
  issuer: "บริษัท ตัวอย่าง",
  notes: "",
  evidenceAmountSatang: 5000000,
  claimedAmountSatang: null,
  withheldAmountSatang: 100000,
  status: "waiting-review",
  attachmentIds: [],
};

describe("validateDraft", () => {
  it("accepts a valid draft", () => {
    expect(validateDraft(base)).toEqual({});
  });
  it("flags unknown category, bad date, blank title and unsupported year", () => {
    const errors = validateDraft({ ...base, category: "corp_vat", date: "2026-02-30", title: "  ", taxYear: 1500 });
    expect(Object.keys(errors).sort()).toEqual(["category", "date", "taxYear", "title"]);
  });
  it("rejects negative or non-integer amounts", () => {
    expect(validateDraft({ ...base, evidenceAmountSatang: -1 }).evidenceAmountSatang).toBeDefined();
    expect(validateDraft({ ...base, claimedAmountSatang: 1.5 }).claimedAmountSatang).toBeDefined();
  });
});

describe("invalidatesReview", () => {
  it("is true when a meaningful field changes", () => {
    const prev = { ...base, claimedAmountSatang: 100, attachmentIds: [] };
    expect(invalidatesReview(prev, { ...base, claimedAmountSatang: 200 })).toBe(true);
    expect(invalidatesReview(prev, { ...base, attachmentIds: ["x"] })).toBe(true);
  });
  it("is false for status-only changes", () => {
    expect(invalidatesReview(base, { ...base, status: "reviewed" })).toBe(false);
  });
});
