import { describe, expect, it } from "vitest";
import { parseForm } from "../../src/ui/DocumentEditor";

const base = {
  taxYear: 2026,
  category: "donation_general", subcategory: null,
  date: "2026-06-15",
  title: "บริจาค",
  issuer: "มูลนิธิ",
  notes: "",
  evidence: "500",
  claimed: "500",
  withheld: "",
  status: "waiting-review" as const,
  noAttachmentConfirmed: false,
};

describe("parseForm", () => {
  it("converts valid raw input to satang and keeps blank amounts as unknown", () => {
    const result = parseForm(base, []);
    expect(result).toMatchObject({ ok: true, draft: { evidenceAmountSatang: 50000, claimedAmountSatang: 50000, withheldAmountSatang: null } });
  });
  it("keeps invalid amount text out of the draft and reports the field", () => {
    const result = parseForm({ ...base, claimed: "12.345" }, []);
    expect(result).toMatchObject({ ok: false, errors: { claimed: expect.any(String) } });
  });
  it("requires explicit confirmation before marking reviewed without attachments", () => {
    expect(parseForm({ ...base, status: "reviewed" }, [])).toMatchObject({ ok: false, errors: { status: expect.any(String) } });
    expect(parseForm({ ...base, status: "reviewed", noAttachmentConfirmed: true }, [])).toMatchObject({ ok: true });
    expect(parseForm({ ...base, status: "reviewed" }, ["11111111-2222-4333-8444-555555555555"])).toMatchObject({ ok: true });
  });
});

describe("parseForm subtype", () => {
  it("carries a same-parent subtype and null into the draft", () => {
    expect(parseForm({ ...base, category: "deduction_retirement", subcategory: "fund_rmf" }, [])).toMatchObject({ ok: true, draft: { subcategory: "fund_rmf" } });
    expect(parseForm({ ...base, category: "donation_general", subcategory: null }, [])).toMatchObject({ ok: true, draft: { subcategory: null } });
  });
  it("rejects a subtype from the other parent and keeps the form", () => {
    expect(parseForm({ ...base, category: "deduction_retirement", subcategory: "insurance_life" }, [])).toMatchObject({ ok: false, errors: { subcategory: expect.any(String) } });
  });
});
