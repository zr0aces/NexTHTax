import { beforeEach, describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { createMemoryFolder, listTree, readTree } from "../fixtures/memoryFs";
import { fakeFile, PDF_BYTES } from "../fixtures/samples";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { createWorkspace, openWorkspace, nowIso } from "../../src/storage/workspace";
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
  category: "donation_general",
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
    m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {} };
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
    if ("needsSetup" in opened) throw new Error("setup");
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
