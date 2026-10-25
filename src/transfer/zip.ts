import { unzipSync, zipSync } from "fflate";
import { z } from "zod";
import { LIMITS } from "../storage/capacity";
import { type DirHandleLike, StorageError, isNotFound, listNames, readFileBytes, resolveDir, writeVerified } from "../storage/fs";
import { sha256Hex } from "../storage/hash";
import { decodeManifest } from "../storage/manifest";
import { ATTACHMENT_DIR, DATA_FILE, RULES_DIR, openWorkspace, type OpenResult, type WorkspaceSession } from "../storage/workspace";
import { RECOVERY_DIR } from "../storage/recovery";
import { ATTACHMENT_FILE_PATTERN } from "../storage/attachments";
import { MAX_ATTACHMENT_BYTES, MAX_METADATA_BYTES } from "../domain/schema";

export const BACKUP_MANIFEST = "backup-manifest.json";
export const RESTORE_MARKER = ".restore-incomplete.json";

/** Only canonical generated names are accepted from an archive. Everything else is rejected before extraction. */
export const ENTRY_PATTERN =
  /^(?:data\.json|attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png)|rules\/\d{4}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json|\.recovery\/(?:pending-[0-9a-f-]{36}|(?:prev|post)-\d+-[0-9a-f-]{36})\.json)$/;

const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: z.string(),
  complete: z.literal(true),
  files: z
    .array(z.strictObject({ path: z.string().regex(ENTRY_PATTERN), size: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) }))
    .max(LIMITS.zipEntries),
});

/** Lists a folder without creating it. Missing folders are empty, so backup never writes to the source. */
async function listIfPresent(root: DirHandleLike, segments: string[]): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
  try {
    return await listNames(await resolveDir(root, segments, false));
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

async function collectFiles(root: DirHandleLike, session: WorkspaceSession): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const data = await readFileBytes(root, DATA_FILE, MAX_METADATA_BYTES);
  if (!data) throw new StorageError("unreadable", "ไม่พบ data.json");
  files.set(DATA_FILE, data);
  for (const att of session.attachmentsSnapshot) {
    // readAttachment verifies size and SHA-256; any missing file makes the backup incomplete.
    const { bytes } = await session.readAttachment(att.id);
    files.set(att.path, bytes);
  }
  for (const yearEntry of await listIfPresent(root, [RULES_DIR])) {
    if (yearEntry.kind !== "directory") continue;
    for (const f of await listIfPresent(root, [RULES_DIR, yearEntry.name])) {
      if (f.kind !== "file" || !f.name.endsWith(".json")) continue;
      const bytes = await readFileBytes(root, `${RULES_DIR}/${yearEntry.name}/${f.name}`, MAX_METADATA_BYTES);
      if (bytes) files.set(`${RULES_DIR}/${yearEntry.name}/${f.name}`, bytes);
    }
  }
  for (const f of await listIfPresent(root, [RECOVERY_DIR])) {
    const rel = `${RECOVERY_DIR}/${f.name}`;
    if (f.kind !== "file" || !ENTRY_PATTERN.test(rel)) continue;
    const bytes = await readFileBytes(root, rel, MAX_METADATA_BYTES);
    if (bytes) files.set(rel, bytes);
  }
  return files;
}

/** Builds a STORE-mode ZIP of the saved state. Returns a Blob only when the inventory is complete. */
export async function createBackupZip(root: DirHandleLike, session: WorkspaceSession): Promise<Blob> {
  if (session.hasConflict) throw new StorageError("conflict", "มีการเปลี่ยนแปลงจากภายนอก ต้องเปิดโฟลเดอร์ใหม่ก่อนสำรอง");
  const files = await collectFiles(root, session);
  let total = 0;
  for (const bytes of files.values()) total += bytes.byteLength;
  const entryCount = files.size + 1;
  if (entryCount > LIMITS.zipEntries || total + entryCount * LIMITS.zipEntryOverhead + LIMITS.zipReserve > LIMITS.zipBudgetBytes) {
    throw new StorageError("capacity", "ข้อมูลเกินขีดจำกัดของ ZIP สำรองรุ่นนี้ ไม่สามารถสร้างข้อมูลสำรองครบถ้วนได้");
  }
  const inventory = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    complete: true,
    files: await Promise.all(
      [...files].map(async ([path, bytes]) => ({ path, size: bytes.byteLength, sha256: await sha256Hex(bytes) })),
    ),
  };
  const entries: Record<string, Uint8Array> = {};
  for (const [path, bytes] of files) entries[path] = bytes;
  entries[BACKUP_MANIFEST] = new TextEncoder().encode(JSON.stringify(inventory, null, 2));
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped as BlobPart], { type: "application/zip" });
}

/**
 * Restores a backup ZIP into an EMPTY new folder. Validates every entry name and total size during decompression,
 * verifies inventory hashes, writes data.json last, then reopens. Failure leaves a marker and never opens as ready.
 */
export async function restoreZipIntoEmptyFolder(root: DirHandleLike, zipBytes: Uint8Array): Promise<OpenResult> {
  if ((await listNames(root)).length > 0) throw new StorageError("not-empty", "กู้คืนได้เฉพาะโฟลเดอร์ว่างใหม่เท่านั้น");
  let entryCount = 0;
  let declaredTotal = 0;
  const seen = new Set<string>();
  const extracted = unzipSync(zipBytes, {
    filter: (info) => {
      entryCount++;
      if (entryCount > LIMITS.zipEntries) throw new StorageError("invalid", "ZIP มีไฟล์มากเกินกำหนด");
      if (!ENTRY_PATTERN.test(info.name) && info.name !== BACKUP_MANIFEST) throw new StorageError("invalid", "ZIP มีชื่อไฟล์ที่ไม่รองรับ");
      if (seen.has(info.name)) throw new StorageError("invalid", "ZIP มีชื่อไฟล์ซ้ำ");
      seen.add(info.name);
      const size = info.originalSize;
      const limit = info.name.startsWith(`${ATTACHMENT_DIR}/`) ? MAX_ATTACHMENT_BYTES : MAX_METADATA_BYTES;
      if (size > limit) throw new StorageError("too-large", "ไฟล์ใน ZIP ใหญ่เกินขีดจำกัด");
      declaredTotal += size;
      if (declaredTotal > LIMITS.zipBudgetBytes) throw new StorageError("too-large", "ข้อมูลที่คลายออกเกิน 1 GiB");
      return true;
    },
  });
  const manifestBytes = extracted[BACKUP_MANIFEST];
  if (!manifestBytes) throw new StorageError("invalid", "ZIP ไม่มี backup-manifest.json");
  const inventoryJson = inventorySchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)));
  if (!inventoryJson.success) throw new StorageError("invalid", "backup-manifest.json ไม่ถูกต้อง");
  const inventory = inventoryJson.data;
  const listed = new Set(inventory.files.map((f) => f.path));
  for (const name of Object.keys(extracted)) {
    if (name !== BACKUP_MANIFEST && !listed.has(name)) throw new StorageError("invalid", "ZIP มีไฟล์ที่ไม่อยู่ใน inventory");
  }
  for (const f of inventory.files) {
    const bytes = extracted[f.path];
    if (!bytes) throw new StorageError("invalid", `ZIP ไม่มีไฟล์ ${f.path} ตาม inventory (สำรองไม่ครบถ้วน)`);
    if (bytes.byteLength !== f.size || (await sha256Hex(bytes)) !== f.sha256) throw new StorageError("invalid", `ไฟล์ ${f.path} ไม่ตรงกับ inventory`);
  }
  const dataBytes = extracted[DATA_FILE];
  if (!dataBytes) throw new StorageError("invalid", "ZIP ไม่มี data.json");
  const manifest = decodeManifest(dataBytes);
  for (const att of Object.values(manifest.attachments)) {
    if (!extracted[att.path] || !ATTACHMENT_FILE_PATTERN.test(att.path.slice(ATTACHMENT_DIR.length + 1))) {
      throw new StorageError("invalid", `ZIP ไม่มีไฟล์แนบ ${att.displayName} ตามข้อมูล`);
    }
  }
  const written: string[] = [];
  try {
    for (const [path, bytes] of Object.entries(extracted)) {
      if (path === BACKUP_MANIFEST || path === DATA_FILE) continue;
      await writeVerified(root, path, bytes);
      written.push(path);
    }
    await writeVerified(root, DATA_FILE, dataBytes);
    written.push(DATA_FILE);
  } catch (err) {
    await writeVerified(root, RESTORE_MARKER, new TextEncoder().encode(JSON.stringify({ written })))
      .catch(() => undefined);
    throw err instanceof StorageError ? err : new StorageError("write-failed", "กู้คืนไม่สำเร็จ โฟลเดอร์นี้ยังไม่พร้อมใช้งาน");
  }
  const reopened = await openWorkspace(root);
  if ("needsSetup" in reopened) throw new StorageError("write-failed", "กู้คืนแล้วแต่เปิดข้อมูลไม่พบ");
  return reopened;
}

