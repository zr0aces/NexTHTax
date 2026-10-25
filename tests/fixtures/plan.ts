import { manifestSchema, SCHEMA_VERSION, type Manifest } from "../../src/domain/schema";
import { sha256Hex } from "../../src/storage/hash";
import { sourceProjection, worksheetProjection } from "../../src/domain/taxInputs";

export const PLAN_ID = "00000000-0000-4000-8000-000000000001";
export const EVIDENCE_ID = "00000000-0000-4000-8000-000000000002";
export const ATTACHMENT_ID = "00000000-0000-4000-8000-000000000003";
const T = "2026-10-25T00:00:00.000Z";

export function planFixture(): Manifest {
  return manifestSchema.parse({
    schemaVersion: SCHEMA_VERSION, workspaceId: PLAN_ID, revision: 1, createdAt: T, updatedAt: T,
    taxpayer: { displayName: "ผู้ทดสอบ" },
    years: { "2025": {
      taxYear: 2025, rulesVersion: null, rulesDigest: null, eligibility: {},
      taxInputs: {
        incomeItems: [{ id: PLAN_ID, sourceRecordIds: [], kind: "salary", grossAmountSatang: 60000000, withheldAmountSatang: 0, treatment: "progressive", electionGroup: null }],
        deductions: [],
        facts: { resident: "yes", ageAtYearEnd: 40, elderlyOrDisabled: "no", married: "no", separateFiling: "unknown", spouseHasIncome: "unknown", dependentClaimCount: 0 },
        incomeComplete: "yes", withholdingComplete: "yes", deductionsComplete: "yes", finalTaxGroupsComplete: "yes", confirmedSourcesDigest: null, confirmedWorksheetDigest: null,
      },
      scenarios: [{ id: PLAN_ID, label: "แผนประกันสุขภาพ", budgetSatang: 1000000,
        contributions: [{ subcategory: "insurance_health", additionalContributionSatang: 1000000, eligibility: "yes", holdingAccepted: "yes", liquidityAccepted: "yes", riskAccepted: "unknown" }], confirmedChoiceDigest: null }],
      plan: { scenarioId: PLAN_ID, actualAmountSatang: 800000, paid: true, baselineExcludesAction: true, evidenceRecordId: EVIDENCE_ID, completionDigest: null },
    } },
    records: [{ id: EVIDENCE_ID, taxYear: 2025, category: "deduction_insurance", subcategory: "insurance_health", date: "2025-10-01", title: "หลักฐานสุขภาพ", issuer: "ผู้ทดสอบ", notes: "", evidenceAmountSatang: 800000, claimedAmountSatang: 800000, withheldAmountSatang: null, status: "reviewed", attachmentIds: [ATTACHMENT_ID], createdAt: T, updatedAt: T, trashedAt: null }],
    attachments: { [ATTACHMENT_ID]: { id: ATTACHMENT_ID, displayName: "evidence.pdf", path: `attachments/${ATTACHMENT_ID}.pdf`, mediaType: "application/pdf", byteSize: 1, sha256: "a".repeat(64) } },
  });
}

export async function confirmFixture(manifest: Manifest, ruleDigest: string | null = null): Promise<void> {
  const year = manifest.years["2025"]!;
  const input = year.taxInputs!;
  const sourcesDigest = await sha256Hex(new TextEncoder().encode(sourceProjection(manifest.records, 2025)));
  input.confirmedSourcesDigest = sourcesDigest;
  input.confirmedWorksheetDigest = await sha256Hex(new TextEncoder().encode(worksheetProjection(input, { taxYear: 2025, sourcesDigest, ruleDigest, engineVersion: 1 })));
}
