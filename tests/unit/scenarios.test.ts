import { describe, expect, it } from "vitest";
import { compareHealthScenarios, type HealthScenario } from "../../src/domain/scenarios";
import { CASE_SALARY_600K, shippedBundle, testOnlyTrustedClone } from "../fixtures/tax/2025-slice";

const shipped = shippedBundle();
// Expected baseline tax 21,500 baht (2,150,000 satang). Health 25k case -> 19,000 baht. Health 10k case -> 20,500 baht.
const scenarios: HealthScenario[] = [
  { id: "h25", label: "เบี้ยสุขภาพเพิ่ม 30,000 (ได้สูงสุด 25,000)", additionalHealthSatang: 30_000_00, eligible: "yes" },
  { id: "h10", label: "เบี้ยสุขภาพเพิ่ม 10,000", additionalHealthSatang: 10_000_00, eligible: "yes" },
  { id: "h5", label: "ยังไม่ทราบเงื่อนไข", additionalHealthSatang: 5_000_00, eligible: "unknown" },
  { id: "hx", label: "ไม่เข้าเงื่อนไข", additionalHealthSatang: 5_000_00, eligible: "no" },
];

describe("compareHealthScenarios gate", () => {
  it("is blocked for the shipped bundle because rounding and components are unverified", () => {
    const r = compareHealthScenarios(shipped, CASE_SALARY_600K.input, scenarios, null);
    expect(r.status).toBe("blocked");
    if (r.status !== "blocked") return;
    expect(r.reasons.some((x) => x.includes("ปัดเศษ"))).toBe(true);
  });
});

describe("compareHealthScenarios ranking (test-only trusted clone, not an official rule set)", () => {
  const trusted = testOnlyTrustedClone(shipped);
  it("ranks complete feasible candidates and reports unknowns as not evaluated, never infeasible", () => {
    const r = compareHealthScenarios(trusted, CASE_SALARY_600K.input, scenarios, null);
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.baselineTaxBeforeRoundingSatang).toBe(2_150_000);
    const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(byId.h25).toEqual({ id: "h25", status: "complete", savingSatang: 250_000 }); // 21,500 - 19,000 = 2,500 baht
    expect(byId.h10).toEqual({ id: "h10", status: "complete", savingSatang: 100_000 }); // 21,500 - 20,500 = 1,000 baht
    expect(byId.h5).toMatchObject({ status: "unknown" });
    expect(byId.hx).toMatchObject({ status: "infeasible" });
    expect(r.winnerIds).toEqual(["h25"]);
    expect(r.evaluatedCount).toBe(2);
    expect(r.notEvaluatedCount).toBe(1);
  });
  it("applies the budget to the candidate delta and marks over-budget candidates infeasible", () => {
    const r = compareHealthScenarios(trusted, CASE_SALARY_600K.input, scenarios, 20_000_00);
    if (r.status !== "ranked") throw new Error("expected ranked");
    const byId = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    expect(byId.h25).toMatchObject({ status: "infeasible", reason: "เกินงบที่ผู้ใช้ระบุ" });
    expect(r.winnerIds).toEqual(["h10"]);
  });
  it("reports no winner when no candidate is complete and feasible", () => {
    const r = compareHealthScenarios(trusted, CASE_SALARY_600K.input, [scenarios[2]!, scenarios[3]!], null);
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.winnerIds).toEqual([]);
    expect(r.evaluatedCount).toBe(0);
  });
  it("keeps saving between zero and the baseline tax for a zero-amount scenario", () => {
    const r = compareHealthScenarios(trusted, CASE_SALARY_600K.input, [{ id: "zero", label: "ไม่เพิ่ม", additionalHealthSatang: 0, eligible: "yes" }], null);
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.rows[0]).toEqual({ id: "zero", status: "complete", savingSatang: 0 });
  });
});
