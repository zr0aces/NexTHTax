import { afterEach, describe, it, expect } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, symlinkSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
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

// Fictional fixtures (สมมติ). Git mutations always occur in disposable repositories, never this project.
const temporaryRoots: string[] = [];
const versionFiles = ["package.json", "package-lock.json", "src/version.ts"];
afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, {recursive: true, force: true}); });
function gitRun(root: string, args: string[]) { return execFileSync("git", args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]}).trim(); }
function fixture(git = false) {
 const root = mkdtempSync(join(tmpdir(), "nextthtax-release-fictional-")); temporaryRoots.push(root);
 mkdirSync(join(root, "scripts")); mkdirSync(join(root, "src"));
 copyFileSync(resolve("scripts/release-version.mjs"), join(root, "scripts/release-version.mjs"));
 const scripts = Object.fromEntries(["typecheck", "test", "build", "test:e2e"].map(stage => [stage, `node scripts/verify-stage.mjs ${stage}`]));
 writeFileSync(join(root, "package.json"), JSON.stringify({name: "fictional-release-fixture", private: true, version: "1.2.3", scripts}));
 writeFileSync(join(root, "package-lock.json"), JSON.stringify({name: "fictional-release-fixture", version: "1.2.3", lockfileVersion: 3, packages: {"": {name: "fictional-release-fixture", version: "1.2.3"}}}));
 writeFileSync(join(root, "src/version.ts"), 'export const APP_VERSION = "1.2.3";\n');
 writeFileSync(join(root, "src/App.tsx"), "// fictional app (สมมติ)\n");
 writeFileSync(join(root, "README.md"), "Fictional repository (สมมติ)\n");
 writeFileSync(join(root, ".gitignore"), "verification.log\n");
 writeFileSync(join(root, "scripts/verify-stage.mjs"), `
import { appendFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const settings = process.env;
const stage = process.argv[2]; appendFileSync('verification.log', stage + '\\n');
if (stage === 'typecheck' && settings.EDIT_MODE) {
 const owned = settings.EDIT_MODE === 'owned';
 writeFileSync(owned ? 'src/version.ts' : 'README.md', 'independent fictional edit (สมมติ)\\n');
 if (settings.EDIT_MODE === 'staged') execFileSync('git', ['add', '--', 'README.md']);
}
if (settings.FAIL_STAGE === stage) { console.log('fictional stdout failure: ' + stage); process.exit(9); }
`);
 writeFileSync(join(root, "scripts/verify-pdf.mjs"), "process.argv[2] = 'pdf'; await import('./verify-stage.mjs');\n");
 if (git) {
  gitRun(root, ["init", "-q"]);
  for (const [key, value] of [["user.name", "Fictional Fixture"], ["user.email", "fictional@example.invalid"], ["commit.gpgSign", "false"], ["tag.gpgSign", "false"], ["core.hooksPath", ".git/hooks"]]) gitRun(root, ["config", key, value]);
  gitRun(root, ["add", "."]); gitRun(root, ["commit", "-qm", "fictional baseline"]);
 }
 return root;
}
function cli(root: string, args: string[], env: Record<string, string> = {}, preload?: string) {
 return spawnSync(process.execPath, [...(preload ? ["--import", preload] : []), "scripts/release-version.mjs", ...args], {cwd: root, env: {...process.env, ...env}, encoding: "utf8", timeout: 15000});
}
function versions(root: string) { return versionFiles.map(path => readFileSync(join(root, path), "utf8")); }
function hook(root: string, name: string, source: string) { const path = join(root, ".git/hooks", name); writeFileSync(path, "#!/bin/sh\n" + source); chmodSync(path, 0o755); }

describe("release CLI safety (fictional repositories)", () => {
 it.each(["01.2.3", "1.02.3", "1.2.03", "1.2.3-alpha..beta", "1.2.3-01", "1.2.3+build.", "1.2.3+build..x", "9007199254740993.0.0"])("rejects invalid or unsafe SemVer %s", version => { expect(() => parseSemver(version)).toThrow(); });
 it("accepts valid mixed identifiers but rejects bump overflow", () => {
  expect(parseSemver("1.2.3-01alpha.0+001.x").prerelease).toBe("01alpha.0");
  expect(() => bumpVersion(`1.2.${Number.MAX_SAFE_INTEGER}`, "patch")).toThrow();
  expect(() => bumpVersion(`1.${Number.MAX_SAFE_INTEGER}.0`, "minor")).toThrow();
  expect(() => bumpVersion(`${Number.MAX_SAFE_INTEGER}.0.0`, "major")).toThrow();
 });
 it.each(["staged", "unstaged", "untracked"])("rejects a %s dirty tree before writes", mode => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]), path = mode === "untracked" ? "unrelated.txt" : "src/App.tsx";
  writeFileSync(join(root, path), "unrelated fictional work (สมมติ)\n"); if (mode === "staged") gitRun(root, ["add", "--", path]);
  const status = gitRun(root, ["status", "--porcelain"]), staged = gitRun(root, ["diff", "--cached"]);
  expect(cli(root, ["patch", "--git-tag"]).status).not.toBe(0); expect(versions(root)).toEqual(before);
  expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head); expect(gitRun(root, ["status", "--porcelain"])).toBe(status); expect(gitRun(root, ["diff", "--cached"])).toBe(staged); expect(gitRun(root, ["tag", "--list"])).toBe("");
 });
 it("rejects an existing target tag before any commit", () => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]); gitRun(root, ["tag", "v1.2.4"]);
  expect(cli(root, ["patch", "--git-tag"]).status).not.toBe(0); expect(versions(root)).toEqual(before); expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(gitRun(root, ["status", "--porcelain"])).toBe(""); expect(gitRun(root, ["rev-parse", "v1.2.4"])).toBe(head);
 });
 it.each(["--dryrun", "--bogus", "patch"])("rejects unknown flag or duplicate command %s without mutation", arg => {
  const root = fixture(), before = versions(root); expect(cli(root, ["patch", arg]).status).not.toBe(0); expect(versions(root)).toEqual(before);
 });
 it("dry-run never writes, commits or tags even with verify/git-tag", () => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]);
  expect(cli(root, ["patch", "--dry-run", "--verify", "--git-tag"]).status).toBe(0); expect(versions(root)).toEqual(before);
  expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head); expect(gitRun(root, ["tag", "--list"])).toBe(""); expect(gitRun(root, ["status", "--porcelain"])).toBe("");
 });
 it.each(["drift", "missing", "invalid"])("check rejects a %s root-package lock version", mode => {
  const root = fixture(), path = join(root, "package-lock.json"), lock = JSON.parse(readFileSync(path, "utf8"));
  if (mode === "missing") delete lock.packages[""].version; else lock.packages[""].version = mode === "invalid" ? "invalid" : "0.0.1";
  writeFileSync(path, JSON.stringify(lock)); const before = versions(root); expect(cli(root, ["check"]).status).not.toBe(0); expect(versions(root)).toEqual(before);
 });
 it("check rejects equally invalid versions in all copies", () => {
  const root = fixture(); for (const path of versionFiles) writeFileSync(join(root, path), readFileSync(join(root, path), "utf8").replaceAll("1.2.3", "01.2.3")); expect(cli(root, ["check"]).status).not.toBe(0);
 });
 it("pre-commit failure restores owned bytes and leaves index/history unchanged", () => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]); hook(root, "pre-commit", "exit 1\n");
  expect(cli(root, ["patch", "--git-tag"]).status).not.toBe(0); expect(versions(root)).toEqual(before); expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head); expect(gitRun(root, ["status", "--porcelain"])).toBe("");
 });
 it("post-commit tag failure retains a consistent release and reports recovery", () => {
  const root = fixture(true), head = gitRun(root, ["rev-parse", "HEAD"]);
  hook(root, "reference-transaction", 'if [ "$1" = prepared ]; then\nwhile read old new ref; do\ncase "$ref" in refs/tags/*) exit 1;; esac\ndone\nfi\n');
  const result = cli(root, ["patch", "--git-tag"]); expect(result.status).not.toBe(0); expect(gitRun(root, ["rev-parse", "HEAD"])).not.toBe(head);
  expect(JSON.parse(versions(root)[0]).version).toBe("1.2.4"); expect(gitRun(root, ["status", "--porcelain"])).toBe("");
  expect(result.stderr).toContain(gitRun(root, ["rev-parse", "HEAD"])); expect(result.stderr).toMatch(/retain|preserv/i); expect(result.stderr).not.toContain("Rollback completed"); expect(gitRun(root, ["tag", "--list"])).toBe("");
 });
 it.each(["pre-commit", "prepare-commit-msg", "commit-msg"])("rejects extra files staged by %s without bypassing the hook", phase => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]);
  hook(root, phase, "printf 'hook-created fictional edit (สมมติ)\\n' > README.md\ngit add -- README.md\n");
  const result = cli(root, ["patch", "--git-tag"]);
  expect(result.status).not.toBe(0); expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(gitRun(root, ["tag", "--list"])).toBe(""); expect(versions(root)).toEqual(before);
  expect(readFileSync(join(root, "README.md"), "utf8")).toContain("hook-created fictional edit");
 });
 it("rejects an invalid Git tag name before changing version files", () => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]);
  expect(cli(root, ["1.2.4+build.lock", "--git-tag"]).status).not.toBe(0);
  expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head); expect(versions(root)).toEqual(before);
 });
 it("post-commit edits are preserved and prevent a release tag", () => {
  const root = fixture(true); hook(root, "post-commit", "printf 'post-commit fictional edit (สมมติ)\\n' > src/version.ts\n");
  const result = cli(root, ["patch", "--git-tag"]);
  expect(result.status).not.toBe(0); expect(gitRun(root, ["tag", "--list"])).toBe("");
  expect(readFileSync(join(root, "src/version.ts"), "utf8")).toContain("post-commit fictional edit");
  expect(JSON.parse(gitRun(root, ["show", "HEAD:package.json"])).version).toBe("1.2.4");
  expect(result.stderr).toMatch(/retain|preserv/i);
 });
 it("preserves custom hook configuration and executes the original hook", () => {
  const root = fixture(true), hooks = join(root, ".git/custom-hooks"); mkdirSync(hooks);
  const path = join(hooks, "pre-commit"); writeFileSync(path, "#!/bin/sh\nprintf 'original hook ran\\n' >> verification.log\n"); chmodSync(path, 0o755);
  gitRun(root, ["config", "core.hooksPath", ".git/custom-hooks"]);
  const result = cli(root, ["patch", "--git-tag"]); expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(root, "verification.log"), "utf8")).toContain("original hook ran");
  expect(gitRun(root, ["config", "core.hooksPath"])).toBe(".git/custom-hooks");
 });
 it("supports the existing explicit disabled-hooks configuration", () => {
  const root = fixture(true); gitRun(root, ["config", "core.hooksPath", devNull]);
  const result = cli(root, ["patch", "--git-tag"]); expect(result.status, result.stderr).toBe(0);
  expect(gitRun(root, ["config", "core.hooksPath"])).toBe(devNull);
 });
 it.each(versionFiles)("missing version file %s fails without changing the other files", file => {
  const root = fixture(), others = versionFiles.filter(path => path !== file);
  const before = others.map(path => readFileSync(join(root, path), "utf8")); rmSync(join(root, file));
  expect(cli(root, ["patch"]).status).not.toBe(0);
  expect(others.map(path => readFileSync(join(root, path), "utf8"))).toEqual(before);
 });
 it("rejects Git release outside a repository without writes", () => {
  const root = fixture(), before = versions(root); expect(cli(root, ["patch", "--git-tag"]).status).not.toBe(0); expect(versions(root)).toEqual(before);
 });
 it("does not write through a symlinked version file", () => {
  const root = fixture(), original = versions(root)[2], target = join(root, "independent.ts");
  writeFileSync(target, original); rmSync(join(root, "src/version.ts")); symlinkSync(target, join(root, "src/version.ts"));
  const before = versions(root); expect(cli(root, ["patch"]).status).not.toBe(0);
  expect(versions(root)).toEqual(before); expect(readFileSync(target, "utf8")).toBe(original);
 });
 it("successful Git release commits exactly three owned files", () => {
  const root = fixture(true), result = cli(root, ["patch", "--git-tag"]); expect(result.status, result.stderr).toBe(0);
  expect(gitRun(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]).split("\n").sort()).toEqual([...versionFiles].sort());
  expect(gitRun(root, ["cat-file", "-t", "v1.2.4"])).toBe("tag"); expect(gitRun(root, ["status", "--porcelain"])).toBe("");
 });
 it("verify runs all five stages in order", () => {
  const root = fixture(), result = cli(root, ["patch", "--verify"]); expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(join(root, "verification.log"), "utf8").trim().split("\n")).toEqual(["typecheck", "test", "build", "test:e2e", "pdf"]);
 }, 15000);
 it.each(["typecheck", "test", "build", "test:e2e", "pdf"])("failure at %s restores versions and creates no release", stage => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]), result = cli(root, ["patch", "--verify", "--git-tag"], {FAIL_STAGE: stage});
  expect(result.status).not.toBe(0); expect(result.stderr).toContain(`fictional stdout failure: ${stage}`); expect(versions(root)).toEqual(before);
  expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head); expect(gitRun(root, ["tag", "--list"])).toBe(""); expect(gitRun(root, ["status", "--porcelain"])).toBe("");
 }, 15000);
 it.each(["external", "staged", "owned"])("preserves a concurrent %s edit during verification", mode => {
  const root = fixture(true), before = versions(root), head = gitRun(root, ["rev-parse", "HEAD"]), result = cli(root, ["patch", "--verify", "--git-tag"], {EDIT_MODE: mode});
  expect(result.status).not.toBe(0); expect(gitRun(root, ["rev-parse", "HEAD"])).toBe(head);
  expect(readFileSync(join(root, mode === "owned" ? "src/version.ts" : "README.md"), "utf8")).toBe("independent fictional edit (สมมติ)\n"); expect(versions(root).slice(0, 2)).toEqual(before.slice(0, 2));
  if (mode === "staged") expect(gitRun(root, ["diff", "--cached", "--name-only"])).toBe("README.md"); if (mode === "owned") expect(result.stderr).toMatch(/independent|manual|incomplete/i);
 }, 15000);
 it.each([false, true])("write failure reports restoration honestly (restore failure=%s)", restoreFails => {
  const root = fixture(), before = versions(root), preload = join(root, "fault.mjs");
  writeFileSync(preload, `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
const write=fs.writeFileSync; let failed=false;
fs.writeFileSync=function(path,data,...args){
 if(String(path).endsWith('/src/version.ts')&&!failed){failed=true;throw new Error('fictional write failure');}
 if(failed&&${restoreFails}&&String(path).endsWith('/package.json'))throw new Error('fictional restore failure');
 return write.call(this,path,data,...args);
};syncBuiltinESMExports();`);
  const result = cli(root, ["patch"], {}, preload); expect(result.status).not.toBe(0); expect(result.stderr).toContain("fictional write failure");
  if (restoreFails) {expect(result.stderr).toMatch(/incomplete|manual/i); expect(result.stderr).toContain("package.json");} else expect(versions(root)).toEqual(before);
  expect(versions(root)[1]).toBe(before[1]); expect(versions(root)[2]).toBe(before[2]);
 });
});
