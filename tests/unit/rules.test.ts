import { describe, expect, it } from "vitest";
import { bundlePath, coverageFor, isTrustedMatch, ruleBundleSchema, safeOfficialHref } from "../../src/domain/rules";
import { CATEGORY_IDS } from "../../src/domain/documents";

describe("safeOfficialHref", () => {
  it("allows https exact official hosts only", () => {
    expect(safeOfficialHref("https://www.rd.go.th/example")).toBe("https://www.rd.go.th/example");
  });
  it("rejects scripts, data URIs, credentials, lookalike hosts and malformed URLs", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "http://www.rd.go.th/",
      "https://user:pw@www.rd.go.th/",
      "https://www.rd.go.th.evil.example/",
      "https://rd.go.th@evil.example/",
      "not a url",
    ]) {
      expect(safeOfficialHref(bad)).toBeNull();
    }
  });
});

describe("bundlePath", () => {
  it("builds canonical paths and refuses traversal", () => {
    expect(bundlePath(2026, "2026-unreviewed-1")).toBe("rules/2026/2026-unreviewed-1.json");
    expect(() => bundlePath(2026, "../x")).toThrow();
  });
});

describe("bundle trust", () => {
  const bundle = {
    schemaVersion: 1 as const,
    taxYear: 2026,
    version: "v1",
    reviewedAt: "2026-10-25",
    officialReviewed: true,
    sources: [],
    coverage: Object.fromEntries(CATEGORY_IDS.map((id) => [id, { status: "unavailable" as const, reason: "x" }])),
    notes: "",
  };
  const digest = "a".repeat(64);
  const catalog = {
    schemaVersion: 1 as const,
    bundles: [{ taxYear: 2026, version: "v1", path: "2026/v1.json", sha256: digest, reviewedAt: "2026-10-25", officialReviewed: true }],
  };
  it("labels reviewed only on version and digest match of the shipped catalog", () => {
    expect(isTrustedMatch(catalog, bundle, digest)).toBe(true);
    expect(isTrustedMatch(catalog, bundle, "b".repeat(64))).toBe(false);
    expect(isTrustedMatch(null, bundle, digest)).toBe(false);
  });
  it("requires full category coverage in the schema", () => {
    expect(ruleBundleSchema.safeParse({ ...bundle, coverage: {} }).success).toBe(false);
  });
  it("returns unavailable when no bundle is pinned (never falls back to another year)", () => {
    expect(coverageFor(null, "donation_general")).toBe("unavailable");
  });
});
