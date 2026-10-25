import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, SUBCATEGORY_IDS, invalidatesReview, isSubcategoryApplicable, subcategoriesFor, subcategoryLabel, validateDraft, type RecordDraft } from "../../src/domain/documents";

const base: RecordDraft = {
  taxYear: 2026,
  category: "income_salary", subcategory: null,
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
    const errors = validateDraft({ ...base, category: "corp_vat", subcategory: null, date: "2026-02-30", title: "  ", taxYear: 1500 });
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

describe("subcategory registry", () => {
  it("has thirteen stable IDs under the two broad parents", () => {
    expect(SUBCATEGORY_IDS).toEqual([
      "fund_rmf", "fund_thai_esg", "fund_thai_esgx", "fund_ssf", "fund_ltf", "fund_provident", "fund_gpf", "fund_nsf", "fund_other",
      "insurance_life", "insurance_annuity", "insurance_health", "insurance_other",
    ]);
    expect(subcategoriesFor("deduction_retirement").map((s) => s.id)).toEqual(["fund_rmf", "fund_thai_esg", "fund_thai_esgx", "fund_ssf", "fund_ltf", "fund_provident", "fund_gpf", "fund_nsf", "fund_other"]);
    expect(subcategoriesFor("deduction_insurance").map((s) => s.id)).toEqual(["insurance_life", "insurance_annuity", "insurance_health", "insurance_other"]);
    expect(subcategoriesFor("income_salary")).toEqual([]);
  });
  it("keeps the broad category list unchanged at 15 IDs", () => {
    expect(CATEGORY_IDS).toHaveLength(15);
    expect(CATEGORY_IDS).not.toEqual(expect.arrayContaining(["fund_rmf", "insurance_life"]));
  });
  it("labels null as unclassified and keeps the two other-options distinct", () => {
    expect(subcategoryLabel(null)).toBe("รอจัดประเภท");
    expect(subcategoryLabel("fund_other")).toBe("กองทุนอื่น ๆ");
    expect(subcategoryLabel("insurance_other")).toBe("ประกันอื่น ๆ");
    expect(subcategoryLabel("fund_other")).not.toBe(subcategoryLabel("insurance_other"));
  });
  it("accepts null for every parent and only same-parent IDs otherwise", () => {
    expect(isSubcategoryApplicable("income_salary", null)).toBe(true);
    expect(isSubcategoryApplicable("deduction_retirement", "fund_rmf")).toBe(true);
    expect(isSubcategoryApplicable("deduction_retirement", "insurance_life")).toBe(false);
    expect(isSubcategoryApplicable("deduction_insurance", "fund_rmf")).toBe(false);
    expect(isSubcategoryApplicable("income_salary", "fund_rmf")).toBe(false);
    expect(isSubcategoryApplicable("deduction_insurance", "")).toBe(false);
  });
  it("reports cross-parent subtype pairs in validateDraft", () => {
    expect(validateDraft({ ...base, category: "deduction_retirement", subcategory: "insurance_life" }).subcategory).toBeDefined();
    expect(validateDraft({ ...base, category: "deduction_retirement", subcategory: "fund_thai_esg" })).toEqual({});
  });
});

describe("subcategory review invalidation", () => {
  const prev = { ...base, category: "deduction_retirement", subcategory: "fund_rmf" as const, claimedAmountSatang: 100, attachmentIds: [] };
  it("is false when the same subtype is kept", () => {
    expect(invalidatesReview(prev, { ...prev, title: prev.title })).toBe(false);
  });
  it("is true when the subtype changes or is cleared", () => {
    expect(invalidatesReview(prev, { ...prev, subcategory: "fund_thai_esg" })).toBe(true);
    expect(invalidatesReview(prev, { ...prev, subcategory: null })).toBe(true);
  });
  it("is true when a parent change also clears the subtype", () => {
    expect(invalidatesReview(prev, { ...prev, category: "deduction_insurance", subcategory: null })).toBe(true);
  });
});
