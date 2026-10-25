import { decodeManifest } from "./manifest";
import { type DirHandleLike, StorageError, listNames, readFileBytes, removeFileIfExists, resolveDir } from "./fs";
import { MAX_METADATA_BYTES } from "../domain/schema";

export const RECOVERY_DIR = ".recovery";
export const RECOVERY_KEEP = 3;
const SNAPSHOT_NAME = /^(prev|post)-(\d+)-[0-9a-f-]{36}\.json$/;

/** Removes older prev/post snapshots, keeping the newest RECOVERY_KEEP by revision. */
export async function pruneSnapshots(root: DirHandleLike): Promise<void> {
  const dir = await resolveDir(root, [RECOVERY_DIR], true);
  const snaps = (await listNames(dir))
    .filter((e) => e.kind === "file")
    .map((e) => ({ name: e.name, match: SNAPSHOT_NAME.exec(e.name) }))
    .filter((e): e is { name: string; match: RegExpExecArray } => e.match !== null)
    .sort((a, b) => Number(b.match[2]) - Number(a.match[2]));
  for (const stale of snaps.slice(RECOVERY_KEEP)) await removeFileIfExists(root, `${RECOVERY_DIR}/${stale.name}`);
}

/**
 * Deletes recovery snapshots that reference any of the given attachment IDs. Any snapshot that cannot be
 * validated stops the operation, because it might still reference bytes we are about to delete.
 */
export async function retireSnapshotsReferencing(root: DirHandleLike, attachmentIds: ReadonlySet<string>): Promise<string[]> {
  const dir = await resolveDir(root, [RECOVERY_DIR], true);
  const retired: string[] = [];
  for (const entry of await listNames(dir)) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    const rel = `${RECOVERY_DIR}/${entry.name}`;
    const bytes = await readFileBytes(root, rel, MAX_METADATA_BYTES);
    if (!bytes) continue;
    let refs: string[];
    try {
      refs = Object.keys(decodeManifest(bytes).attachments);
    } catch {
      throw new StorageError("recovery", `ไม่สามารถตรวจ snapshot ${entry.name} ได้ จึงหยุดการลบไฟล์`);
    }
    if (refs.some((id) => attachmentIds.has(id))) {
      await removeFileIfExists(root, rel);
      retired.push(entry.name);
    }
  }
  return retired;
}

export async function listPendingCandidates(root: DirHandleLike): Promise<string[]> {
  const dir = await resolveDir(root, [RECOVERY_DIR], true);
  return (await listNames(dir)).filter((e) => e.kind === "file" && e.name.startsWith("pending-")).map((e) => `${RECOVERY_DIR}/${e.name}`);
}
