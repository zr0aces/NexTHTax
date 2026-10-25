import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, listTree, readTree, type FaultHooks } from "../fixtures/memoryFs";
import { PDF_BYTES } from "../fixtures/samples";
import { installFakeLocks, holdLock, releaseAllLocks } from "../fixtures/locks";
import { openWorkspace } from "../../src/storage/workspace";
import { migrateWorkspaceIntoEmptyFolder, upgradeManifestV1, INCOMPLETE_MARKER } from "../../src/storage/migration";
import { decodeManifest } from "../../src/storage/manifest";
import { StorageError, writeVerified, type DirHandleLike } from "../../src/storage/fs";
import { sha256Hex } from "../../src/storage/hash";
import type { LegacyManifest } from "../../src/domain/schema";

beforeEach(() => {
  installFakeLocks();
  releaseAllLocks();
});

const WS = "11111111-2222-4333-8444-555555555555";
const ATT = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const REC_A = "00000000-0000-4000-8000-00000000000a";
const REC_B = "00000000-0000-4000-8000-00000000000b";
const T = "2026-03-01T00:00:00.000Z";

async function legacyJson(overrides: Record<string, unknown> = {}): Promise<Uint8Array> {
  const legacy = {
    schemaVersion: 1,
    workspaceId: WS,
    revision: 7,
    createdAt: T,
    updatedAt: T,
    taxpayer: { displayName: "ผู้ทดสอบ" },
    years: { "2026": { taxYear: 2026, rulesVersion: null, rulesDigest: null, eligibility: { lifeInsurance: "unknown" } } },
    records: [
      {
        id: REC_A, taxYear: 2026, category: "deduction_retirement", date: "2026-06-01", title: "ใบยืนยัน กองทุน", issuer: "บริษัท",
        notes: "ข้อความเดิม", evidenceAmountSatang: 50000, claimedAmountSatang: 50000, withheldAmountSatang: null, status: "reviewed",
        attachmentIds: [ATT], createdAt: T, updatedAt: T, trashedAt: null,
      },
      {
        id: REC_B, taxYear: 2026, category: "income_salary", date: "2026-06-02", title: "ถังขยะ", issuer: "", notes: "",
        evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: 100, status: "waiting-review",
        attachmentIds: [], createdAt: T, updatedAt: T, trashedAt: T,
      },
    ],
    attachments: {
      [ATT]: { id: ATT, displayName: "ใบเสร็จ", path: `attachments/${ATT}.pdf`, mediaType: "application/pdf", byteSize: PDF_BYTES.byteLength, sha256: await sha256Hex(PDF_BYTES) },
    },
    ...overrides,
  };
  return new TextEncoder().encode(JSON.stringify(legacy));
}

async function legacyFolder(hooks: FaultHooks = {}, extra: Array<[string, Uint8Array]> = []): Promise<DirHandleLike> {
  const root = createMemoryFolder(hooks);
  await writeVerified(root, "data.json", await legacyJson());
  await writeVerified(root, `attachments/${ATT}.pdf`, PDF_BYTES);
  for (const [path, bytes] of extra) await writeVerified(root, path, bytes);
  return root;
}

async function fingerprint(root: DirHandleLike): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of await listTree(root)) out[path] = await sha256Hex((await readTree(root, path)) ?? new Uint8Array());
  return out;
}

describe("opening a legacy workspace", () => {
  it("opens in compatibility mode without creating or changing any file", async () => {
    const root = await legacyFolder();
    const before = await fingerprint(root);
    const opened = await openWorkspace(root);
    expect(opened).toHaveProperty("session");
    expect(await fingerprint(root)).toEqual(before);
    if ("session" in opened) {
      expect(opened.session.storageSchemaVersion).toBe(1);
      opened.session.close();
    }
  });
});

describe("upgradeManifestV1 (pure)", () => {
  it("changes only the explicit root fields plus the new null/empty fields", async () => {
    const legacy = decodeManifest(await legacyJson());
    if (legacy.schemaVersion !== 1) throw new Error("setup");
    const at = "2026-10-25T01:00:00.000Z";
    const up = upgradeManifestV1(legacy, at);
    expect(up).toMatchObject({ schemaVersion: 4, revision: 8, updatedAt: at, workspaceId: WS, createdAt: T });
    expect(up.records.map((r) => r.subcategory)).toEqual([null, null]);
    for (const [i, r] of up.records.entries()) {
      const { subcategory: _s, ...rest } = r;
      expect(rest).toEqual(legacy.records[i]);
    }
    expect(up.years["2026"]).toEqual({ ...legacy.years["2026"], taxInputs: null, scenarios: [] });
    expect(up.attachments).toEqual(legacy.attachments);
  });
  it("fails explicitly when the revision would overflow", async () => {
    const legacy: LegacyManifest = { ...(decodeManifest(await legacyJson()) as LegacyManifest), revision: Number.MAX_SAFE_INTEGER };
    expect(() => upgradeManifestV1(legacy)).toThrow(StorageError);
  });
});

describe("migrateWorkspaceIntoEmptyFolder", () => {
  it("copies into an empty folder, keeps the source byte-identical and reopens as current", async () => {
    const source = await legacyFolder();
    const before = await fingerprint(source);
    const target = createMemoryFolder();
    await migrateWorkspaceIntoEmptyFolder(source, target, true);
    expect(await fingerprint(source)).toEqual(before);
    expect(Array.from((await readTree(target, `attachments/${ATT}.pdf`)) ?? [])).toEqual(Array.from(PDF_BYTES));
    const opened = await openWorkspace(target);
    if (!("session" in opened)) throw new Error("target not opened");
    expect(opened.missingAttachments).toEqual([]);
    expect(opened.session.manifest.schemaVersion).toBe(4);
    expect(opened.session.manifest.records.map((r) => [r.id, r.subcategory, r.trashedAt === null])).toEqual([
      [REC_A, null, true],
      [REC_B, null, false],
    ]);
    expect(opened.session.manifest.years["2026"]).toMatchObject({ taxInputs: null, scenarios: [] });
  });

  it("refuses an unconfirmed run, the same folder and a non-empty target without writes", async () => {
    const source = await legacyFolder();
    const before = await fingerprint(source);
    const target = createMemoryFolder();
    await expect(migrateWorkspaceIntoEmptyFolder(source, target, false)).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(target)).toEqual([]);
    await expect(migrateWorkspaceIntoEmptyFolder(source, source, true)).rejects.toMatchObject({ code: "not-empty" });
    const busy = createMemoryFolder();
    await busy.getFileHandle("keep.txt", { create: true });
    await expect(migrateWorkspaceIntoEmptyFolder(source, busy, true)).rejects.toMatchObject({ code: "not-empty" });
    expect(await fingerprint(source)).toEqual(before);
  });

  it("refuses a source with an unresolved pending candidate or an orphan attachment", async () => {
    const pending = await legacyFolder({}, [[`.recovery/pending-${WS.replace("1111", "1112")}.json`, new TextEncoder().encode("{}")]]);
    const pendingTarget = createMemoryFolder();
    await expect(migrateWorkspaceIntoEmptyFolder(pending, pendingTarget, true)).rejects.toMatchObject({ code: "recovery" });
    expect(await listTree(pendingTarget)).toEqual([]);

    const orphan = await legacyFolder({}, [[`attachments/${REC_A.replace("0000", "1234")}.pdf`, PDF_BYTES]]);
    const orphanTarget = createMemoryFolder();
    await expect(migrateWorkspaceIntoEmptyFolder(orphan, orphanTarget, true)).rejects.toMatchObject({ code: "recovery" });
    expect(await listTree(orphanTarget)).toEqual([]);
  });

  it("keeps historical v1 recovery snapshots readable and byte-identical after conversion", async () => {
    const snapshot = await legacyJson();
    const source = await legacyFolder({}, [[`.recovery/prev-1-${WS.replace("1111", "1112")}.json`, snapshot]]);
    const target = createMemoryFolder();
    await migrateWorkspaceIntoEmptyFolder(source, target, true);
    expect(Array.from((await readTree(target, `.recovery/prev-1-${WS.replace("1111", "1112")}.json`)) ?? [])).toEqual(Array.from(snapshot));
    expect((await openWorkspace(target))).toHaveProperty("session");
  });

  it("refuses to start while the source writer lock is held by another tab", async () => {
    const source = await legacyFolder();
    const before = await fingerprint(source);
    const target = createMemoryFolder();
    holdLock(`nexthtax-workspace:${WS}`);
    await expect(migrateWorkspaceIntoEmptyFolder(source, target, true)).rejects.toMatchObject({ code: "read-only" });
    expect(await listTree(target)).toEqual([]);
    expect(await fingerprint(source)).toEqual(before);
  });

  it("leaves an incomplete marker and never opens a failed target as ready", async () => {
    const source = await legacyFolder();
    const before = await fingerprint(source);
    const target = createMemoryFolder({ failClose: (path) => path === "data.json" });
    await expect(migrateWorkspaceIntoEmptyFolder(source, target, true)).rejects.toBeInstanceOf(Error);
    expect(await listTree(target)).toContain(INCOMPLETE_MARKER);
    await expect(openWorkspace(target)).rejects.toMatchObject({ code: "recovery" });
    expect(await fingerprint(source)).toEqual(before);
  });
});
