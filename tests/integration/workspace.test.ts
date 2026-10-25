import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, listTree, readTree } from "../fixtures/memoryFs";
import { fakeFile, PDF_BYTES, pngBytes } from "../fixtures/samples";
import { installFakeLocks, holdLock, releaseAllLocks } from "../fixtures/locks";
import { createWorkspace, openWorkspace, WorkspaceSession, type OpenResult } from "../../src/storage/workspace";
import { StorageError } from "../../src/storage/fs";
import { nowIso } from "../../src/storage/workspace";
import type { RecordEntry } from "../../src/domain/schema";
import { sha256Hex } from "../../src/storage/hash";

beforeEach(() => {
  installFakeLocks();
  releaseAllLocks();
});

/** Byte comparison that is independent of the typed-array realm (jsdom vs Node). */
function expectBytes(actual: Uint8Array | undefined, expected: Uint8Array): void {
  expect(actual === undefined ? null : Array.from(actual)).toEqual(Array.from(expected));
}

const newRecord = (overrides: Partial<RecordEntry> = {}): RecordEntry => ({
  id: crypto.randomUUID(),
  taxYear: 2026,
  category: "deduction_insurance", subcategory: null,
  date: "2026-05-01",
  title: "เบี้ยประกันชีวิต",
  issuer: "บริษัทประกันตัวอย่าง",
  notes: "",
  evidenceAmountSatang: 1200000,
  claimedAmountSatang: 1000000,
  withheldAmountSatang: null,
  status: "waiting-review",
  attachmentIds: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
  trashedAt: null,
  ...overrides,
});

async function open(root: ReturnType<typeof createMemoryFolder>): Promise<OpenResult> {
  const result = await openWorkspace(root);
  if ("needsSetup" in result || "upgradeRequired" in result) throw new Error("unexpected setup");
  return result;
}

describe("workspace creation and open", () => {
  it("creates an empty folder workspace with managed directories", async () => {
    const root = createMemoryFolder();
    const result = await createWorkspace(root, "ผู้ทดสอบ");
    expect(result.session.manifest.revision).toBe(1);
    expect(result.session.readOnly).toBe(false);
    expect(await listTree(root)).toContain("data.json");
  });

  it("refuses to initialize a non-empty folder", async () => {
    const root = createMemoryFolder();
    await root.getFileHandle("notes.txt", { create: true });
    await expect(createWorkspace(root, "ผู้ทดสอบ")).rejects.toMatchObject({ code: "not-empty" });
  });

  it("reports needsSetup for an empty folder and not-empty for foreign content", async () => {
    expect(await openWorkspace(createMemoryFolder())).toEqual({ needsSetup: true });
    const root = createMemoryFolder();
    await root.getFileHandle("foreign.bin", { create: true });
    await expect(openWorkspace(root)).rejects.toMatchObject({ code: "not-empty" });
  });

  it("opens newer schema read-only refusal without writing", async () => {
    const root = createMemoryFolder();
    await createWorkspace(root, "ผู้ทดสอบ");
    const before = await readTree(root, "data.json");
    const newer = new TextEncoder().encode(JSON.stringify({ schemaVersion: 5, anything: true }));
    const handle = await root.getFileHandle("data.json", { create: true });
    const w = await handle.createWritable();
    await w.write(newer);
    await w.close();
    await expect(openWorkspace(root)).rejects.toMatchObject({ code: "newer-schema" });
    expectBytes(await readTree(root, "data.json"), newer);
    expect(before).not.toEqual(newer);
  });

  it("is read-only when another writer holds the lock", async () => {
    const root = createMemoryFolder();
    const created = await createWorkspace(root, "ผู้ทดสอบ");
    holdLock(`nexthtax-workspace:${created.session.manifest.workspaceId}`);
    const second = await open(root);
    expect(second.session.readOnly).toBe(true);
    await expect(second.session.mutate((m) => void m)).rejects.toMatchObject({ code: "read-only" });
  });
});

describe("workspace commits", () => {
  it("commits a record as a new revision with a previous snapshot kept", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const rec = newRecord();
    const next = await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(rec);
    });
    expect(next.revision).toBe(2);
    const onDisk = JSON.parse(new TextDecoder().decode(await readTree(root, "data.json")));
    expect(onDisk.revision).toBe(2);
    expect(onDisk.records[0].title).toBe("เบี้ยประกันชีวิต");
    const recovery = (await listTree(root)).filter((p) => p.startsWith(".recovery/prev-"));
    expect(recovery.length).toBe(1);
  });

  it("refuses to overwrite an external edit (conflict), leaving the external content intact", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const external = new TextEncoder().encode(JSON.stringify({ edited: "outside the app" }));
    const h = await root.getFileHandle("data.json", { create: true });
    const w = await h.createWritable();
    await w.write(external);
    await w.close();
    await expect(session.mutate((m) => void m)).rejects.toMatchObject({ code: "conflict" });
    expectBytes(await readTree(root, "data.json"), external);
    expect(session.hasConflict).toBe(true);
  });

  it("validates the candidate before any write and rejects invalid drafts", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const before = await readTree(root, "data.json");
    await expect(
      session.mutate((m) => {
        m.records.push({ ...newRecord(), taxYear: 1500 });
      }),
    ).rejects.toBeInstanceOf(StorageError);
    if (!before) throw new Error("setup: data.json missing");
    expectBytes(await readTree(root, "data.json"), before);
    expect(session.manifest.revision).toBe(1);
  });
});

describe("attachments", () => {
  it("copies bytes to a generated namespace, verifies them, and reopens cleanly", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const result = await session.addAttachment(fakeFile(PDF_BYTES, "../../evil name.pdf"), "หนังสือรับรอง", false);
    expect(result.status).toBe("added");
    if (result.status !== "added") return;
    expect(result.attachment.path).toMatch(/^attachments\/[0-9a-f-]{36}\.pdf$/);
    expectBytes(await readTree(root, result.attachment.path), PDF_BYTES);
    const reopened = await open(root);
    expect(reopened.missingAttachments).toEqual([]);
    expect(reopened.orphanFiles).toEqual([]);
  });

  it("warns about duplicate bytes and only copies again when explicitly allowed", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const first = await session.addAttachment(fakeFile(PDF_BYTES, "a.pdf"), "a", false);
    expect(first.status).toBe("added");
    const dup = await session.addAttachment(fakeFile(PDF_BYTES, "b.pdf"), "b", false);
    expect(dup.status).toBe("duplicate");
    const forced = await session.addAttachment(fakeFile(PDF_BYTES, "b.pdf"), "b", true);
    expect(forced.status).toBe("added");
    expect(Object.keys(session.manifest.attachments)).toHaveLength(2);
  });

  it("rejects content that is not PDF, JPEG or PNG regardless of file name", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    await expect(session.addAttachment(fakeFile(new TextEncoder().encode("<script>x</script>"), "page.pdf"), "x", false)).rejects.toMatchObject({
      code: "unsupported-file",
    });
  });

  it("accepts oversized-pixel images for storage but marks them as not previewable", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const result = await session.addAttachment(fakeFile(pngBytes(10000, 10000), "big.png"), "ภาพใหญ่", false);
    expect(result).toMatchObject({ status: "added", previewable: false });
  });

  it("detects tampered attachment bytes on read", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const result = await session.addAttachment(fakeFile(PDF_BYTES, "a.pdf"), "a", false);
    if (result.status !== "added") throw new Error("setup");
    const h = await root.getDirectoryHandle("attachments").then((d) => d.getFileHandle(result.attachment.path.split("/")[1] ?? ""));
    const w = await h.createWritable();
    await w.write(new TextEncoder().encode("tampered"));
    await w.close();
    await expect(session.readAttachment(result.attachment.id)).rejects.toMatchObject({ code: "unreadable" });
  });

  it("reports missing attachment bytes on reopen instead of hiding them", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const result = await session.addAttachment(fakeFile(PDF_BYTES, "a.pdf"), "หนังสือรับรอง", false);
    if (result.status !== "added") throw new Error("setup");
    session.close();
    await (await root.getDirectoryHandle("attachments")).removeEntry(result.attachment.path.split("/")[1] ?? "");
    const reopened = await open(root);
    expect(reopened.missingAttachments).toEqual(["หนังสือรับรอง"]);
  });

  it("refuses foreign entries inside attachments/", async () => {
    const root = createMemoryFolder();
    await createWorkspace(root, "ผู้ทดสอบ");
    const dir = await root.getDirectoryHandle("attachments");
    await dir.getFileHandle("notes.txt", { create: true });
    await expect(openWorkspace(root)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("trash and permanent delete", () => {
  it("keeps shared bytes until the final reference is purged and retires history that references them", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const att = await session.addAttachment(fakeFile(PDF_BYTES, "shared.pdf"), "ใบเดียวกัน", false);
    if (att.status !== "added") throw new Error("setup");
    const a = newRecord({ attachmentIds: [att.attachment.id] });
    const b = newRecord({ title: "อีกรายการ", attachmentIds: [att.attachment.id] });
    await session.mutate((m) => {
      m.years["2026"] = { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
      m.records.push(a, b);
    });
    await session.mutate((m) => {
      const r = m.records.find((x) => x.id === a.id);
      if (r) r.trashedAt = nowIso();
    });
    await session.purgeRecord(a.id);
    expectBytes(await readTree(root, att.attachment.path), PDF_BYTES);
    await session.purgeRecord(b.id);
    expect(await readTree(root, att.attachment.path)).toBeUndefined();
    expect(session.manifest.attachments[att.attachment.id]).toBeUndefined();
    const snapshots = (await listTree(root)).filter((p) => p.startsWith(".recovery/"));
    for (const snap of snapshots) {
      const text = new TextDecoder().decode(await readTree(root, snap));
      expect(text).not.toContain(att.attachment.id);
    }
    expect(snapshots.some((p) => p.startsWith(".recovery/post-"))).toBe(true);
  });
});

describe("pending candidates", () => {
  it("lists leftover pending candidates on reopen without applying them", async () => {
    const faults = { failData: false };
    const root = createMemoryFolder({ failClose: (p) => faults.failData && p === "data.json" });
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    faults.failData = true;
    await expect(session.mutate((m) => void m.records.push(newRecord()))).rejects.toBeInstanceOf(StorageError);
    session.close();
    const reopened = await open(root);
    expect(reopened.pendingCandidates.length).toBe(1);
    expect(reopened.session.manifest.revision).toBe(1);
    expect(reopened.session.manifest.records).toHaveLength(0);
  });
});

export type { WorkspaceSession };
export { sha256Hex };
