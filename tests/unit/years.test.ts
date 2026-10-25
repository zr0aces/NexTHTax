import { describe, expect, it } from "vitest";
import { bangkokCalendarYear, bangkokDateString, buddhistYear, isValidIsoDate, releaseTargetYears } from "../../src/domain/years";

describe("Bangkok calendar", () => {
  it("uses Asia/Bangkok at the 31 Dec / 1 Jan boundary", () => {
    // 2026-12-31 17:30 UTC is 2027-01-01 00:30 in Bangkok (UTC+7).
    const boundary = new Date("2026-12-31T17:30:00Z");
    expect(bangkokCalendarYear(boundary)).toBe(2027);
    expect(bangkokDateString(boundary)).toBe("2027-01-01");
    expect(releaseTargetYears(boundary)).toEqual([2027, 2026]);
  });
  it("keeps the previous year just before the Bangkok new year", () => {
    expect(bangkokCalendarYear(new Date("2026-12-31T16:59:00Z"))).toBe(2026);
  });
  it("converts CE to BE", () => {
    expect(buddhistYear(2026)).toBe(2569);
  });
});

describe("isValidIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-1-01")).toBe(false);
    expect(isValidIsoDate("2026-04-31")).toBe(false);
  });
});
