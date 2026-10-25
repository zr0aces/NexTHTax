import { beforeEach, expect, it } from "vitest";
import { v2ManifestSchema, v3ManifestSchema, v4ManifestSchema, manifestSchema } from "../../src/domain/schema";
import { decodeManifest, encodeManifest, manifestForStorage } from "../../src/storage/manifest";
import { annualManifest, annualInputs, D } from "../fixtures/annualTax";
import { createMemoryFolder, readTree, listTree } from "../fixtures/memoryFs";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { writeVerified } from "../../src/storage/fs";
import { createWorkspace, openWorkspace } from "../../src/storage/workspace";
import { migrateWorkspaceIntoEmptyFolder } from "../../src/storage/migration";
import { importMetadataIntoEmptyFolder } from "../../src/transfer/json";
import { createBackupZip, restoreZipIntoEmptyFolder } from "../../src/transfer/zip";

beforeEach(() => { installFakeLocks(); releaseAllLocks(); });
function bare() { const m = annualManifest(); m.records = []; m.attachments = {}; return m; }
function addDonation(m: ReturnType<typeof bare>) {
  m.years["2026"]!.taxInputs!.deductions.push({ id: D, category: "donation_general", subcategory: null, sourceRecordIds: [], existingContributionSatang: 100000, eligibility: "yes" });
}
it("freezes schema 4, opens without writes, saves compatible edits and rejects expanded worksheet before writes", async () => {
  const m = bare(), root = createMemoryFolder(), old = manifestForStorage(m, 4);
  await writeVerified(root, "data.json", encodeManifest(old)); const before = await readTree(root, "data.json");
  const opened = await openWorkspace(root); if (!("session" in opened)) throw new Error("setup");
  expect(await readTree(root, "data.json")).toEqual(before);
  await opened.session.mutate((draft) => { draft.taxpayer.displayName = "edited"; });
  expect(decodeManifest((await readTree(root, "data.json"))!).schemaVersion).toBe(4);
  const snapshot = await readTree(root, "data.json"), inventory = await listTree(root);
  await expect(opened.session.mutate(addDonation)).rejects.toMatchObject({ code: "upgrade-required" });
  expect(await readTree(root, "data.json")).toEqual(snapshot); expect(await listTree(root)).toEqual(inventory);
  const next = structuredClone(m); addDonation(next);
  expect(manifestSchema.safeParse(next).success).toBe(true);
  for (const [version, validator] of [[2, v2ManifestSchema], [3, v3ManifestSchema], [4, v4ManifestSchema]] as const) expect(validator.safeParse({ ...next, schemaVersion: version }).success).toBe(false);
  expect(() => manifestForStorage(next, 4)).toThrow();
  opened.session.close();
});
it("copies schema 4 to 5 with consent, preserving source and recovery bytes", async () => {
  const root = createMemoryFolder(), target = createMemoryFolder(), m = manifestForStorage(bare(), 4);
  const path = ".recovery/prev-1-11111111-2222-4333-8444-555555555555.json";
  await writeVerified(root, "data.json", encodeManifest(m)); await writeVerified(root, path, encodeManifest(m));
  const before = await readTree(root, "data.json");
  await expect(migrateWorkspaceIntoEmptyFolder(root, target, false)).rejects.toMatchObject({ code: "upgrade-required" });
  expect(await listTree(target)).toEqual([]);
  const next = await migrateWorkspaceIntoEmptyFolder(root, target, true);
  expect(next.schemaVersion).toBe(5); expect(next.years).toEqual(m.years);
  expect(await readTree(root, "data.json")).toEqual(before); expect(await readTree(target, path)).toEqual(await readTree(root, path));
  expect(v4ManifestSchema.safeParse(next).success).toBe(false);
});
it("round-trips schema 5 donations in JSON and ZIP but clears imported confirmations", async () => {
  const root = createMemoryFolder(), m = bare(); addDonation(m);
  m.years["2026"]!.taxInputs!.confirmedWorksheetDigest = "a".repeat(64); m.years["2026"]!.taxInputs!.confirmedSourcesDigest = "b".repeat(64);
  await writeVerified(root, "data.json", encodeManifest(m));
  const imported = await importMetadataIntoEmptyFolder(createMemoryFolder(), encodeManifest(m));
  expect(imported.years["2026"]!.taxInputs).toMatchObject({ deductions: m.years["2026"]!.taxInputs!.deductions, confirmedWorksheetDigest: null, confirmedSourcesDigest: null });
  const opened = await openWorkspace(root); if (!("session" in opened)) throw new Error("setup");
  const zip = new Uint8Array(await (await createBackupZip(root, opened.session)).arrayBuffer()); opened.session.close();
  const restored = await restoreZipIntoEmptyFolder(createMemoryFolder(), zip);
  expect(restored.session.manifest.years["2026"]!.taxInputs!.deductions).toEqual(m.years["2026"]!.taxInputs!.deductions);
  expect(restored.session.manifest.years["2026"]!.taxInputs!.confirmedWorksheetDigest).toBeNull(); restored.session.close();
});
it("detaches permanently purged sources atomically without losing worksheet amounts or leaving trusted results", async () => {
  const root = createMemoryFolder(), m = bare();
  const created = await createWorkspace(root, "test");
  await created.session.mutate((draft) => {
    const r = annualManifest().records[0]!; r.attachmentIds = []; draft.records.push(r);
    const t = annualInputs(); t.incomeItems[0]!.sourceRecordIds = []; t.confirmedWorksheetDigest = "a".repeat(64); t.confirmedSourcesDigest = "b".repeat(64);
    t.deductions.push({ id: D, sourceRecordIds: [r.id], category: "deduction_insurance", subcategory: "insurance_health", existingContributionSatang: 800000, eligibility: "yes" });
    draft.years = { ...m.years, "2026": { ...m.years["2026"]!, taxInputs: t } };
  });
  await created.session.purgeRecord(created.session.manifest.records[0]!.id);
  const t = created.session.manifest.years["2026"]!.taxInputs!;
  expect(t.deductions[0]).toMatchObject({ sourceRecordIds: [], existingContributionSatang: 800000, eligibility: "unknown" });
  expect(t.confirmedWorksheetDigest).toBeNull(); expect(t.deductionsComplete).toBe("unknown");
  expect(decodeManifest((await readTree(root, "data.json"))!).schemaVersion).toBe(5); created.session.close();
});
