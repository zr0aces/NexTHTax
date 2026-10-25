import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundlePath, coverageFor, isTrustedMatch, numericBlockers, parseRuleBundle, ruleBundleSchema, safeOfficialHref } from "../../src/domain/rules";
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

describe("rule bundle schema 2", () => {
  const shipped = JSON.parse(readFileSync(resolve(process.cwd(), "public/rules/2025/2025-slice-rule2-1.json"), "utf-8"));
  it("parses the shipped 2025 slice bundle through version dispatch", () => {
    expect(parseRuleBundle(shipped)?.schemaVersion).toBe(2);
  });
  it("keeps the shipped slice unreviewed with rounding unverified and lists the blockers", () => {
    expect(shipped.officialReviewed).toBe(false);
    const blockers = numericBlockers(parseRuleBundle(shipped));
    expect(blockers.some((b) => b.includes("ปัดเศษ"))).toBe(true);
    expect(blockers.some((b) => b.includes("social_security"))).toBe(true);
  });
  it("refuses officialReviewed true without verified rounding and slice components", () => {
    expect(parseRuleBundle({ ...shipped, officialReviewed: true })).toBeNull();
  });
  it("rejects a source outside the official https hosts", () => {
    const bad = { ...shipped, sources: [{ ...shipped.sources[0], url: "https://example.com/x.pdf" }, ...shipped.sources.slice(1)] };
    expect(parseRuleBundle(bad)).toBeNull();
  });
  it("rejects brackets that do not ascend and an open bracket that is not last", () => {
    const b = structuredClone(shipped);
    b.calculation.brackets[2].upToSatang = 15000000;
    expect(parseRuleBundle(b)).toBeNull();
  });
  it("returns null for unknown schema versions instead of falling back", () => {
    expect(parseRuleBundle({ ...shipped, schemaVersion: 3 })).toBeNull();
    expect(parseRuleBundle({ ...shipped, schemaVersion: "2" })).toBeNull();
  });
});
