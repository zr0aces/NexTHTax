import { describe, it, expect } from "vitest";
// @ts-expect-error JS module without declaration file in scripts/
import { parseSemver, bumpVersion, checkConsistency, writeNewVersion } from "../scripts/release-version.mjs";

describe("release-version script", () => {
  describe("parseSemver", () => {
    it("parses valid semver strings", () => {
      expect(parseSemver("0.1.0")).toEqual({ major: 0, minor: 1, patch: 0, prerelease: null, build: null });
      expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null, build: null });
      expect(parseSemver("2.0.0-beta.1")).toEqual({ major: 2, minor: 0, patch: 0, prerelease: "beta.1", build: null });
      expect(parseSemver("1.0.0+20261026")).toEqual({ major: 1, minor: 0, patch: 0, prerelease: null, build: "20261026" });
    });

    it("throws on invalid semver strings", () => {
      expect(() => parseSemver("invalid")).toThrow(/Invalid semver format/);
      expect(() => parseSemver("1.0")).toThrow(/Invalid semver format/);
      expect(() => parseSemver("v1.0.0")).toThrow(/Invalid semver format/);
    });
  });

  describe("bumpVersion", () => {
    it("bumps patch version correctly", () => {
      expect(bumpVersion("0.1.0", "patch")).toBe("0.1.1");
      expect(bumpVersion("1.0.9", "patch")).toBe("1.0.10");
    });

    it("bumps minor version correctly", () => {
      expect(bumpVersion("0.1.0", "minor")).toBe("0.2.0");
      expect(bumpVersion("1.5.3", "minor")).toBe("1.6.0");
    });

    it("bumps major version correctly", () => {
      expect(bumpVersion("0.1.0", "major")).toBe("1.0.0");
      expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
    });

    it("accepts explicit semver string", () => {
      expect(bumpVersion("0.1.0", "0.5.0")).toBe("0.5.0");
      expect(bumpVersion("0.1.0", "1.0.0-rc.1")).toBe("1.0.0-rc.1");
    });
  });

  describe("checkConsistency", () => {
    it("checks consistency of root files", () => {
      const res = checkConsistency();
      expect(res.pkgVersion).toBeTruthy();
      expect(res.lockVersion).toBe(res.pkgVersion);
      expect(res.tsVersion).toBe(res.pkgVersion);
      expect(res.consistent).toBe(true);
    });
  });

  describe("writeNewVersion dry-run", () => {
    it("generates correct target representations", () => {
      const dry = writeNewVersion("0.2.0", true);
      expect(dry).toBeDefined();

      const pkg = JSON.parse(dry.packageJson);
      expect(pkg.version).toBe("0.2.0");

      const lock = JSON.parse(dry.packageLock);
      expect(lock.version).toBe("0.2.0");
      expect(lock.packages[""].version).toBe("0.2.0");

      expect(dry.versionTs).toBe('export const APP_VERSION = "0.2.0";\n');
    });
  });
});
