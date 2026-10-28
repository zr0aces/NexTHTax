#!/usr/bin/env node
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {pkg: "package.json", lock: "package-lock.json", ts: "src/version.ts"};
const ownedFiles = Object.values(FILES);
const absolute = path => resolve(ROOT, path);

// SemVer 2.0 identifiers. Arithmetic additionally requires safely representable core integers.
export const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/** Parses valid SemVer without silently rounding its core components. */
export function parseSemver(value) {
  const match = typeof value === "string" && value.trim().match(SEMVER_REGEX);
  if (!match || !match.slice(1, 4).every(n => Number.isSafeInteger(Number(n)))) {
    throw new Error(`Invalid semver format: "${value}". Expected X.Y.Z with safe integer components.`);
  }
  return {major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? null, build: match[5] ?? null};
}

/** Preserves the CLI's existing major/minor/patch increment behavior. */
export function bumpVersion(current, type) {
  const {major, minor, patch} = parseSemver(current);
  const increments = {patch: `${major}.${minor}.${patch + 1}`, minor: `${major}.${minor + 1}.0`, major: `${major + 1}.0.0`};
  const next = Object.hasOwn(increments, type.toLowerCase()) ? increments[type.toLowerCase()] : type.trim();
  parseSemver(next);
  return next;
}

function readOwnedFile(path) {
  if (!lstatSync(absolute(path)).isFile()) throw new Error(`Release path must be a regular file, not a symlink: ${path}`);
  return readFileSync(absolute(path), "utf8");
}

/** Reads both lockfile version locations independently; absent values never hide drift. */
export function readCurrentVersions() {
  const pkgRaw = readOwnedFile(FILES.pkg);
  const pkgVersion = JSON.parse(pkgRaw).version ?? null;
  let lockVersion = null, lockPackageVersion = null, tsVersion = null;
  try {
    const lock = JSON.parse(readOwnedFile(FILES.lock));
    lockVersion = lock.version ?? null;
    lockPackageVersion = lock.packages?.[""]?.version ?? null;
  } catch { /* Report unavailable/malformed copies as inconsistent. */ }
  try {
    const match = readOwnedFile(FILES.ts).match(/^\s*export\s+const\s+APP_VERSION\s*=\s*(["'])([^"'\r\n]+)\1\s*;?\s*$/m);
    tsVersion = match?.[2] ?? null;
  } catch { /* Report unavailable/malformed copies as inconsistent. */ }
  return {pkgVersion, lockVersion, lockPackageVersion, tsVersion, pkgRaw};
}

export function checkConsistency() {
  const {pkgVersion, lockVersion, lockPackageVersion, tsVersion} = readCurrentVersions();
  const versions = [pkgVersion, lockVersion, lockPackageVersion, tsVersion];
  const consistent = versions.every(value => {
    try { parseSemver(value); return value === value.trim() && value === pkgVersion; }
    catch { return false; }
  });
  return {consistent, pkgVersion, lockVersion, lockPackageVersion, tsVersion};
}

/** Restore only our exact outputs, never an independently changed file. Try every owned path. */
function restoreVersionFiles(backups, outputs) {
  const issues = [];
  for (const [key, path] of Object.entries(FILES)) {
    try {
      const current = readOwnedFile(path);
      if (current === backups[key]) continue;
      if (current !== outputs[key]) { issues.push(`${path}: independently changed; preserved`); continue; }
      writeFileSync(absolute(path), backups[key], "utf8");
    } catch (error) { issues.push(`${path}: ${error.message}`); }
  }
  return issues.length ? `Restoration incomplete; manual recovery required:\n${issues.join("\n")}` : "Original version file contents restored.";
}

/** Prepares all three outputs before writing; failures preserve the original error and recovery details. */
export function writeNewVersion(nextVersion, dryRun = false) {
  parseSemver(nextVersion);
  nextVersion = nextVersion.trim();
  const backups = Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, readOwnedFile(path)]));
  const pkg = JSON.parse(backups.pkg), lock = JSON.parse(backups.lock);
  if (!lock.packages?.[""] || typeof lock.packages[""] !== "object") throw new Error("Missing root package in package-lock.json");
  pkg.version = nextVersion;
  lock.version = nextVersion;
  lock.packages[""].version = nextVersion;
  const singleLine = backups.pkg.trim().split("\n").length === 1;
  const outputs = {
    pkg: JSON.stringify(pkg, null, singleLine ? undefined : 2) + (backups.pkg.endsWith("\n") ? "\n" : ""),
    lock: JSON.stringify(lock, null, 2) + "\n",
    ts: `export const APP_VERSION = "${nextVersion}";\n`,
  };
  if (dryRun) return {packageJson: outputs.pkg, packageLock: outputs.lock, versionTs: outputs.ts};
  try {
    for (const [key, path] of Object.entries(FILES)) {
      if (readOwnedFile(path) !== backups[key]) throw new Error(`Release file independently changed before write: ${path}`);
      writeFileSync(absolute(path), outputs[key], "utf8");
    }
  } catch (error) {
    throw new Error(`${error.message}\n${restoreVersionFiles(backups, outputs)}`, {cause: error});
  }
  return {backups, outputs};
}

/** Complete AGENTS.md verification order. Playwright's existing config supplies host prerequisites. */
export function runVerification() {
  const stages = [
    ["Typecheck", "npm", ["run", "typecheck"]],
    ["Unit tests", "npm", ["test"]],
    ["Production build", "npm", ["run", "build"]],
    ["Browser E2E", "npm", ["run", "test:e2e"]],
    ["Thai PDF", process.execPath, ["scripts/verify-pdf.mjs"]],
  ];
  console.log("\nRunning verification pipeline...");
  for (const [name, command, args] of stages) {
    console.log(`  ${name} (${command} ${args.join(" ")})`);
    try { execFileSync(command, args, {cwd: ROOT, stdio: "pipe"}); }
    catch (error) {
      throw new Error(`Verification step "${name}" failed:\n${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}\n${error.message}`, {cause: error});
    }
  }
}

const gitRaw = (...args) => execFileSync("git", args, {cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]});
const git = (...args) => gitRaw(...args).replace(/\r?\n$/, "");
function assertTagAvailable(tag) {
  git("check-ref-format", `refs/tags/${tag}`);
  try { git("show-ref", "--verify", "--quiet", `refs/tags/${tag}`); }
  catch (error) { if (error.status === 1) return; throw error; }
  throw new Error(`Target tag already exists: ${tag}`);
}
function gitPreflight(tag) {
  const head = git("rev-parse", "HEAD");
  if (git("status", "--porcelain", "--untracked-files=all")) throw new Error("--git-tag requires a clean working tree and index, including untracked files.");
  git("ls-files", "--error-unmatch", "--", ...ownedFiles);
  assertTagAvailable(tag);
  return head;
}
function assertPreparedGit(head, tag, outputs) {
  if (git("rev-parse", "HEAD") !== head) throw new Error("Git HEAD independently changed during release preparation.");
  if (git("diff", "--cached", "--name-only", "-z")) throw new Error("Index independently changed during release preparation.");
  const changed = git("diff", "--name-only", "-z").split("\0").filter(Boolean);
  if (changed.some(path => !ownedFiles.includes(path)) || git("ls-files", "--others", "--exclude-standard", "-z")) throw new Error("Unrelated work appeared during release preparation; refusing to commit it.");
  for (const [key, path] of Object.entries(FILES)) if (readOwnedFile(path) !== outputs[key]) throw new Error(`Release file independently changed: ${path}`);
  assertTagAvailable(tag);
}

/** Let configured hooks run, but validate their temporary index before Git creates a commit. */
function commitOwnedFiles(head, tag, outputs) {
  const originalHooks = git("rev-parse", "--path-format=absolute", "--git-path", "hooks");
  const guardedPhases = ["pre-commit", "prepare-commit-msg", "commit-msg"];
  const hooks = mkdtempSync(resolve(tmpdir(), "nextthtax-release-hooks-"));
  try {
    // Retain all other configured hooks, including reference-transaction and post-commit.
    if (existsSync(originalHooks) && statSync(originalHooks).isDirectory()) for (const name of readdirSync(originalHooks)) {
      if (!guardedPhases.includes(name)) symlinkSync(resolve(originalHooks, name), resolve(hooks, name));
    }
    const guard = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = ${JSON.stringify(ROOT)}, head = ${JSON.stringify(head)};
const files = ${JSON.stringify(FILES)}, outputs = ${JSON.stringify(outputs)};
const original = path.join(${JSON.stringify(originalHooks)}, path.basename(process.argv[1]));
const git = (...args) => cp.execFileSync('git', args, {cwd: root, encoding: 'utf8'});
try {
  let executable = false;
  try { fs.accessSync(original, fs.constants.X_OK); executable = true; }
  catch (error) { if (!['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) throw error; }
  if (executable) cp.execFileSync(original, process.argv.slice(2), {cwd: root, stdio: 'inherit'});
  if (git('rev-parse', 'HEAD').trim() !== head) throw new Error('Git HEAD independently changed in a hook');
  const changed = git('diff', '--cached', '--name-only', '-z', head).split('\\0').filter(Boolean);
  if (changed.some(file => !Object.values(files).includes(file))) throw new Error('Hook staged unrelated files; refusing release commit');
  for (const [key, file] of Object.entries(files)) {
    if (!fs.lstatSync(path.join(root, file)).isFile() || fs.readFileSync(path.join(root, file), 'utf8') !== outputs[key] || git('show', ':' + file) !== outputs[key]) throw new Error('Hook independently changed release output: ' + file);
  }
} catch (error) { console.error('Release hook guard: ' + error.message); process.exit(1); }
`;
    for (const phase of guardedPhases) writeFileSync(resolve(hooks, phase), guard, {mode: 0o755});
    git("-c", `core.hooksPath=${hooks}`, "commit", "--only", "-m", `chore(release): ${tag}`, "--", ...ownedFiles);
  } finally {
    try { rmSync(hooks, {recursive: true, force: true}); }
    catch (error) { console.error(`Could not remove temporary release hook guards ${hooks}: ${error.message}`); }
  }
}

function assertCommittedRelease(head, commit, outputs) {
  if (git("rev-parse", `${commit}^`) !== head) throw new Error("Git HEAD independently changed during commit.");
  const changed = git("diff-tree", "--no-commit-id", "--name-only", "-r", "-z", commit).split("\0").filter(Boolean);
  if (changed.some(path => !ownedFiles.includes(path))) throw new Error("Commit contains unrelated paths; refusing a release tag.");
  for (const [key, path] of Object.entries(FILES)) {
    if (gitRaw("show", `${commit}:${path}`) !== outputs[key] || readOwnedFile(path) !== outputs[key]) throw new Error(`Committed or working release output changed: ${path}`);
  }
}

function parseArguments(args) {
  if (!args.length) return {command: "help"};
  const options = new Set(["--verify", "--dry-run", "--git-tag"]), flags = new Set(), commands = [];
  for (const arg of args) {
    if (["--help", "-h", "help"].includes(arg)) commands.push("help");
    else if (arg === "--check") commands.push("check");
    else if (options.has(arg)) { if (flags.has(arg)) throw new Error(`Duplicate option: ${arg}`); flags.add(arg); }
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else commands.push(arg);
  }
  if (commands.length !== 1) throw new Error("Specify exactly one command or version.");
  const command = commands[0];
  if (["help", "check"].includes(command) && flags.size) throw new Error(`${command} cannot be combined with release options.`);
  return {command, dryRun: flags.has("--dry-run"), verify: flags.has("--verify"), gitTag: flags.has("--git-tag")};
}
function printUsage() {
  console.log(`NexTHTax Version Release Script
Usage: node scripts/release-version.mjs [command|version] [options]
Commands:
  patch | minor | major   Increment the corresponding version component
  <semver>                Set exact SemVer, e.g. 0.2.0 or 1.0.0-rc.1
  check | --check         Check package, both lockfile versions and APP_VERSION
  help | --help | -h      Show this message
Options:
  --verify                Run typecheck, tests, build, E2E, then Thai PDF checks
  --dry-run               Preview without writing, verifying, committing or tagging
  --git-tag               Commit only the three version files and create an annotated tag
                          Requires a clean tracked/untracked tree and index before writes.
On pre-commit failure, restore only unchanged release outputs. On tag failure after
commit, retain the release commit and files, exit nonzero and report manual recovery.
This script never pushes, resets history or deletes tags.`);
}

function main(args) {
  let preparation, initialHead, releaseCommit;
  try {
    const {command, dryRun, verify, gitTag} = parseArguments(args);
    if (command === "help") { printUsage(); return 0; }
    const consistency = checkConsistency();
    if (command === "check") {
      console.log("Version consistency check:");
      for (const [key, value] of Object.entries(consistency)) if (key !== "consistent") console.log(`  ${key}: ${value ?? "MISSING"}`);
      if (!consistency.consistent) throw new Error("Version mismatch or invalid/missing version detected across files.");
      console.log(`All four copies consistent at version v${consistency.pkgVersion}`);
      return 0;
    }
    if (!consistency.consistent) throw new Error("Version copies are inconsistent or invalid; inspect and reconcile them before release.");
    const next = bumpVersion(consistency.pkgVersion, command), tag = `v${next}`;
    if (next === consistency.pkgVersion) throw new Error(`New version (${next}) is identical to the current version.`);
    if (gitTag && !dryRun) initialHead = gitPreflight(tag);
    console.log(`Updating version: v${consistency.pkgVersion} -> v${next}${dryRun ? " (DRY RUN)" : ""}`);
    preparation = writeNewVersion(next, dryRun);
    if (dryRun) { console.log("Would update package.json, package-lock.json, and src/version.ts; no writes performed."); return 0; }
    if (verify) runVerification();
    if (gitTag) {
      assertPreparedGit(initialHead, tag, preparation.outputs);
      commitOwnedFiles(initialHead, tag, preparation.outputs);
      releaseCommit = git("rev-parse", "HEAD");
      assertCommittedRelease(initialHead, releaseCommit, preparation.outputs);
      git("tag", "-a", tag, "-m", `Release ${tag}`, releaseCommit);
      console.log(`Committed ${releaseCommit} and tagged ${tag}`);
    }
    console.log(`Successfully prepared release ${tag}`);
    return 0;
  } catch (error) {
    console.error(`Failed: ${error.message}`);
    if (releaseCommit) {
      console.error(`Commit ${releaseCommit} retained; release validation or tag creation failed. Inspect Git state and version files before manually retrying the annotated tag for this commit; no history was reset.`);
    } else if (preparation?.backups) {
      let headUnchanged = true;
      if (initialHead) {
        try { headUnchanged = git("rev-parse", "HEAD") === initialHead; }
        catch { headUnchanged = false; }
      }
      if (headUnchanged) console.error(restoreVersionFiles(preparation.backups, preparation.outputs));
      else console.error("Git HEAD changed or could not be checked. Version files preserved; manual recovery required. No history was reset.");
    }
    return 1;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) process.exitCode = main(process.argv.slice(2));
