import { type LegacyManifest, type Manifest, type StoredManifest, MAX_ATTACHMENT_BYTES, MAX_METADATA_BYTES } from "../domain/schema";
import { bundlePath, ruleBundleSchema } from "../domain/rules";
import { checkBudget, LIMITS } from "./capacity";
import { type DirHandleLike, StorageError, listNames, readFileBytes, resolveDir, writeVerified } from "./fs";
import { sha256Hex } from "./hash";
import { acquireWriterLock } from "./locking";
import { decodeManifest, encodeManifest, validateManifest } from "./manifest";

const SNAPSHOT = /^\.recovery\/(?:prev|post)-\d+-[0-9a-f-]{36}\.json$/;
const ATTACHMENT = /^attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:pdf|jpg|png)$/;
const RULE = /^rules\/\d{4}\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.json$/;
export const INCOMPLETE_MARKER = ".restore-incomplete.json";
interface FileInfo { size: number; sha256: string; }
type Inventory = ReadonlyMap<string, FileInfo>;
type ReadBytes = (path: string) => Promise<Uint8Array>;

/** Pure explicit upgrade. Legacy data is never classified or used to infer tax facts. */
export function upgradeManifestV1(legacy: LegacyManifest, at = new Date().toISOString()): Manifest {
  return validateManifest({
    ...legacy, schemaVersion: 2, revision: legacy.revision + 1, updatedAt: at,
    records: legacy.records.map((r) => ({ ...r, subcategory: null })),
    years: Object.fromEntries(Object.entries(legacy.years).map(([key, year]) => [key, { ...year, taxInputs: null, scenarios: [] }])),
  });
}

/** Incoming hashes are data, not proof that this user confirmed imported facts. */
export function clearImportedConfirmations(manifest: Manifest): Manifest {
  const copy = structuredClone(manifest);
  let changed = false;
  for (const year of Object.values(copy.years)) {
    if (year.taxInputs) {
      changed ||= year.taxInputs.confirmedSourcesDigest !== null || year.taxInputs.confirmedWorksheetDigest !== null;
      year.taxInputs.confirmedSourcesDigest = null;
      year.taxInputs.confirmedWorksheetDigest = null;
    }
    for (const scenario of year.scenarios) {
      changed ||= scenario.confirmedChoiceDigest !== null;
      scenario.confirmedChoiceDigest = null;
    }
  }
  return changed ? validateManifest({ ...copy, revision: copy.revision + 1, updatedAt: new Date().toISOString() }) : copy;
}

async function validateInventory(files: Inventory, current: StoredManifest, read: ReadBytes): Promise<void> {
  const used = new Set<string>();
  const validateReferences = (manifest: StoredManifest) => {
    if (manifest.workspaceId !== current.workspaceId) throw new StorageError("invalid", "snapshot เป็นของคนละแฟ้ม");
    for (const attachment of Object.values(manifest.attachments)) {
      const info = files.get(attachment.path);
      if (!info || info.size !== attachment.byteSize || info.sha256 !== attachment.sha256) throw new StorageError("invalid", "ไฟล์แนบหรือไฟล์ที่ recovery อ้างถึงหาย/ไม่ตรง hash");
      used.add(attachment.path);
    }
    for (const year of Object.values(manifest.years)) {
      if (year.rulesVersion === null && year.rulesDigest === null) continue;
      if (!year.rulesVersion || !year.rulesDigest) throw new StorageError("invalid", "ข้อมูลกฎที่ปักไว้ไม่ครบ");
      if (files.get(bundlePath(year.taxYear, year.rulesVersion))?.sha256 !== year.rulesDigest) throw new StorageError("invalid", "กฎที่ปักไว้หายหรือไม่ตรง hash");
    }
  };
  validateReferences(current);
  // Parse one bounded metadata file at a time; never retain all historical manifests.
  for (const path of files.keys()) {
    if (path === "data.json") continue;
    if (SNAPSHOT.test(path)) validateReferences(decodeManifest(await read(path)));
    else if (RULE.test(path)) {
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await read(path))); }
      catch { throw new StorageError("invalid", "ไฟล์กฎไม่ใช่ JSON ที่ถูกต้อง"); }
      const result = ruleBundleSchema.safeParse(parsed);
      if (!result.success || path !== bundlePath(result.data.taxYear, result.data.version)) throw new StorageError("invalid", "ไฟล์กฎ/ชื่อไฟล์ไม่ตรงกัน");
    } else if (!ATTACHMENT.test(path)) throw new StorageError("recovery", "พบ candidate ค้างหรือไฟล์นอก namespace กรุณาตรวจก่อนย้าย");
  }
  for (const path of files.keys()) if (ATTACHMENT.test(path) && !used.has(path)) throw new StorageError("recovery", "พบไฟล์แนบค้างที่ยังไม่ได้ตรวจสอบ จึงยังไม่ย้ายแฟ้ม");
}

/** Archive callers already own their byte map. This helper does not copy its file buffers. */
export async function validateWorkspaceFiles(files: ReadonlyMap<string, Uint8Array>, current: StoredManifest): Promise<void> {
  const inventory = new Map<string, FileInfo>();
  for (const [path, bytes] of files) inventory.set(path, { size: bytes.byteLength, sha256: await sha256Hex(bytes) });
  await validateInventory(inventory, current, async (path) => {
    const bytes = files.get(path);
    if (!bytes) throw new StorageError("unreadable", "ไฟล์หายจาก inventory");
    return bytes;
  });
}

const readBounded = async (root: DirHandleLike, path: string): Promise<Uint8Array> => {
  const bytes = await readFileBytes(root, path, ATTACHMENT.test(path) ? MAX_ATTACHMENT_BYTES : MAX_METADATA_BYTES);
  if (!bytes) throw new StorageError("unreadable", "ไฟล์หายระหว่างอ่านโฟลเดอร์");
  return bytes;
};

/** Read-only traversal; hashes one bounded file at a time and retains descriptors, not document bytes. */
async function readSourceInventory(root: DirHandleLike): Promise<Map<string, FileInfo>> {
  const files = new Map<string, FileInfo>();
  let total = 0;
  async function visit(dir: DirHandleLike, prefix: string): Promise<void> {
    for (const entry of await listNames(dir)) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        if (!(path === "attachments" || path === "rules" || path === ".recovery" || /^rules\/\d{4}$/.test(path))) throw new StorageError("invalid", "พบโฟลเดอร์ที่ไม่ใช่ของแอป");
        await visit(await resolveDir(dir, [entry.name], false), path);
      } else {
        if (path !== "data.json" && !ATTACHMENT.test(path) && !RULE.test(path) && !SNAPSHOT.test(path)) throw new StorageError("recovery", "พบไฟล์ค้าง/ไฟล์นอก namespace กรุณาตรวจก่อนย้าย");
        const handle = await dir.getFileHandle(entry.name);
        const file = await handle.getFile();
        total += file.size;
        if (total > LIMITS.managedBytes || files.size >= LIMITS.managedEntries) throw new StorageError("capacity", "ต้นฉบับเกินขีดจำกัดของแฟ้ม");
        const bytes = await readBounded(root, path);
        files.set(path, { size: bytes.byteLength, sha256: await sha256Hex(bytes) });
      }
    }
  }
  await visit(root, "");
  return files;
}

function checkInventoryBudget(files: Inventory, current: Manifest): void {
  const sizes = [...files].filter(([path]) => ATTACHMENT.test(path)).map(([, info]) => info.size);
  const otherBytes = [...files].filter(([path]) => path !== "data.json" && !ATTACHMENT.test(path)).reduce((sum, [, info]) => sum + info.size, 0);
  const result = checkBudget({ attachmentByteSizes: sizes, metadataBytes: encodeManifest(current).byteLength, ruleBytes: otherBytes, extraEntries: files.size - sizes.length + 4 });
  if (!result.ok) throw new StorageError("capacity", "สำเนารุ่นใหม่เกินขีดจำกัด จึงไม่เขียนไฟล์");
}

export function assertMigrationBudget(files: ReadonlyMap<string, Uint8Array>, current: Manifest): void {
  checkInventoryBudget(new Map([...files].map(([path, bytes]) => [path, { size: bytes.byteLength, sha256: "" }])), current);
}

/** Explicit sequential copy. Source and historical snapshot bytes remain untouched. */
export async function migrateWorkspaceIntoEmptyFolder(source: DirHandleLike, target: DirHandleLike, confirmed: boolean): Promise<Manifest> {
  if (!confirmed) throw new StorageError("upgrade-required", "ต้องยืนยันก่อนสร้างสำเนาข้อมูลรุ่นใหม่");
  if (source === target || (source.isSameEntry && await source.isSameEntry(target))) throw new StorageError("not-empty", "ต้องเลือกโฟลเดอร์ใหม่คนละโฟลเดอร์");
  if ((await listNames(target)).length !== 0) throw new StorageError("not-empty", "โฟลเดอร์ปลายทางต้องว่าง");
  const baseline = await readBounded(source, "data.json");
  const legacy = decodeManifest(baseline);
  if (legacy.schemaVersion !== 1) throw new StorageError("invalid", "แฟ้มนี้ไม่ใช่ข้อมูลรุ่นเดิม");
  const baselineHash = await sha256Hex(baseline);
  const lock = await acquireWriterLock(legacy.workspaceId);
  if (!lock.granted) throw new StorageError("read-only", "ยังย้ายไม่ได้ มีหน้าต่างอื่นแก้ไขอยู่หรือไม่รองรับการล็อก");
  const written: string[] = [];
  let attemptedWrite = false;
  try {
    const files = await readSourceInventory(source);
    if (files.get("data.json")?.sha256 !== baselineHash) throw new StorageError("conflict", "ข้อมูลต้นฉบับเปลี่ยนก่อนย้าย");
    await validateInventory(files, legacy, (path) => readBounded(source, path));
    const current = upgradeManifestV1(legacy);
    checkInventoryBudget(files, current);
    // All source validation and budget checks finish before the first target write.
    for (const [path, info] of files) {
      if (path === "data.json") continue;
      const bytes = await readBounded(source, path);
      if (bytes.byteLength !== info.size || await sha256Hex(bytes) !== info.sha256) throw new StorageError("conflict", "ไฟล์ต้นฉบับเปลี่ยนระหว่างย้าย");
      attemptedWrite = true;
      await writeVerified(target, path, bytes);
      written.push(path);
    }
    if (await sha256Hex(await readBounded(source, "data.json")) !== baselineHash) throw new StorageError("conflict", "ต้นฉบับเปลี่ยนระหว่างย้าย จึงยังไม่เปิดสำเนา");
    attemptedWrite = true;
    const currentBytes = encodeManifest(current);
    await writeVerified(target, "data.json", currentBytes);
    written.push("data.json");
    const verified = await readSourceInventory(target);
    if (verified.get("data.json")?.sha256 !== await sha256Hex(currentBytes)) throw new StorageError("write-failed", "สำเนาไม่ตรงกับข้อมูลที่แปลง");
    for (const [path, info] of files) if (path !== "data.json" && verified.get(path)?.sha256 !== info.sha256) throw new StorageError("write-failed", "ไฟล์สำเนาไม่ตรงกับต้นฉบับ");
    await validateInventory(verified, current, (path) => readBounded(target, path));
    return current;
  } catch (error) {
    if (attemptedWrite) await writeVerified(target, INCOMPLETE_MARKER, new TextEncoder().encode(JSON.stringify({ written }))).catch(() => undefined);
    throw error;
  } finally {
    lock.release();
  }
}
