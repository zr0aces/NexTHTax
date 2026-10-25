#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PKG_PATH = resolve(ROOT, "package.json");
const LOCK_PATH = resolve(ROOT, "package-lock.json");
const VERSION_TS_PATH = resolve(ROOT, "src/version.ts");

export const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/**
 * Parses and validates semver string into components.
 */
export function parseSemver(v) {
  const m = String(v).trim().match(SEMVER_REGEX);
  if (!m) throw new Error(`Invalid semver format: "${v}". Expected format: X.Y.Z (e.g. 1.0.0)`);
  return {
    major: parseInt(m[1], 10),
    minor: parseInt(m[2], 10),
    patch: parseInt(m[3], 10),
    prerelease: m[4] ?? null,
    build: m[5] ?? null,
  };
}

/**
 * Calculates next semver from current version and bump type.
 */
export function bumpVersion(current, type) {
  const { major, minor, patch } = parseSemver(current);
  switch (type.toLowerCase()) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
    default:
      // If it's a specific version, parse and return it
      parseSemver(type);
      return type.trim();
  }
}

/**
 * Reads versions from all target files.
 */
export function readCurrentVersions() {
  const pkgRaw = readFileSync(PKG_PATH, "utf8");
  const pkg = JSON.parse(pkgRaw);
  const pkgVersion = pkg.version;

  let lockVersion = null;
  try {
    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8"));
    lockVersion = lock.version ?? lock.packages?.[""]?.version ?? null;
  } catch {}

  let tsVersion = null;
  try {
    const tsRaw = readFileSync(VERSION_TS_PATH, "utf8");
    const m = tsRaw.match(/APP_VERSION\s*=\s*["']([^"']+)["']/);
    if (m) tsVersion = m[1];
  } catch {}

  return {
    pkgVersion,
    lockVersion,
    tsVersion,
    pkgRaw,
  };
}

/**
 * Checks consistency across target files.
 */
export function checkConsistency() {
  const { pkgVersion, lockVersion, tsVersion } = readCurrentVersions();
  const consistent = pkgVersion && pkgVersion === lockVersion && pkgVersion === tsVersion;
  return {
    consistent,
    pkgVersion,
    lockVersion,
    tsVersion,
  };
}

/**
 * Updates version in package.json, package-lock.json, and src/version.ts.
 */
export function writeNewVersion(nextVersion, dryRun = false) {
  parseSemver(nextVersion);
  const { pkgRaw } = readCurrentVersions();

  // 1. Update package.json while preserving formatting
  const pkgData = JSON.parse(pkgRaw);
  pkgData.version = nextVersion;
  const isSingleLine = !pkgRaw.includes("\n") || pkgRaw.trim().split("\n").length === 1;
  const nextPkgRaw = isSingleLine ? JSON.stringify(pkgData) : JSON.stringify(pkgData, null, 2) + "\n";

  // 2. Update package-lock.json
  const lockRaw = readFileSync(LOCK_PATH, "utf8");
  const lockData = JSON.parse(lockRaw);
  lockData.version = nextVersion;
  if (lockData.packages && lockData.packages[""]) {
    lockData.packages[""].version = nextVersion;
  }
  const nextLockRaw = JSON.stringify(lockData, null, 2) + "\n";

  // 3. Update src/version.ts
  const nextTsRaw = `export const APP_VERSION = "${nextVersion}";\n`;

  if (dryRun) {
    return {
      packageJson: nextPkgRaw,
      packageLock: nextLockRaw,
      versionTs: nextTsRaw,
    };
  }

  // Backup original contents in case of rollback
  const backups = {
    pkg: pkgRaw,
    lock: lockRaw,
    ts: readFileSync(VERSION_TS_PATH, "utf8"),
  };

  try {
    writeFileSync(PKG_PATH, nextPkgRaw, "utf8");
    writeFileSync(LOCK_PATH, nextLockRaw, "utf8");
    writeFileSync(VERSION_TS_PATH, nextTsRaw, "utf8");
  } catch (err) {
    // Rollback
    writeFileSync(PKG_PATH, backups.pkg, "utf8");
    writeFileSync(LOCK_PATH, backups.lock, "utf8");
    writeFileSync(VERSION_TS_PATH, backups.ts, "utf8");
    throw err;
  }

  return { backups };
}

/**
 * Runs repository verification suite.
 */
export function runVerification() {
  console.log("\nRunning verification pipeline...");
  const commands = [
    { name: "Typecheck", cmd: "npm run typecheck" },
    { name: "Unit tests", cmd: "npm test" },
    { name: "Production build", cmd: "npm run build" },
  ];

  for (const { name, cmd } of commands) {
    process.stdout.write(`  ⏳ ${name} (${cmd})... `);
    try {
      execSync(cmd, { cwd: ROOT, stdio: "pipe" });
      console.log("✅ Passed");
    } catch (err) {
      console.log("❌ Failed");
      throw new Error(`Verification step "${name}" failed:\n${err.stderr?.toString() || err.message}`);
    }
  }
}

function printUsage() {
  console.log(`
NexTHTax Version Release Script
-------------------------------
Usage:
  node scripts/release-version.mjs [command|version] [options]

Commands:
  patch                  Bump patch version (e.g. 0.1.0 -> 0.1.1)
  minor                  Bump minor version (e.g. 0.1.0 -> 0.2.0)
  major                  Bump major version (e.g. 0.1.0 -> 1.0.0)
  <semver>               Set exact semver (e.g. 0.2.0, 1.0.0)
  check, --check         Verify version consistency across files
  help, --help, -h       Display this usage message

Options:
  --verify               Run typecheck, tests, and build after bump
  --dry-run              Show changes without writing to disk
  --git-tag              Create a git commit and annotated tag (requires clean working tree)

Examples:
  node scripts/release-version.mjs patch
  node scripts/release-version.mjs minor --verify
  node scripts/release-version.mjs 0.2.0 --dry-run
  node scripts/release-version.mjs check
`);
}

// CLI Execution entrypoint
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help") || args.includes("-h") || args.includes("help")) {
    printUsage();
    process.exit(0);
  }

  const dryRun = args.includes("--dry-run");
  const verify = args.includes("--verify");
  const gitTag = args.includes("--git-tag");
  const isCheck = args.includes("check") || args.includes("--check");

  if (isCheck) {
    const { consistent, pkgVersion, lockVersion, tsVersion } = checkConsistency();
    console.log("Version consistency check:");
    console.log(`  package.json:      ${pkgVersion || "MISSING"}`);
    console.log(`  package-lock.json: ${lockVersion || "MISSING"}`);
    console.log(`  src/version.ts:    ${tsVersion || "MISSING"}`);

    if (consistent) {
      console.log(`\n✅ All files consistent at version v${pkgVersion}`);
      process.exit(0);
    } else {
      console.error("\n❌ Version mismatch detected across files!");
      process.exit(1);
    }
  }

  const targetArg = args.find(a => !a.startsWith("--"));
  if (!targetArg) {
    console.error("Error: Please specify bump type (patch, minor, major) or a specific version.");
    printUsage();
    process.exit(1);
  }

  const { pkgVersion } = readCurrentVersions();
  if (!pkgVersion) {
    console.error("Error: Could not read current version from package.json");
    process.exit(1);
  }

  let nextVersion;
  try {
    nextVersion = bumpVersion(pkgVersion, targetArg);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (nextVersion === pkgVersion) {
    console.error(`Error: New version (${nextVersion}) is identical to current version (${pkgVersion}).`);
    process.exit(1);
  }

  console.log(`Updating version: v${pkgVersion} -> v${nextVersion}${dryRun ? " (DRY RUN)" : ""}`);

  let backups = null;
  try {
    const res = writeNewVersion(nextVersion, dryRun);
    backups = res.backups;

    if (!dryRun) {
      console.log(`  ✔ Updated package.json`);
      console.log(`  ✔ Updated package-lock.json`);
      console.log(`  ✔ Updated src/version.ts`);
    } else {
      console.log(`  [dry-run] Would update package.json, package-lock.json, and src/version.ts`);
    }

    if (verify && !dryRun) {
      runVerification();
    }

    if (gitTag && !dryRun) {
      const gitStatus = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
      // Only release files should be modified
      const files = ["package.json", "package-lock.json", "src/version.ts", "src/App.tsx"];
      execSync(`git add ${files.join(" ")}`, { cwd: ROOT });
      execSync(`git commit -m "chore(release): v${nextVersion}"`, { cwd: ROOT });
      execSync(`git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`, { cwd: ROOT });
      console.log(`  ✔ Committed and tagged v${nextVersion}`);
    }

    console.log(`\n🎉 Successfully prepared release v${nextVersion}`);
  } catch (err) {
    if (backups && !dryRun) {
      console.error(`\nEncountered error during release process. Rolling back...`);
      writeFileSync(PKG_PATH, backups.pkg, "utf8");
      writeFileSync(LOCK_PATH, backups.lock, "utf8");
      writeFileSync(VERSION_TS_PATH, backups.ts, "utf8");
      console.error(`Rollback completed.`);
    }
    console.error(`\nFailed: ${err.message}`);
    process.exit(1);
  }
}
