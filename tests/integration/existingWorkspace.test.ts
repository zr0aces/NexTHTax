import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryFolder, readTree, listTree } from "../fixtures/memoryFs";
import { installFakeLocks, releaseAllLocks } from "../fixtures/locks";
import { openWorkspace } from "../../src/storage/workspace";
import { writeVerified } from "../../src/storage/fs";
import { decodeManifest } from "../../src/storage/manifest";
import { planFixture } from "../fixtures/plan";

beforeEach(() => { installFakeLocks(); releaseAllLocks(); });

function oldManifest(schemaVersion: 1 | 2) {
  return {
    schemaVersion, workspaceId: "11111111-2222-4333-8444-555555555555", revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    taxpayer: { displayName: "aaa" }, years: {}, records: [], attachments: {},
  };
}

describe.each([1, 2] as const)("opening existing schema %s contents", (version) => {
  it("opens the existing empty workspace for editing without an upgrade/copy gate or writes", async () => {
    const root = createMemoryFolder();
    const bytes = new TextEncoder().encode(JSON.stringify(oldManifest(version)));
    await writeVerified(root, "data.json", bytes);
    const opened = await openWorkspace(root);
    expect(opened).toHaveProperty("session");
    if (!("session" in opened)) throw new Error("Existing data did not open for editing");
    expect(opened.session.readOnly).toBe(false);
    expect(opened.session.manifest.taxpayer.displayName).toBe("aaa");
    expect(opened.session.manifest.revision).toBe(1);
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
    await opened.session.mutate((m) => { m.taxpayer.displayName = "edited"; });
    opened.session.close();
    const persisted = decodeManifest((await readTree(root, "data.json"))!);
    expect(persisted.schemaVersion).toBe(version);
    expect(persisted.taxpayer.displayName).toBe("edited");
    const reopened = await openWorkspace(root);
    expect(reopened).toHaveProperty("session");
    if ("session" in reopened) {
      expect(reopened.session.manifest.taxpayer.displayName).toBe("edited");
      reopened.session.close();
    }
  });
  it("edits an existing document and preserves its format, attachment references and recovery bytes", async () => {
    const m = planFixture(), current = m.records[0]!;
    const { subcategory: _sub, ...v1Record } = current;
    const root = createMemoryFolder();
    const record = version === 1 ? v1Record : current;
    const year = { taxYear: 2025, rulesVersion: null, rulesDigest: null, eligibility: {} };
    const original = { ...oldManifest(version), records: [record], attachments: m.attachments, years: { "2025": version === 1 ? year : { ...year, taxInputs: m.years["2025"]!.taxInputs, scenarios: [] } } };
    const bytes = new TextEncoder().encode(JSON.stringify(original));
    await writeVerified(root, "data.json", bytes);
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("Existing contents are not editable");
    await opened.session.mutate((draft) => { draft.records[0]!.title = "modified"; draft.records[0]!.evidenceAmountSatang = 12345; });
    const stored = decodeManifest((await readTree(root, "data.json"))!);
    expect(stored.schemaVersion).toBe(version);
    expect(stored.records[0]).toMatchObject({ title: "modified", evidenceAmountSatang: 12345, attachmentIds: current.attachmentIds });
    expect(stored.attachments).toEqual(original.attachments);
    if (stored.schemaVersion === 2) expect(stored.years["2025"]!.taxInputs).toEqual(m.years["2025"]!.taxInputs);
    const recovery = (await listTree(root)).find((p) => p.startsWith(".recovery/prev-"))!;
    expect(Array.from((await readTree(root, recovery))!)).toEqual(Array.from(bytes));
    opened.session.close();
  });
  it("rejects newer-format facts before any write instead of dropping them", async () => {
    const root = createMemoryFolder(), bytes = new TextEncoder().encode(JSON.stringify(oldManifest(version)));
    await writeVerified(root, "data.json", bytes);
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("setup");
    await expect(opened.session.mutate((m) => { m.years["2025"] = planFixture().years["2025"]!; m.records = planFixture().records; m.attachments = planFixture().attachments; })).rejects.toMatchObject({ code: "upgrade-required" });
    expect(await listTree(root)).toEqual(["data.json"]);
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
    expect(opened.session.manifest.revision).toBe(1);
    opened.session.close();
  });
  it("reconciles a saved candidate after read-back failure without changing its original schema", async () => {
    const hooks = { failNextRead: new Set<string>(), failReadBackAfterWrite: new Set<string>() };
    const root = createMemoryFolder(hooks);
    await writeVerified(root, "data.json", new TextEncoder().encode(JSON.stringify(oldManifest(version))));
    const opened = await openWorkspace(root);
    if (!("session" in opened)) throw new Error("setup");
    hooks.failReadBackAfterWrite.add("data.json");
    await expect(opened.session.mutate((m) => { m.taxpayer.displayName = "saved despite read failure"; })).rejects.toThrow();
    await opened.session.mutate((m) => { m.taxpayer.displayName = "retried"; });
    const stored = decodeManifest((await readTree(root, "data.json"))!);
    expect(stored.schemaVersion).toBe(version);
    expect(stored.revision).toBe(3);
    expect(stored.taxpayer.displayName).toBe("retried");
    opened.session.close();
  });
  it("keeps the second opener read-only while another window owns the writer lock", async () => {
    const root = createMemoryFolder(), bytes = new TextEncoder().encode(JSON.stringify(oldManifest(version)));
    await writeVerified(root, "data.json", bytes);
    const first = await openWorkspace(root), second = await openWorkspace(root);
    if (!("session" in first) || !("session" in second)) throw new Error("setup");
    expect(first.session.readOnly).toBe(false);
    expect(second.session.readOnly).toBe(true);
    await expect(second.session.mutate((m) => { m.taxpayer.displayName = "not allowed"; })).rejects.toMatchObject({ code: "read-only" });
    expect(Array.from((await readTree(root, "data.json"))!)).toEqual(Array.from(bytes));
    first.session.close(); second.session.close();
  });
});
