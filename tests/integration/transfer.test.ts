import { beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { createMemoryFolder, listTree, readTree } from "../fixtures/memoryFs";
import { fakeFile, PDF_BYTES } from "../fixtures/samples";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { createWorkspace, openWorkspace, nowIso } from "../../src/storage/workspace";
import { sha256Hex } from "../../src/storage/hash";
import { createBackupZip, restoreZipIntoEmptyFolder, BACKUP_MANIFEST } from "../../src/transfer/zip";
import { exportMetadataJson, importMetadataIntoEmptyFolder } from "../../src/transfer/json";
import { StorageError } from "../../src/storage/fs";
import type { RecordEntry } from "../../src/domain/schema";

beforeEach(() => {
  installFakeLocks();
  releaseAllLocks();
});

/** FileReader reads jsdom Blobs; Response does not. */
function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function expectBytes(actual: Uint8Array | undefined, expected: Uint8Array): void {
  expect(actual === undefined ? null : Array.from(actual)).toEqual(Array.from(expected));
}

const rec = (over: Partial<RecordEntry>): RecordEntry => ({
  id: crypto.randomUUID(),
  taxYear: 2026,
  category: "donation_general", subcategory: null,
  date: "2026-06-15",
  title: "บริจาค",
  issuer: "มูลนิธิตัวอย่าง",
  notes: "",
  evidenceAmountSatang: 50000,
  claimedAmountSatang: 50000,
  withheldAmountSatang: null,
  status: "reviewed",
  attachmentIds: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
  trashedAt: null,
  ...over,
});

async function sourceWithData() {
  const root = createMemoryFolder();
  const { session } = await createWorkspace(root, "ผู้ทดสอบ");
  const att = await session.addAttachment(fakeFile(PDF_BYTES, "receipt.pdf"), "ใบเสร็จ", false);
  if (att.status !== "added") throw new Error("setup");
  await session.mutate((m) => {
    m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
    m.records.push(rec({ attachmentIds: [att.attachment.id] }));
    m.records.push(rec({ title: "ถังขยะ", trashedAt: nowIso() }));
  });
  return { root, session, attachmentId: att.attachment.id };
}

describe("ZIP backup and restore", () => {
  it("round-trips data, attachments and trash into a new empty folder with identical hashes", async () => {
    const { root, session, attachmentId } = await sourceWithData();
    const before = await listTree(root);
    const zip = await bytesOf(await createBackupZip(root, session));
    const target = createMemoryFolder();
    const restored = await restoreZipIntoEmptyFolder(target, zip);
    expect(restored.session.manifest.workspaceId).toBe(session.manifest.workspaceId);
    expect(restored.session.manifest.records).toHaveLength(2);
    expect(restored.missingAttachments).toEqual([]);
    const { bytes } = await restored.session.readAttachment(attachmentId);
    expectBytes(bytes, PDF_BYTES);
    expect(await listTree(root)).toEqual(before);
  });

  it("refuses to restore into a non-empty folder", async () => {
    const { root, session } = await sourceWithData();
    const zip = await bytesOf(await createBackupZip(root, session));
    const target = createMemoryFolder();
    await target.getFileHandle("keep.txt", { create: true });
    await expect(restoreZipIntoEmptyFolder(target, zip)).rejects.toMatchObject({ code: "not-empty" });
  });

  it("rejects traversal and foreign entry names before writing anything", async () => {
    const zip = zipSync({ "../data.json": new TextEncoder().encode("{}"), [BACKUP_MANIFEST]: new TextEncoder().encode("{}") }, { level: 0 });
    const target = createMemoryFolder();
    await expect(restoreZipIntoEmptyFolder(target, zip)).rejects.toBeInstanceOf(StorageError);
    expect(await listTree(target)).toEqual([]);
  });

  it("rejects an attachment whose bytes do not match the inventory hash", async () => {
    const { root, session } = await sourceWithData();
    const zipBytes = await bytesOf(await createBackupZip(root, session));
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(zipBytes);
    const attName = Object.keys(entries).find((n) => n.startsWith("attachments/")) ?? "";
    const tampered = { ...entries, [attName]: new TextEncoder().encode("evil bytes") };
    const zip = zipSync(tampered, { level: 0 });
    const target = createMemoryFolder();
    await expect(restoreZipIntoEmptyFolder(target, zip)).rejects.toMatchObject({ code: "invalid" });
    expect(await listTree(target)).toEqual([]);
  });

  it("rejects an archive that is missing a file listed in the inventory", async () => {
    const { root, session } = await sourceWithData();
    const zipBytes = await bytesOf(await createBackupZip(root, session));
    const { unzipSync } = await import("fflate");
    const entries = unzipSync(zipBytes);
    const attName = Object.keys(entries).find((n) => n.startsWith("attachments/")) ?? "";
    delete entries[attName];
    const target = createMemoryFolder();
    await expect(restoreZipIntoEmptyFolder(target, zipSync(entries, { level: 0 }))).rejects.toMatchObject({ code: "invalid" });
    expect(await listTree(target)).toEqual([]);
  });
});

describe("metadata JSON", () => {
  it("imports into an empty folder and reports attachments as missing until relinked", async () => {
    const { session } = await sourceWithData();
    const jsonBytes = await bytesOf(exportMetadataJson(session.manifest));
    const target = createMemoryFolder();
    await importMetadataIntoEmptyFolder(target, jsonBytes);
    const opened = await openWorkspace(target);
    if ("needsSetup" in opened || "upgradeRequired" in opened) throw new Error("setup");
    expect(opened.missingAttachments).toEqual(["ใบเสร็จ"]);
    expect(opened.session.manifest.records).toHaveLength(2);
  });

  it("rejects invalid JSON before writing and refuses non-empty folders", async () => {
    const target = createMemoryFolder();
    await expect(importMetadataIntoEmptyFolder(target, new TextEncoder().encode('{"schemaVersion":1,"records":[{"x":1}]}'))).rejects.toBeInstanceOf(StorageError);
    expect(await listTree(target)).toEqual([]);
    const { session } = await sourceWithData();
    const other = createMemoryFolder();
    await other.getFileHandle("x.txt", { create: true });
    await expect(importMetadataIntoEmptyFolder(other, await bytesOf(exportMetadataJson(session.manifest)))).rejects.toMatchObject({ code: "not-empty" });
  });
});

describe("metadata JSON subtype and legacy conversion", () => {
  it("round-trips a v2 subtype through JSON into an empty folder", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(rec({ category: "deduction_retirement", subcategory: "fund_thai_esg", title: "ThaiESG 2026" }));
    });
    const target = createMemoryFolder();
    await importMetadataIntoEmptyFolder(target, await bytesOf(exportMetadataJson(session.manifest)));
    const opened = await openWorkspace(target);
    if (!("session" in opened)) throw new Error("setup");
    expect(opened.session.manifest.records.map((r) => [r.category, r.subcategory])).toEqual([["deduction_retirement", "fund_thai_esg"]]);
  });

  it("refuses a v1 JSON without confirmation and writes nothing", async () => {
    const legacy = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 1, workspaceId: "11111111-2222-4333-8444-555555555555", revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      taxpayer: { displayName: "ผู้ทดสอบ" }, years: {}, records: [], attachments: {},
    }));
    const target = createMemoryFolder();
    await expect(importMetadataIntoEmptyFolder(target, legacy)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(target)).toEqual([]);
  });

  it("converts a confirmed v1 JSON to current v2 with null subtypes", async () => {
    const legacy = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 1, workspaceId: "11111111-2222-4333-8444-555555555555", revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      taxpayer: { displayName: "ผู้ทดสอบ" }, years: {},
      records: [{
        id: "00000000-0000-4000-8000-00000000000c", taxYear: 2026, category: "deduction_insurance", date: "2026-06-01", title: "เบี้ยประกัน", issuer: "", notes: "",
        evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-review",
        attachmentIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
      }],
      attachments: {},
    }));
    const target = createMemoryFolder();
    let asked = 0;
    const manifest = await importMetadataIntoEmptyFolder(target, legacy, () => { asked++; return true; });
    expect(asked).toBe(1);
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.revision).toBe(2);
    expect(manifest.records[0]?.subcategory).toBeNull();
    const opened = await openWorkspace(target);
    expect("session" in opened).toBe(true);
  });

  it("rejects a JSON whose subtype pair crosses parents before any write", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(rec({ category: "deduction_retirement", subcategory: "fund_rmf" }));
    });
    const tampered = JSON.parse(new TextDecoder().decode(await bytesOf(exportMetadataJson(session.manifest))));
    tampered.records[0].subcategory = "insurance_life";
    const target = createMemoryFolder();
    await expect(importMetadataIntoEmptyFolder(target, new TextEncoder().encode(JSON.stringify(tampered)))).rejects.toMatchObject({ code: "invalid" });
    expect(await listTree(target)).toEqual([]);
  });
});

describe("ZIP subtype and legacy conversion", () => {
  it("round-trips a v2 subtype through a current ZIP", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(rec({ category: "deduction_insurance", subcategory: "insurance_annuity", title: "บำนาญ" }));
    });
    const zip = await bytesOf(await createBackupZip(root, session));
    const target = createMemoryFolder();
    const restored = await restoreZipIntoEmptyFolder(target, zip);
    expect(restored.session.manifest.records.map((r) => r.subcategory)).toEqual(["insurance_annuity"]);
  });

  it("restores a current ZIP that carries a pending candidate with baseline behavior", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(rec({}));
    });
    const data = (await readTree(root, "data.json")) ?? new Uint8Array();
    const pendingBytes = new TextEncoder().encode("{}");
    const pendingPath = ".recovery/pending-11111111-2222-4333-8444-555555555555.json";
    const files: Record<string, Uint8Array> = { "data.json": data, [pendingPath]: pendingBytes };
    const inventory = {
      schemaVersion: 1, createdAt: nowIso(), complete: true,
      files: await Promise.all(Object.entries(files).map(async ([path, bytes]) => ({ path, size: bytes.byteLength, sha256: await sha256Hex(bytes) }))),
    };
    const zip = zipSync({ ...files, [BACKUP_MANIFEST]: new TextEncoder().encode(JSON.stringify(inventory)) }, { level: 0 });
    const target = createMemoryFolder();
    const restored = await restoreZipIntoEmptyFolder(target, zip);
    expect(restored.session.manifest.records).toHaveLength(1);
    expect(await readTree(target, pendingPath)).toBeDefined();
  });

  it("converts a legacy v1 ZIP only after confirmation and keeps original bytes out of the rewritten data.json", async () => {
    const legacy = new TextEncoder().encode(JSON.stringify({
      schemaVersion: 1, workspaceId: "11111111-2222-4333-8444-555555555555", revision: 3,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      taxpayer: { displayName: "ผู้ทดสอบ" },
      years: { "2026": { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {} } },
      records: [{
        id: "00000000-0000-4000-8000-00000000000c", taxYear: 2026, category: "deduction_retirement", date: "2026-06-01", title: "กองทุน", issuer: "", notes: "",
        evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-review",
        attachmentIds: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", trashedAt: null,
      }],
      attachments: {},
    }));
    const inventory = {
      schemaVersion: 1, createdAt: nowIso(), complete: true,
      files: [{ path: "data.json", size: legacy.byteLength, sha256: await sha256Hex(legacy) }],
    };
    const zip = zipSync({ "data.json": legacy, [BACKUP_MANIFEST]: new TextEncoder().encode(JSON.stringify(inventory)) }, { level: 0 });
    const declined = createMemoryFolder();
    await expect(restoreZipIntoEmptyFolder(declined, zip, () => false)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(declined)).toEqual([]);
    const target = createMemoryFolder();
    const restored = await restoreZipIntoEmptyFolder(target, zip, () => true);
    expect(restored.session.manifest.schemaVersion).toBe(4);
    expect(restored.session.manifest.records[0]?.subcategory).toBeNull();
    expect(await readTree(target, "data.json")).not.toEqual(legacy);
  });
});

describe("ZIP restore mid-write faults", () => {
  it("leaves a marker and never opens when data.json fails to commit after attachments were written", async () => {
    const { root, session } = await sourceWithData();
    const zip = await bytesOf(await createBackupZip(root, session));
    const target = createMemoryFolder({ failClose: (path) => path === "data.json" });
    await expect(restoreZipIntoEmptyFolder(target, zip)).rejects.toBeInstanceOf(StorageError);
    const names = await listTree(target);
    expect(names).toContain(".restore-incomplete.json");
    expect(names.some((n) => n.startsWith("attachments/"))).toBe(true);
    await expect(openWorkspace(target)).rejects.toMatchObject({ code: "recovery" });
  });

  it("marks an incomplete restore when an attachment write fails and records only completed paths", async () => {
    const { root, session, attachmentId } = await sourceWithData();
    const zip = await bytesOf(await createBackupZip(root, session));
    const attachmentPath = `attachments/${attachmentId}.pdf`;
    const target = createMemoryFolder({ failClose: (path) => path === attachmentPath });
    await expect(restoreZipIntoEmptyFolder(target, zip)).rejects.toBeInstanceOf(StorageError);
    const marker = await readTree(target, ".restore-incomplete.json");
    expect(marker).toBeDefined();
    const written = JSON.parse(new TextDecoder().decode(marker)).written as string[];
    expect(written).not.toContain(attachmentPath);
    expect(written).not.toContain("data.json");
    await expect(openWorkspace(target)).rejects.toMatchObject({ code: "recovery" });
  });
});

describe("tax worksheet persistence through transfers", () => {
  const worksheet = {
    incomeItems: [{ id: "00000000-0000-4000-8000-0000000000c1", sourceRecordIds: [], kind: "salary" as const, grossAmountSatang: 60_000_000, withheldAmountSatang: 0, treatment: "progressive" as const, electionGroup: null }],
    deductions: [],
    facts: { resident: "yes" as const, ageAtYearEnd: 40, elderlyOrDisabled: "no" as const, married: "no" as const, separateFiling: "unknown" as const, spouseHasIncome: "unknown" as const, dependentClaimCount: 0 },
    incomeComplete: "yes" as const, withholdingComplete: "yes" as const, deductionsComplete: "yes" as const, finalTaxGroupsComplete: "yes" as const,
    confirmedSourcesDigest: "a".repeat(64), confirmedWorksheetDigest: "b".repeat(64),
  };
  it("round-trips the worksheet through a current ZIP and keeps the data exactly", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2025"] = { taxYear: 2025, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: worksheet, scenarios: [] };
    });
    const zip = await bytesOf(await createBackupZip(root, session));
    const restored = await restoreZipIntoEmptyFolder(createMemoryFolder(), zip);
    const back = restored.session.manifest.years["2025"]?.taxInputs;
    expect(back).toMatchObject({ incomeItems: worksheet.incomeItems, facts: worksheet.facts, incomeComplete: "yes" });
    // Imports never trust stored fingerprints (plan S15): ZIP restore resets them like JSON import does.
    expect(back?.confirmedSourcesDigest).toBeNull();
    expect(back?.confirmedWorksheetDigest).toBeNull();
  });
  it("resets forged matching confirmation fingerprints on JSON import", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await session.mutate((m) => {
      m.years["2025"] = { taxYear: 2025, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: worksheet, scenarios: [] };
    });
    const target = createMemoryFolder();
    const imported = await importMetadataIntoEmptyFolder(target, await bytesOf(exportMetadataJson(session.manifest)));
    expect(imported.years["2025"]?.taxInputs).toMatchObject({ confirmedSourcesDigest: null, confirmedWorksheetDigest: null, facts: worksheet.facts });
  });
});
