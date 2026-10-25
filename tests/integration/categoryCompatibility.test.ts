import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, readTree, listTree } from "../fixtures/memoryFs";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { planFixture, ATTACHMENT_ID } from "../fixtures/plan";
import { PDF_BYTES } from "../fixtures/samples";
import { SUBCATEGORIES, LEGACY_SUBCATEGORY_IDS } from "../../src/domain/documents";
import { v2ManifestSchema, v3ManifestSchema, manifestSchema, SCHEMA_VERSION } from "../../src/domain/schema";
import { legacyTaxScenarioSchema } from "../../src/domain/taxInputs";
import { decodeManifest, encodeManifest, manifestForStorage, editableManifest } from "../../src/storage/manifest";
import { openWorkspace } from "../../src/storage/workspace";
import { migrateWorkspaceIntoEmptyFolder } from "../../src/storage/migration";
import { writeVerified } from "../../src/storage/fs";
import { sha256Hex } from "../../src/storage/hash";
import { importMetadataIntoEmptyFolder } from "../../src/transfer/json";
import { createBackupZip, restoreZipIntoEmptyFolder } from "../../src/transfer/zip";
import { recordsToCsv } from "../../src/transfer/csv";

beforeEach(() => { installFakeLocks(); releaseAllLocks(); });
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

async function seed(version: 2 | 3 | 4) {
  const m = planFixture(), root = createMemoryFolder();
  m.attachments[ATTACHMENT_ID]!.byteSize = PDF_BYTES.byteLength;
  m.attachments[ATTACHMENT_ID]!.sha256 = await sha256Hex(PDF_BYTES);
  m.years["2025"]!.plan!.completionDigest = "a".repeat(64);
  const stored = manifestForStorage(version === 2 ? { ...m, years: { "2025": { ...m.years["2025"]!, plan: null } } } : m, version);
  if (stored.schemaVersion === 1) throw new Error("This fixture only seeds schemas 2, 3 and 4");
  await writeVerified(root, m.attachments[ATTACHMENT_ID]!.path, PDF_BYTES);
  await writeVerified(root, "data.json", encodeManifest(stored));
  return { root, stored, m };
}

describe.each([2, 3] as const)("frozen schema %s taxonomy", (version) => {
  it("rejects new record, worksheet and scenario subtypes without widening older validators", async () => {
    const { stored } = await seed(version), year = stored.years["2025"]!;
    const validator = version === 2 ? v2ManifestSchema : v3ManifestSchema;
    const candidates = [
      { ...stored, records: [{ ...stored.records[0]!, category: "deduction_retirement", subcategory: "fund_ssf" }] },
      { ...stored, years: { "2025": { ...year, taxInputs: { ...year.taxInputs, deductions: [{ id: stored.records[0]!.id, category: "deduction_retirement", subcategory: "fund_thai_esgx", sourceRecordIds: [], existingContributionSatang: null, eligibility: "unknown" }] } } } },
      { ...stored, years: { "2025": { ...year, scenarios: [...year.scenarios, { ...year.scenarios[0]!, id: stored.records[0]!.id, contributions: [{ ...year.scenarios[0]!.contributions[0]!, subcategory: "fund_provident" }] }] } } },
    ];
    for (const candidate of candidates) {
      expect(manifestSchema.safeParse({ ...candidate, schemaVersion: SCHEMA_VERSION }).success).toBe(true);
      expect(validator.safeParse(candidate).success).toBe(false);
      expect(() => decodeManifest(bytes(candidate))).toThrow();
    }
    const eight = { ...year.scenarios[0]!, contributions: Array.from({ length: 8 }, () => year.scenarios[0]!.contributions[0]!) };
    const parsed = legacyTaxScenarioSchema.safeParse(eight);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((i) => i.code === "too_big" && i.maximum === 7)).toBe(true);
  });
  it("preserves the opened version, worksheet, scenarios and v3 plan on normal edits", async () => {
    const { root, stored } = await seed(version);
    const before = await readTree(root, "data.json");
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("Existing format must remain editable");
    expect(opened.session.manifest.schemaVersion).toBe(5);
    expect(await sha256Hex((await readTree(root, "data.json"))!)).toBe(await sha256Hex(before!));
    await opened.session.mutate((m) => { m.records[0]!.notes = "edited without upgrading"; });
    const saved = decodeManifest((await readTree(root, "data.json"))!);
    expect(saved.schemaVersion).toBe(version);
    if (saved.schemaVersion === 1) throw new Error("unexpected downgrade");
    expect(saved.years).toEqual(stored.years);
    expect(saved.records[0]!.notes).toBe("edited without upgrading");
    opened.session.close();
  });
  it("blocks new fund facts in every persisted location before writes", async () => {
    const { root } = await seed(version);
    const before = await readTree(root, "data.json"), inventory = await listTree(root);
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("setup");
    for (const apply of [
      (m: ReturnType<typeof planFixture>) => { m.records[0]!.category = "deduction_retirement"; m.records[0]!.subcategory = "fund_ssf"; },
      (m: ReturnType<typeof planFixture>) => { m.years["2025"]!.taxInputs!.deductions.push({ id: m.records[0]!.id, category: "deduction_retirement", subcategory: "fund_ltf", sourceRecordIds: [], existingContributionSatang: null, eligibility: "unknown" }); },
      (m: ReturnType<typeof planFixture>) => { const s = structuredClone(m.years["2025"]!.scenarios[0]!); s.id = m.records[0]!.id; s.contributions[0]!.subcategory = "fund_nsf"; m.years["2025"]!.scenarios.push(s); },
    ]) await expect(opened.session.mutate(apply)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await sha256Hex((await readTree(root, "data.json"))!)).toBe(await sha256Hex(before!));
    expect(await listTree(root)).toEqual(inventory);
    opened.session.close();
  });
});

it("copies schema 3 to 4 without losing existing plan/actuals or rewriting original/history bytes", async () => {
  const { root, stored } = await seed(3);
  const snapshot = ".recovery/prev-1-11111111-2222-4333-8444-555555555555.json";
  await writeVerified(root, snapshot, encodeManifest(stored));
  const original = await readTree(root, "data.json"), history = await readTree(root, snapshot), target = createMemoryFolder();
  const upgraded = await migrateWorkspaceIntoEmptyFolder(root, target, true);
  expect(upgraded.schemaVersion).toBe(5);
  expect(upgraded.years).toEqual(stored.years);
  expect(upgraded.records).toEqual(stored.records);
  expect(await sha256Hex((await readTree(root, "data.json"))!)).toBe(await sha256Hex(original!));
  expect(await sha256Hex((await readTree(target, snapshot))!)).toBe(await sha256Hex(history!));
  expect(v3ManifestSchema.safeParse(upgraded).success).toBe(false);
  expect(editableManifest(stored).years).toEqual(stored.years);
});

it("imports schema 3 only with consent and resets completion without discarding the plan", async () => {
  const { stored, m } = await seed(3), target = createMemoryFolder();
  await expect(importMetadataIntoEmptyFolder(target, encodeManifest(stored))).rejects.toMatchObject({ code: "upgrade-required" });
  expect(await listTree(target)).toEqual([]);
  const imported = await importMetadataIntoEmptyFolder(target, encodeManifest(stored), () => true);
  expect(imported.schemaVersion).toBe(5);
  expect(imported.years["2025"]!.plan).toEqual({ ...m.years["2025"]!.plan, completionDigest: null });
});

it("leaves failed schema-3 copies marked incomplete and the source unchanged", async () => {
  const { root } = await seed(3), before = await sha256Hex((await readTree(root, "data.json"))!);
  const target = createMemoryFolder({ failClose: (path) => path === "data.json" });
  await expect(migrateWorkspaceIntoEmptyFolder(root, target, true)).rejects.toThrow();
  expect(await listTree(target)).toContain(".restore-incomplete.json");
  await expect(openWorkspace(target)).rejects.toMatchObject({ code: "recovery" });
  expect(await sha256Hex((await readTree(root, "data.json"))!)).toBe(before);
});

it("restores a schema-3 ZIP only with upgrade consent, preserving the plan and verified attachments", async () => {
  const { root, m } = await seed(3), opened = await openWorkspace(root);
  if (!("session" in opened)) throw new Error("setup");
  const zip = new Uint8Array(await (await createBackupZip(root, opened.session)).arrayBuffer());
  opened.session.close();
  const target = createMemoryFolder();
  await expect(restoreZipIntoEmptyFolder(target, zip, () => false)).rejects.toMatchObject({ code: "upgrade-required" });
  expect(await listTree(target)).toEqual([]);
  const restored = await restoreZipIntoEmptyFolder(target, zip, () => true);
  expect(restored.session.manifest.schemaVersion).toBe(5);
  expect(restored.session.manifest.years["2025"]!.plan).toEqual({ ...m.years["2025"]!.plan, completionDigest: null });
  expect(restored.missingAttachments).toEqual([]);
  await expect(restored.session.readAttachment(ATTACHMENT_ID)).resolves.toHaveProperty("bytes");
  restored.session.close();
});

it("round-trips every subtype through schema-4 JSON, ZIP and existing CSV columns with mixed old history", async () => {
  const { root, stored, m } = await seed(4);
  const old = manifestForStorage(m, 3);
  await writeVerified(root, ".recovery/prev-1-11111111-2222-4333-8444-555555555555.json", encodeManifest(old));
  m.records.push(...SUBCATEGORIES.map((sub, n) => ({ ...m.records[0]!, id: `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`, category: sub.parent, subcategory: sub.id, title: sub.label, attachmentIds: [], status: "waiting-document" as const, evidenceAmountSatang: null, claimedAmountSatang: null })));
  await writeVerified(root, "data.json", encodeManifest(m));
  const imported = await importMetadataIntoEmptyFolder(createMemoryFolder(), encodeManifest(m));
  expect(imported.records).toEqual(m.records);
  const opened = await openWorkspace(root);
  if (!("session" in opened)) throw new Error("setup");
  const zip = new Uint8Array(await (await createBackupZip(root, opened.session)).arrayBuffer());
  opened.session.close();
  const restored = await restoreZipIntoEmptyFolder(createMemoryFolder(), zip);
  expect(restored.session.manifest.records).toEqual(m.records);
  expect(restored.session.manifest.years["2025"]!.plan).toEqual({ ...m.years["2025"]!.plan, completionDigest: null });
  restored.session.close();
  const csv = recordsToCsv(m.records, 2025);
  expect(csv.split("\r\n")[0]!.split(",")).toHaveLength(12);
  for (const sub of SUBCATEGORIES) expect(csv).toContain(sub.id);
  expect(LEGACY_SUBCATEGORY_IDS).toHaveLength(7);
});
