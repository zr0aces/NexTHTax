import { describe, expect, it } from "vitest";
import { MAX_SAFE_SATANG, formatSatang, parseBahtInput, sumSatang } from "../../src/domain/money";

describe("parseBahtInput", () => {
  it("treats blank as unknown, not zero", () => {
    expect(parseBahtInput("   ")).toEqual({ ok: true, satang: null });
    expect(parseBahtInput("0")).toEqual({ ok: true, satang: 0 });
  });
  it("parses baht with up to two decimals exactly", () => {
    expect(parseBahtInput("1,234.5")).toEqual({ ok: true, satang: 123450 });
    expect(parseBahtInput("0.07")).toEqual({ ok: true, satang: 7 });
    expect(parseBahtInput("10")).toEqual({ ok: true, satang: 1000 });
  });
  it("rejects malformed, negative, exponent and excess-precision input", () => {
    for (const bad of ["-1", "1.234", "1e3", "abc", "1.2.3", "Infinity", "NaN"]) {
      expect(parseBahtInput(bad)).toEqual({ ok: false, error: "format" });
    }
  });
  it("rejects values beyond the safe integer range instead of wrapping", () => {
    expect(parseBahtInput("999999999999999")).toEqual({ ok: false, error: "range" });
  });
});

describe("formatSatang", () => {
  it("formats with separators using BigInt-safe arithmetic", () => {
    expect(formatSatang(123450)).toBe("1,234.50");
    expect(formatSatang(7)).toBe("0.07");
    expect(formatSatang(0)).toBe("0.00");
  });
});

describe("sumSatang", () => {
  it("sums exactly", () => {
    expect(sumSatang([0.5, 200])).toEqual({ ok: false, error: "overflow" }); // non-integer input refused
    expect(sumSatang([10, 20, 30])).toEqual({ ok: true, satang: 60 });
  });
  it("reports overflow instead of losing precision", () => {
    expect(sumSatang([MAX_SAFE_SATANG, 1])).toEqual({ ok: false, error: "overflow" });
  });
});
