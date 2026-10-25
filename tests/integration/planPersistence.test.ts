import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, listTree, readTree } from "../fixtures/memoryFs";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { PDF_BYTES } from "../fixtures/samples";
import { ATTACHMENT_ID, planFixture } from "../fixtures/plan";
import { shippedBundle } from "../fixtures/tax/2025-slice";
import { SCHEMA_VERSION, v2ManifestSchema } from "../../src/domain/schema";
import { decodeManifest, encodeManifest } from "../../src/storage/manifest";
import { migrateWorkspaceIntoEmptyFolder, upgradeManifest } from "../../src/storage/migration";
import { openWorkspace } from "../../src/storage/workspace";
import { writeVerified } from "../../src/storage/fs";
import { sha256Hex } from "../../src/storage/hash";
import { importMetadataIntoEmptyFolder } from "../../src/transfer/json";
import { createBackupZip, restoreZipIntoEmptyFolder } from "../../src/transfer/zip";
import { planCompletionProjection } from "../../src/domain/planning";
import { zipSync } from "fflate";
import { BACKUP_MANIFEST } from "../../src/transfer/zip";

beforeEach(() => { installFakeLocks(); releaseAllLocks(); });

async function currentSource() {
  const root = createMemoryFolder(), manifest = planFixture();
  manifest.attachments[ATTACHMENT_ID]!.byteSize = PDF_BYTES.byteLength;
  manifest.attachments[ATTACHMENT_ID]!.sha256 = await sha256Hex(PDF_BYTES);
  manifest.years["2025"]!.plan!.completionDigest = await sha256Hex(new TextEncoder().encode(planCompletionProjection(manifest, 2025)));
  await writeVerified(root, manifest.attachments[ATTACHMENT_ID]!.path, PDF_BYTES);
  await writeVerified(root, "data.json", encodeManifest(manifest));
  return { root, manifest };
}

async function v2Source() {
  const { root, manifest } = await currentSource();
  const { plan: _plan, ...year } = manifest.years["2025"]!;
  // Include a pinned numeric rule and a frozen recovery snapshot, as real v2 folders can contain both.
  const bundle = shippedBundle();
  const ruleBytes = new TextEncoder().encode(JSON.stringify(bundle));
  year.rulesVersion = bundle.version; year.rulesDigest = await sha256Hex(ruleBytes);
  const old = v2ManifestSchema.parse({ ...manifest, schemaVersion: 2, years: { "2025": year } });
  const bytes = encodeManifest(old);
  await writeVerified(root, `rules/2025/${bundle.version}.json`, ruleBytes);
  await writeVerified(root, ".recovery/prev-1-11111111-2222-4333-8444-555555555555.json", bytes);
  await writeVerified(root, "data.json", bytes);
  return { root, old, bytes };
}

describe("schema 3 plan compatibility and persistence", () => {
  it("reads v2 without writes, then explicitly copies it with original data and history preserved", async () => {
    const { root, old, bytes } = await v2Source();
    const before = await listTree(root);
    const opened = await openWorkspace(root);
    expect(opened).toHaveProperty("session");
    if ("session" in opened) {
      expect(opened.session.storageSchemaVersion).toBe(2);
      opened.session.close();
    }
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
    const target = createMemoryFolder();
    const migrated = await migrateWorkspaceIntoEmptyFolder(root, target, true);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.records).toEqual(old.records);
    expect(migrated.years["2025"]?.taxInputs).toEqual(old.years["2025"]?.taxInputs);
    expect(migrated.years["2025"]?.scenarios).toEqual(old.years["2025"]?.scenarios);
    expect(migrated.years["2025"]?.plan).toBeUndefined();
    expect(await listTree(root)).toEqual(before);
    for (const path of before) {
      if (path !== "data.json") expect(Array.from((await readTree(target, path))!)).toEqual(Array.from((await readTree(root, path))!));
    }
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
    expect(v2ManifestSchema.safeParse(migrated).success).toBe(false);
  });
  it("rejects cancelled, nonempty and partial v2 migrations without changing the source", async () => {
    const { root, bytes } = await v2Source();
    const target = createMemoryFolder();
    await expect(migrateWorkspaceIntoEmptyFolder(root, target, false)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(target)).toEqual([]);
    const failed = createMemoryFolder({ failClose: (path) => path === "data.json" });
    await expect(migrateWorkspaceIntoEmptyFolder(root, failed, true)).rejects.toThrow();
    expect(await listTree(failed)).toContain(".restore-incomplete.json");
    await expect(openWorkspace(failed)).rejects.toMatchObject({ code: "recovery" });
    await expect(migrateWorkspaceIntoEmptyFolder(root, failed, true)).rejects.toMatchObject({ code: "not-empty" });
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
  });
  it("requires v2 JSON import consent and clears imported worksheet/scenario confirmations", async () => {
    const { old, bytes } = await v2Source();
    const target = createMemoryFolder();
    await expect(importMetadataIntoEmptyFolder(target, bytes)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(target)).toEqual([]);
    const upgraded = await importMetadataIntoEmptyFolder(target, bytes, () => true);
    expect(upgraded.records).toEqual(old.records);
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.years["2025"]?.taxInputs?.confirmedWorksheetDigest).toBeNull();
    expect(upgradeManifest(old).schemaVersion).toBe(3);
  });
  it("requires v2 ZIP upgrade consent and preserves frozen history on restore", async () => {
    const { root, old } = await v2Source();
    const entries: Record<string, Uint8Array> = {};
    const files = [];
    for (const path of await listTree(root)) {
      const bytes = (await readTree(root, path))!;
      entries[path] = bytes;
      files.push({ path, size: bytes.byteLength, sha256: await sha256Hex(bytes) });
    }
    entries[BACKUP_MANIFEST] = new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, createdAt: old.createdAt, complete: true, files }));
    const zip = zipSync(entries, { level: 0 }), target = createMemoryFolder();
    await expect(restoreZipIntoEmptyFolder(target, zip, () => false)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(target)).toEqual([]);
    const restored = await restoreZipIntoEmptyFolder(target, zip, () => true);
    expect(restored.session.manifest.schemaVersion).toBe(3);
    expect(restored.session.manifest.records).toEqual(old.records);
    expect(await sha256Hex((await readTree(target, ".recovery/prev-1-11111111-2222-4333-8444-555555555555.json"))!)).toBe(await sha256Hex(entries[".recovery/prev-1-11111111-2222-4333-8444-555555555555.json"]!));
    restored.session.close();
  });
  it("round-trips plans and actuals through JSON and ZIP without trusting imported completion hashes", async () => {
    const { root, manifest } = await currentSource();
    const target = createMemoryFolder();
    const imported = await importMetadataIntoEmptyFolder(target, encodeManifest(manifest));
    expect(imported.years["2025"]!.plan).toEqual({ ...manifest.years["2025"]!.plan, completionDigest: null });
    const source = await openWorkspace(root);
    if (!("session" in source)) throw new Error("setup");
    const zip = new Uint8Array(await (await createBackupZip(root, source.session)).arrayBuffer());
    source.session.close();
    const restored = await restoreZipIntoEmptyFolder(createMemoryFolder(), zip);
    expect(restored.session.manifest.years["2025"]!.plan).toEqual(imported.years["2025"]!.plan);
    expect(restored.missingAttachments).toEqual([]);
    expect(Array.from((await restored.session.readAttachment(ATTACHMENT_ID)).bytes)).toEqual(Array.from(PDF_BYTES));
    restored.session.close();
  });
  it("persists completion on ordinary reopen, and detaches evidence atomically when purged", async () => {
    const { root, manifest } = await currentSource();
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("setup");
    expect(opened.session.manifest.years["2025"]!.plan).toEqual(manifest.years["2025"]!.plan);
    await opened.session.purgeRecord(manifest.records[0]!.id);
    expect(opened.session.manifest.years["2025"]!.plan).toMatchObject({ paid: true, evidenceRecordId: null, completionDigest: null });
    const current = decodeManifest((await readTree(root, "data.json"))!);
    expect(current.schemaVersion).toBe(3);
    opened.session.close();
  });
  it("preserves the plan when pinning rules but invalidates its completion context", async () => {
    const { root, manifest } = await currentSource();
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("setup");
    const bundle = shippedBundle(), bytes = new TextEncoder().encode(JSON.stringify(bundle));
    const next = await opened.session.pinRules(2025, bundle.version, `rules/2025/${bundle.version}.json`, bytes, await sha256Hex(bytes));
    expect(next.years["2025"]!.plan).toEqual(manifest.years["2025"]!.plan);
    expect(planCompletionProjection(next, 2025)).not.toBe(planCompletionProjection(manifest, 2025));
    opened.session.close();
  });
});
