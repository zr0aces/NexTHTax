import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, readTree } from "../fixtures/memoryFs";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { createWorkspace, nowIso, openWorkspace } from "../../src/storage/workspace";
import type { RecordEntry } from "../../src/domain/schema";

beforeEach(() => {
  installFakeLocks();
  releaseAllLocks();
});

const rec = (title: string): RecordEntry => ({
  id: crypto.randomUUID(), taxYear: 2026, category: "other", subcategory: null, date: "2026-01-01", title, issuer: "", notes: "",
  evidenceAmountSatang: null, claimedAmountSatang: null, withheldAmountSatang: null, status: "waiting-document",
  attachmentIds: [], createdAt: nowIso(), updatedAt: nowIso(), trashedAt: null,
});

describe("uncertain commit", () => {
  it("adopts the persisted candidate after a failed read-back, then continues from it without losing edits", async () => {
    const failNextRead = new Set<string>();
    const failReadBackAfterWrite = new Set<string>();
    const root = createMemoryFolder({ failNextRead, failReadBackAfterWrite });
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    expect(session.manifest.revision).toBe(1);

    // The write itself reaches disk, but the read-back that verifies it fails once.
    failReadBackAfterWrite.add("data.json");
    await expect(session.mutate((m) => void m.records.push(rec("รายการแรก")))).rejects.toBeDefined();
    expect(session.manifest.revision).toBe(1); // in-memory state is not advanced without verification

    // Next edit reconciles: disk bytes equal the pending candidate, so the candidate is adopted.
    const next = await session.mutate((m) => void m.records.push(rec("รายการที่สอง")));
    expect(next.revision).toBe(3);
    expect(next.records.map((r) => r.title)).toEqual(["รายการแรก", "รายการที่สอง"]);

    const reopened = await openWorkspace(root);
    if ("needsSetup" in reopened || "upgradeRequired" in reopened) throw new Error("setup");
    expect(reopened.session.manifest.records.map((r) => r.title)).toEqual(["รายการแรก", "รายการที่สอง"]);
    const bytes = await readTree(root, "data.json");
    expect(bytes).toBeDefined();
  });

  it("reports conflict instead of adopting when disk matches neither baseline nor candidate", async () => {
    const root = createMemoryFolder();
    const { session } = await createWorkspace(root, "ผู้ทดสอบ");
    const h = await root.getFileHandle("data.json", { create: true });
    const w = await h.createWritable();
    await w.write(new TextEncoder().encode('{"schemaVersion":1,"other":true}'));
    await w.close();
    await expect(session.mutate((m) => void m)).rejects.toMatchObject({ code: "conflict" });
    expect(session.manifest.revision).toBe(1);
  });
});
