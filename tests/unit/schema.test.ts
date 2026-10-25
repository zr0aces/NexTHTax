import { describe, expect, it } from "vitest";
import { detectSchemaVersion, manifestSchema, SCHEMA_VERSION } from "../../src/domain/schema";
import { decodeCurrentManifest, decodeManifest } from "../../src/storage/manifest";

const ID = "11111111-2222-4333-8444-555555555555";
const ATT = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const valid = () => ({
  schemaVersion: SCHEMA_VERSION,
  workspaceId: ID,
  revision: 1,
  createdAt: "2026-10-25T00:00:00.000Z",
  updatedAt: "2026-10-25T00:00:00.000Z",
  taxpayer: { displayName: "ผู้ทดสอบ" },
  years: {},
  records: [],
  attachments: {},
});

describe("manifestSchema", () => {
  it("accepts an empty workspace", () => {
    expect(manifestSchema.safeParse(valid()).success).toBe(true);
  });
  it("rejects uppercase UUIDs and unknown fields", () => {
    expect(manifestSchema.safeParse({ ...valid(), workspaceId: ATT.toUpperCase() }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...valid(), extra: 1 }).success).toBe(false);
  });
  it("rejects attachment paths outside the generated namespace", () => {
    const m = {
      ...valid(),
      attachments: {
        [ATT]: { id: ATT, displayName: "x", path: "../data.json", mediaType: "application/pdf", byteSize: 1, sha256: "a".repeat(64) },
      },
    };
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("rejects records that reference missing attachments", () => {
    const m = {
      ...valid(),
      records: [
        {
          id: ID, taxYear: 2026, category: "other", subcategory: null, date: "2026-01-01", title: "t", issuer: "", notes: "",
          evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-document",
          attachmentIds: [ATT], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
        },
      ],
    };
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
  it("detects newer schema versions before full validation", () => {
    expect(detectSchemaVersion({ schemaVersion: 2 })).toBe(2);
    expect(detectSchemaVersion({})).toBeNull();
  });
});

const REC = {
  id: ID, taxYear: 2026, category: "deduction_retirement", subcategory: "fund_rmf" as string | null, date: "2026-01-01", title: "t", issuer: "", notes: "",
  evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-document",
  attachmentIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
};
const YEAR = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
const v2 = (over: Record<string, unknown> = {}) => ({ ...valid(), years: { "2026": YEAR }, records: [REC], ...over });
const { subcategory: _sub, ...REC_V1_BASE } = REC;
const v1 = (over: Record<string, unknown> = {}) => ({
  ...valid(), schemaVersion: 1, years: { "2026": { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {} } },
  records: [REC_V1_BASE], ...over,
});

describe("v2 subtype and tax-input contract", () => {
  it("accepts an explicit null and every valid parent-scoped subtype", () => {
    expect(manifestSchema.safeParse(v2()).success).toBe(true);
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, subcategory: null }] })).success).toBe(true);
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, category: "deduction_insurance", subcategory: "insurance_health" }] })).success).toBe(true);
  });
  it("rejects a v2 record that omits subcategory or uses an unknown ID", () => {
    const { subcategory: _s, ...missing } = REC;
    expect(manifestSchema.safeParse(v2({ records: [missing] })).success).toBe(false);
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, subcategory: "" }] })).success).toBe(false);
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, subcategory: "rmf" }] })).success).toBe(false);
  });
  it("rejects a cross-parent pair and an unknown field", () => {
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, subcategory: "insurance_life" }] })).success).toBe(false);
    expect(manifestSchema.safeParse(v2({ records: [{ ...REC, subcategory: "fund_rmf", extra: 1 }] })).success).toBe(false);
  });
  it("requires taxInputs and scenarios on every year and caps scenarios at 20", () => {
    const { taxInputs: _t, ...noTax } = YEAR;
    expect(manifestSchema.safeParse(v2({ years: { "2026": noTax } })).success).toBe(false);
    const scenario = { id: ID, label: "a", budgetSatang: null, contributions: [], confirmedChoiceDigest: null };
    const many = Array.from({ length: 21 }, (_, i) => ({ ...scenario, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    expect(manifestSchema.safeParse(v2({ years: { "2026": { ...YEAR, scenarios: many } } })).success).toBe(false);
  });
  it("rejects worksheet source references that are missing, cross-year or duplicated", () => {
    const item = (sourceRecordIds: string[]) => ({
      id: "00000000-0000-4000-8000-000000000001", sourceRecordIds, kind: "salary", grossAmountSatang: null, withheldAmountSatang: null, treatment: "progressive", electionGroup: null,
    });
    const withInputs = (incomeItems: unknown[]) => ({ ...YEAR, taxInputs: { incomeItems, deductions: [], facts: { resident: "unknown", ageAtYearEnd: null, elderlyOrDisabled: "unknown", married: "unknown", separateFiling: "unknown", spouseHasIncome: "unknown", dependentClaimCount: null }, incomeComplete: "unknown", withholdingComplete: "unknown", deductionsComplete: "unknown", finalTaxGroupsComplete: "unknown", confirmedSourcesDigest: null, confirmedWorksheetDigest: null } });
    expect(manifestSchema.safeParse(v2({ years: { "2026": withInputs([item([ID])]) } })).success).toBe(true);
    expect(manifestSchema.safeParse(v2({ years: { "2026": withInputs([item(["66666666-7777-4888-8999-000000000000"])]) } })).success).toBe(false);
    expect(manifestSchema.safeParse(v2({ years: { "2026": withInputs([item([ID]), { ...item([ID]), id: "00000000-0000-4000-8000-000000000002" }]) } })).success).toBe(false);
  });
});

it("rejects a worksheet deduction whose broad category is not one of the two parents", () => {
  const ded = { id: "00000000-0000-4000-8000-000000000003", sourceRecordIds: [], category: "other", subcategory: null, existingContributionSatang: null, eligibility: "unknown" };
  const blank = { incomeItems: [], facts: { resident: "unknown", ageAtYearEnd: null, elderlyOrDisabled: "unknown", married: "unknown", separateFiling: "unknown", spouseHasIncome: "unknown", dependentClaimCount: null }, incomeComplete: "unknown", withholdingComplete: "unknown", deductionsComplete: "unknown", finalTaxGroupsComplete: "unknown", confirmedSourcesDigest: null, confirmedWorksheetDigest: null };
  expect(manifestSchema.safeParse(v2({ years: { "2026": { ...YEAR, taxInputs: { ...blank, deductions: [ded] } } } })).success).toBe(false);
  expect(manifestSchema.safeParse(v2({ years: { "2026": { ...YEAR, taxInputs: { ...blank, deductions: [{ ...ded, category: "deduction_retirement", subcategory: "fund_rmf" }] } } } })).success).toBe(true);
});

describe("versioned decoding", () => {
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const codeOf = (fn: () => unknown): string | null => {
    try { fn(); return null; } catch (err) { return (err as { code?: string }).code ?? "other"; }
  };
  it("reads a frozen v1 manifest without subcategory and never adds the field", () => {
    const result = decodeManifest(bytes(v1()));
    expect(result.schemaVersion).toBe(1);
    expect("subcategory" in (result as { records: object[] }).records[0]!).toBe(false);
  });
  it("rejects a v1 manifest that carries the v2 subcategory field", () => {
    expect(codeOf(() => decodeManifest(bytes(v1({ records: [REC] }))))).toBe("invalid");
  });
  it("reports version 5 as newer-schema and rejects non-integer or missing versions", () => {
    expect(codeOf(() => decodeManifest(bytes({ ...v2(), schemaVersion: 5 })))).toBe("newer-schema");
    expect(codeOf(() => decodeManifest(bytes({ ...v2(), schemaVersion: "2" })))).toBe("invalid");
    expect(codeOf(() => decodeManifest(bytes({ ...v2(), schemaVersion: 0 })))).toBe("invalid");
  });
  it("decodeCurrentManifest accepts current and reports upgrade-required for v1", () => {
    expect(decodeCurrentManifest(bytes(v2())).schemaVersion).toBe(4);
    expect(codeOf(() => decodeCurrentManifest(bytes(v1())))).toBe("upgrade-required");
  });
});
