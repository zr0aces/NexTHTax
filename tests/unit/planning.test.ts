import { describe, expect, it } from "vitest";
import { planCompletionProjection, planEstimates, planReviewReasons, planStatus } from "../../src/domain/planning";
import { manifestSchema, v2ManifestSchema } from "../../src/domain/schema";
import { planFixture } from "../fixtures/plan";
import { shippedBundle, testOnlyTrustedClone } from "../fixtures/tax/2025-slice";

describe("single saved health plan", () => {
  it("separates projected and completed amounts, including a zero-cost do-nothing baseline", () => {
    const m = planFixture();
    const bundle = testOnlyTrustedClone(shippedBundle());
    expect(planEstimates(m, 2025, bundle, true, true, false)).toMatchObject({ projected: { outlaySatang: 1000000, savingSatang: 100000, netCostSatang: 900000 }, actual: null });
    expect(planEstimates(m, 2025, bundle, true, true, true).actual).toEqual({ outlaySatang: 800000, savingSatang: 80000, netCostSatang: 720000 });
    m.years["2025"]!.scenarios[0]!.contributions[0]!.additionalContributionSatang = 0;
    expect(planEstimates(m, 2025, bundle, true, true, false).projected).toEqual({ outlaySatang: 0, savingSatang: 0, netCostSatang: 0 });
  });
  it("fails closed for untrusted, incomplete, wrong-year, unknown eligibility and over-budget inputs", () => {
    const m = planFixture(), bundle = testOnlyTrustedClone(shippedBundle());
    for (const [year, rules, trusted, confirmed] of [[2025, bundle, false, true], [2025, bundle, true, false], [2026, bundle, true, true], [2025, shippedBundle(), true, true]] as const) {
      expect(planEstimates(m, year, rules, trusted, confirmed, true)).toMatchObject({ projected: null, actual: null });
    }
    m.years["2025"]!.scenarios[0]!.contributions[0]!.eligibility = "unknown";
    expect(planEstimates(m, 2025, bundle, true, true, false).projected).toBeNull();
    m.years["2025"]!.scenarios[0]!.contributions[0]!.eligibility = "yes";
    m.years["2025"]!.scenarios[0]!.budgetSatang = 1;
    expect(planEstimates(m, 2025, bundle, true, true, false).projected).toBeNull();
  });
  it("requires payment, eligibility, evidence, current confirmation and verified file bytes", () => {
    const m = planFixture(), plan = m.years["2025"]!.plan!;
    expect(planReviewReasons(m, 2025)).toEqual([]);
    expect(planStatus(m, 2025, "a".repeat(64), true)).toBe("needs-review");
    plan.completionDigest = "a".repeat(64);
    expect(planStatus(m, 2025, plan.completionDigest, true)).toBe("completed");
    expect(planStatus(m, 2025, plan.completionDigest, false)).toBe("needs-review");
    m.records[0]!.status = "waiting-review";
    expect(planStatus(m, 2025, plan.completionDigest, true)).toBe("needs-review");
    plan.paid = false;
    expect(planStatus(m, 2025, null, false)).toBe("planned");
  });
  it("does not compute with unknown baseline deduction eligibility or unsafe aggregate amounts", () => {
    const m = planFixture(), bundle = testOnlyTrustedClone(shippedBundle());
    m.years["2025"]!.taxInputs!.deductions.push({ id: m.records[0]!.id, category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: 10000, eligibility: "unknown", sourceRecordIds: [] });
    expect(planEstimates(m, 2025, bundle, true, true, false).projected).toBeNull();
    m.years["2025"]!.taxInputs!.deductions[0]!.eligibility = "yes";
    m.years["2025"]!.taxInputs!.deductions[0]!.existingContributionSatang = Number.MAX_SAFE_INTEGER;
    expect(planEstimates(m, 2025, bundle, true, true, false).projected).toBeNull();
  });
  it("rejects uncertain, mismatched and double-counted evidence", () => {
    for (const change of [
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.plan!.actualAmountSatang = null; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.plan!.actualAmountSatang = 800001; },
      (m: ReturnType<typeof planFixture>) => { m.records[0]!.attachmentIds = []; },
      (m: ReturnType<typeof planFixture>) => { m.records[0]!.trashedAt = m.updatedAt; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.plan!.baselineExcludesAction = false; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.taxInputs!.incomeItems[0]!.sourceRecordIds = [m.records[0]!.id]; },
    ]) { const m = planFixture(); change(m); expect(planReviewReasons(m, 2025).length).toBeGreaterThan(0); }
  });
  it("invalidates completion for changed income, evidence, scenario, annual rules or attachment hashes", () => {
    const before = planCompletionProjection(planFixture(), 2025);
    for (const change of [
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.taxInputs!.incomeItems[0]!.grossAmountSatang = 70000000; },
      (m: ReturnType<typeof planFixture>) => { m.records[0]!.evidenceAmountSatang = 1; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.scenarios[0]!.budgetSatang = 2000000; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.rulesDigest = "b".repeat(64); },
      (m: ReturnType<typeof planFixture>) => { Object.values(m.attachments)[0]!.sha256 = "b".repeat(64); },
    ]) { const m = planFixture(); change(m); expect(planCompletionProjection(m, 2025)).not.toBe(before); }
    const m = planFixture(); m.years["2025"]!.plan!.completionDigest = "a".repeat(64);
    expect(planCompletionProjection(m, 2025)).toBe(before);
  });
  it("validates plan references, year isolation and frozen v2 reader incompatibility", () => {
    const m = planFixture();
    expect(v2ManifestSchema.safeParse(m).success).toBe(false);
    m.records[0]!.taxYear = 2026;
    expect(manifestSchema.safeParse(m).success).toBe(false);
    m.records[0]!.taxYear = 2025;
    m.years["2025"]!.plan!.scenarioId = m.records[0]!.id;
    expect(manifestSchema.safeParse(m).success).toBe(false);
  });
});
