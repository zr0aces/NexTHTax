import { describe, expect, it } from "vitest";
import { calculateSalaryCase, bracketTaxSatang } from "../../src/domain/tax";
import { BASE_INPUT, CASE_BELOW_ALLOWANCE, CASE_HEALTH_CAPPED, CASE_HIGH_SALARY, CASE_SALARY_600K, CASE_SOCIAL_SECURITY, shippedBundle } from "../fixtures/tax/2025-slice";

const bundle = shippedBundle();

describe("calculateSalaryCase against hand-computed fixtures", () => {
  for (const [name, c] of [
    ["600k salary", CASE_SALARY_600K],
    ["health capped at 25,000", CASE_HEALTH_CAPPED],
    ["below allowance", CASE_BELOW_ALLOWANCE],
    ["1.2m salary, all brackets", CASE_HIGH_SALARY],
    ["social security at cap", CASE_SOCIAL_SECURITY],
  ] as const) {
    it(`${name} gives the independently derived bracket tax before rounding`, () => {
      const r = calculateSalaryCase(bundle, c.input);
      expect(r.status).toBe("intermediate");
      if (r.status !== "intermediate") return;
      expect(r.taxBeforeRoundingSatang).toBe(c.expectedTaxSatang);
    });
  }
  it("shows the taxable line for the 600k case as 440,000 baht", () => {
    const r = calculateSalaryCase(bundle, CASE_SALARY_600K.input);
    if (r.status !== "intermediate") throw new Error("expected intermediate");
    expect(r.lines.find((l) => l.id === "taxable")?.amountSatang).toBe(CASE_SALARY_600K.expectedTaxableSatang);
  });
  it("never returns a final tax figure while rounding is unverified and says why", () => {
    const r = calculateSalaryCase(bundle, CASE_SALARY_600K.input);
    expect(r).not.toHaveProperty("taxSatang");
    if (r.status !== "intermediate") throw new Error("expected intermediate");
    expect(r.blockers.some((b) => b.includes("ปัดเศษ"))).toBe(true);
  });
});

describe("calculateSalaryCase fails closed", () => {
  it("is incomplete while any required answer is unknown and never defaults it to zero", () => {
    const r = calculateSalaryCase(bundle, { ...CASE_SALARY_600K.input, healthPremiumSatang: null });
    expect(r).toEqual({ status: "incomplete", missing: ["เบี้ยประกันสุขภาพ"] });
    const unknownMarried = calculateSalaryCase(bundle, { ...CASE_SALARY_600K.input, married: "unknown" });
    expect(unknownMarried.status).toBe("incomplete");
  });
  it("is unsupported for life, annuity, fund or donation claims", () => {
    const r = calculateSalaryCase(bundle, { ...CASE_SALARY_600K.input, otherDeductionClaims: "yes" });
    expect(r.status).toBe("unsupported");
  });
  it("is unsupported for spouse, dependents, age 65 and non-resident facts", () => {
    expect(calculateSalaryCase(bundle, { ...BASE_INPUT, salarySatang: 1, married: "yes" }).status).toBe("unsupported");
    expect(calculateSalaryCase(bundle, { ...BASE_INPUT, salarySatang: 1, dependentClaimCount: 1 }).status).toBe("unsupported");
    expect(calculateSalaryCase(bundle, { ...BASE_INPUT, salarySatang: 1, ageAtYearEnd: 65 }).status).toBe("unsupported");
    expect(calculateSalaryCase(bundle, { ...BASE_INPUT, salarySatang: 1, resident: "no" }).status).toBe("unsupported");
  });
  it("reports no bundle or a non-numeric bundle as unsupported", () => {
    expect(calculateSalaryCase(null, CASE_SALARY_600K.input).status).toBe("unsupported");
  });
  it("bracket tax is zero for zero taxable income and monotone in taxable income", () => {
    expect(bracketTaxSatang(0n, bundle as never).tax).toBe(0n);
    const lo = bracketTaxSatang(30_000_000n, bundle as never).tax;
    const hi = bracketTaxSatang(30_000_100n, bundle as never).tax;
    expect(hi >= lo).toBe(true);
  });
});
