import { MAX_ATTACHMENT_BYTES, MAX_METADATA_BYTES, MEDIA_EXTENSIONS, SCHEMA_VERSION, type Attachment, type Manifest, type PriorManifest, type StoredManifest } from "../domain/schema";
import { readImageHeader } from "../domain/imageHeaders";
import { acquireWriterLock, type WriterLock } from "./locking";
import { decodeManifest, editableManifest, manifestForStorage, encodeManifest, validateManifest } from "./manifest";
import {
  type DirHandleLike,
  StorageError,
  assertSegment,
  listNames,
  readFileBytes,
  removeFileIfExists,
  resolveDir,
  writeVerified,
} from "./fs";
import { sha256Hex } from "./hash";
import { ATTACHMENT_FILE_PATTERN, detectMediaType, safeDisplayName, type MediaType } from "./attachments";
import { checkBudget } from "./capacity";
import { pruneSnapshots, RECOVERY_DIR, retireSnapshotsReferencing, listPendingCandidates } from "./recovery";
import { ruleBytesIn } from "./rulesFiles";

/** Reserved non-attachment entries counted in the budget: data.json plus up to three recovery files. */
const RESERVED_ENTRIES = 1 + 3;

export const DATA_FILE = "data.json";
export const ATTACHMENT_DIR = "attachments";
export const RULES_DIR = "rules";

export interface OpenResult {
  session: WorkspaceSession;
  /** Attachments the manifest references whose bytes are absent or the wrong size. Shown to the user, never auto-removed. */
  missingAttachments: string[];
  /** Managed-looking files in attachments/ not referenced by the manifest. Left untouched. */
  orphanFiles: string[];
  /** Pending candidates from an interrupted save. Kept, never applied automatically. */
  pendingCandidates: string[];
}

export interface UpgradeRequired { upgradeRequired: true; manifest: PriorManifest; }

export type AddAttachmentResult =
  | { status: "added"; attachment: Attachment; previewable: boolean }
  | { status: "duplicate"; existingIds: string[] };

export function isFileSystemAccessSupported(): boolean {
  return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

export function nowIso(): string {
  return new Date().toISOString();
}

async function ensurePermission(root: DirHandleLike): Promise<void> {
  if (!root.queryPermission) return;
  const state = await root.queryPermission({ mode: "readwrite" });
  if (state === "granted") return;
  const requested = root.requestPermission ? await root.requestPermission({ mode: "readwrite" }) : "denied";
  if (requested !== "granted") throw new StorageError("permission", "ไม่ได้รับสิทธิ์อ่านและเขียนโฟลเดอร์");
}

/** Reads an existing folder. Returns needsSetup when the folder is empty and must be initialized with a taxpayer name. */
export async function openWorkspace(root: DirHandleLike): Promise<OpenResult | { needsSetup: true } | UpgradeRequired> {
  await ensurePermission(root);
  if ((await listNames(root)).some((entry) => entry.name === ".restore-incomplete.json")) throw new StorageError("recovery", "โฟลเดอร์นี้กู้คืน/ย้ายไม่สมบูรณ์ กรุณาเลือกโฟลเดอร์ว่างใหม่เพื่อทำซ้ำ");
  const bytes = await readFileBytes(root, DATA_FILE, MAX_METADATA_BYTES);
  if (!bytes) {
    if ((await listNames(root)).length === 0) return { needsSetup: true };
    throw new StorageError("not-empty", "โฟลเดอร์นี้ไม่ว่างและไม่มี data.json ของ NexTHTax");
  }
  const manifest = decodeManifest(bytes);
  const baselineSha = await sha256Hex(bytes);
  const inventory = await inspectAttachments(root, manifest);
  const lock = await acquireWriterLock(manifest.workspaceId);
  const session = new WorkspaceSession(root, editableManifest(manifest), baselineSha, lock, await ruleBytesIn(root), manifest.schemaVersion);
  return {
    session,
    missingAttachments: inventory.missing,
    orphanFiles: inventory.orphans,
    pendingCandidates: await listPendingCandidates(root),
  };
}

/** Initializes an empty folder as a new workspace. Refuses any folder with existing entries. */
export async function createWorkspace(root: DirHandleLike, taxpayerName: string): Promise<OpenResult> {
  await ensurePermission(root);
  if ((await listNames(root)).length > 0) throw new StorageError("not-empty", "ต้องเลือกโฟลเดอร์ว่างเท่านั้นสำหรับสร้างข้อมูลใหม่");
  const name = taxpayerName.trim();
  if (name === "" || name.length > 200) throw new StorageError("invalid", "กรุณาระบุชื่อผู้เสียภาษี (ไม่เกิน 200 ตัวอักษร)");
  const now = nowIso();
  const manifest = validateManifest({
    schemaVersion: SCHEMA_VERSION,
    workspaceId: crypto.randomUUID(),
    revision: 1,
    createdAt: now,
    updatedAt: now,
    taxpayer: { displayName: name },
    years: {},
    records: [],
    attachments: {},
  });
  const bytes = encodeManifest(manifest);
  await resolveDir(root, [ATTACHMENT_DIR], true);
  await resolveDir(root, [RULES_DIR], true);
  await resolveDir(root, [RECOVERY_DIR], true);
  await writeVerified(root, DATA_FILE, bytes);
  const reopened = await openWorkspace(root);
  if ("needsSetup" in reopened || "upgradeRequired" in reopened) throw new StorageError("write-failed", "สร้างข้อมูลแล้วแต่อ่านกลับไม่พบ data.json");
  return reopened;
}

async function inspectAttachments(root: DirHandleLike, manifest: StoredManifest): Promise<{ missing: string[]; orphans: string[] }> {
  const missing: string[] = [];
  const orphans: string[] = [];
  let names: Array<{ name: string; kind: "file" | "directory" }> = [];
  try {
    const dir = await resolveDir(root, [ATTACHMENT_DIR], false);
    names = await listNames(dir);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "NotFoundError")) throw err;
  }
  const foreign = names.filter((n) => n.kind !== "file" || !ATTACHMENT_FILE_PATTERN.test(n.name));
  if (foreign.length > 0) throw new StorageError("invalid", "พบไฟล์หรือโฟลเดอร์ที่ไม่ใช่ของแอปใน attachments/");
  const referenced = new Set(Object.values(manifest.attachments).map((a) => a.path.split("/")[1] ?? ""));
  for (const att of Object.values(manifest.attachments)) {
    const fileName = att.path.split("/")[1] ?? "";
    const present = names.some((n) => n.name === fileName);
    if (!present) {
      missing.push(att.displayName);
      continue;
    }
    const dir = await resolveDir(root, [ATTACHMENT_DIR], false);
    const handle = await dir.getFileHandle(fileName);
    const file = await handle.getFile();
    if (file.size !== att.byteSize) missing.push(att.displayName);
  }
  for (const n of names) if (!referenced.has(n.name)) orphans.push(n.name);
  return { missing, orphans };
}

/**
 * Single serialized writer for one workspace. Every mutation builds an immutable candidate, validates it,
 * persists the candidate and the previous manifest, writes data.json and reads it back before reporting success.
 */
export class WorkspaceSession {
  private manifestState: Manifest;
  private baselineSha: string;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingRel: string | null = null;
  private conflict = false;
  private closed = false;
  private ruleBytes: number;
  private lock: WriterLock;

  constructor(
    readonly root: DirHandleLike,
    manifest: Manifest,
    baselineSha: string,
    lock: WriterLock,
    ruleBytes: number,
    readonly storageSchemaVersion: StoredManifest["schemaVersion"] = SCHEMA_VERSION,
  ) {
    this.manifestState = manifest;
    this.baselineSha = baselineSha;
    this.lock = lock;
    this.ruleBytes = ruleBytes;
  }

  get manifest(): Manifest {
    return this.manifestState;
  }

  get storedManifest(): StoredManifest {
    return manifestForStorage(this.manifestState, this.storageSchemaVersion);
  }

  get readOnly(): boolean {
    return !this.lock.granted || this.conflict || this.closed;
  }

  get hasConflict(): boolean {
    return this.conflict;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.lock.release();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private assertWritable(): void {
    if (this.closed) throw new StorageError("read-only", "ปิดโฟลเดอร์นี้แล้ว");
    if (!this.lock.granted) throw new StorageError("read-only", "หน้าต่างอื่นกำลังแก้ไขโฟลเดอร์นี้อยู่ (อ่านได้อย่างเดียว)");
    if (this.conflict) throw new StorageError("conflict", "พบการเปลี่ยนแปลงจากภายนอก กรุณาเปิดโฟลเดอร์ใหม่");
  }

  /** Detects external changes and adopts a pending candidate only when its bytes are exactly what is on disk. */
  private async reconcile(): Promise<void> {
    const current = await readFileBytes(this.root, DATA_FILE, MAX_METADATA_BYTES);
    if (!current) throw new StorageError("unreadable", "data.json หายไประหว่างใช้งาน");
    const sha = await sha256Hex(current);
    if (sha === this.baselineSha) return;
    if (this.pendingRel) {
      const pending = await readFileBytes(this.root, this.pendingRel, MAX_METADATA_BYTES);
      if (pending && (await sha256Hex(pending)) === sha) {
        const stored = decodeManifest(pending);
        if (stored.schemaVersion !== this.storageSchemaVersion) throw new StorageError("conflict", "รูปแบบข้อมูลเปลี่ยนระหว่างบันทึก กรุณาเปิดโฟลเดอร์ใหม่");
        this.manifestState = editableManifest(stored);
        this.baselineSha = sha;
        this.pendingRel = null;
        return;
      }
    }
    this.conflict = true;
    throw new StorageError("conflict", "data.json ถูกเปลี่ยนจากภายนอก ระบบจะไม่เขียนทับ");
  }

  private async commitLocked(next: Manifest): Promise<void> {
    this.assertWritable();
    await this.reconcile();
    const candidate = validateManifest({ ...next, revision: this.manifestState.revision + 1, updatedAt: nowIso() });
    const bytes = encodeManifest(manifestForStorage(candidate, this.storageSchemaVersion));
    const budget = checkBudget({
      attachmentByteSizes: Object.values(candidate.attachments).map((a) => a.byteSize),
      metadataBytes: bytes.byteLength,
      ruleBytes: this.ruleBytes,
      extraEntries: RESERVED_ENTRIES,
    });
    if (!budget.ok) throw new StorageError("capacity", `เกินขีดจำกัดของโฟลเดอร์ (${budget.reason}) การเปลี่ยนแปลงถูกปฏิเสธ`);
    const current = await readFileBytes(this.root, DATA_FILE, MAX_METADATA_BYTES);
    if (!current || (await sha256Hex(current)) !== this.baselineSha) {
      this.conflict = true;
      throw new StorageError("conflict", "data.json เปลี่ยนระหว่างบันทึก ระบบไม่เขียนทับ");
    }
    const token = crypto.randomUUID();
    const pendingRel = `${RECOVERY_DIR}/pending-${token}.json`;
    await writeVerified(this.root, pendingRel, bytes);
    this.pendingRel = pendingRel;
    await writeVerified(this.root, `${RECOVERY_DIR}/prev-${this.manifestState.revision}-${token}.json`, current);
    try {
      const sha = await writeVerified(this.root, DATA_FILE, bytes);
      this.manifestState = candidate;
      this.baselineSha = sha;
    } catch (err) {
      // Read-back failed. Next reconcile adopts the candidate only if it is what is on disk.
      throw err instanceof StorageError ? err : new StorageError("write-failed", "บันทึกไม่สำเร็จ");
    }
    await removeFileIfExists(this.root, pendingRel).catch(() => undefined);
    this.pendingRel = null;
    await pruneSnapshots(this.root).catch(() => undefined);
  }

  /** Applies a mutation to a copy of the manifest and commits it as one revision. */
  mutate(apply: (draft: Manifest) => void): Promise<Manifest> {
    return this.enqueue(async () => {
      this.assertWritable();
      await this.reconcile();
      const next = structuredClone(this.manifestState);
      apply(next);
      await this.commitLocked(next);
      return this.manifestState;
    });
  }

  /** Copies an attachment into the managed namespace, verifies bytes, then commits the reference. */
  addAttachment(file: File, displayName: string, allowDuplicate: boolean): Promise<AddAttachmentResult> {
    return this.enqueue(async (): Promise<AddAttachmentResult> => {
      this.assertWritable();
      await this.reconcile();
      if (file.size > MAX_ATTACHMENT_BYTES) throw new StorageError("too-large", "ไฟล์ใหญ่เกิน 100 MiB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mediaType: MediaType | null = detectMediaType(bytes);
      if (!mediaType) throw new StorageError("unsupported-file", "รองรับเฉพาะ PDF, JPEG และ PNG");
      let previewable = true;
      if (mediaType !== "application/pdf") {
        const header = readImageHeader(bytes, mediaType);
        if (!header.ok) {
          if (header.reason !== "pixel-limit") throw new StorageError("unsupported-file", "หัวไฟล์รูปภาพไม่ถูกต้องหรืออ่านไม่ได้");
          previewable = false;
        }
      }
      const sha = await sha256Hex(bytes);
      const existingIds = Object.values(this.manifestState.attachments)
        .filter((a) => a.sha256 === sha)
        .map((a) => a.id);
      if (existingIds.length > 0 && !allowDuplicate) return { status: "duplicate", existingIds };
      const id = crypto.randomUUID();
      const path = `${ATTACHMENT_DIR}/${id}.${MEDIA_EXTENSIONS[mediaType]}`;
      const attachment: Attachment = {
        id,
        displayName: safeDisplayName(displayName, file.name),
        path,
        mediaType,
        byteSize: bytes.byteLength,
        sha256: sha,
      };
      const budget = checkBudget({
        attachmentByteSizes: [...Object.values(this.manifestState.attachments).map((a) => a.byteSize), bytes.byteLength],
        metadataBytes: encodeManifest(this.storedManifest).byteLength,
        ruleBytes: this.ruleBytes,
        extraEntries: RESERVED_ENTRIES,
      });
      if (!budget.ok) throw new StorageError("capacity", `เกินขีดจำกัดของโฟลเดอร์ (${budget.reason}) ไฟล์ถูกปฏิเสธก่อนคัดลอก`);
      await writeVerified(this.root, path, bytes);
      const next = structuredClone(this.manifestState);
      next.attachments[id] = attachment;
      try {
        await this.commitLocked(next);
      } catch (err) {
        // The copied file stays as an orphan for inspection. It is never auto-deleted.
        throw new StorageError(
          err instanceof StorageError ? err.code : "write-failed",
          `คัดลอกไฟล์แล้วแต่บันทึกรายการไม่สำเร็จ ไฟล์ค้างอยู่ใน attachments/ (${err instanceof Error ? err.message : ""})`,
        );
      }
      return { status: "added", attachment, previewable };
    });
  }

  /** Reads an attachment, checking size and SHA-256 against the manifest before returning bytes. */
  readAttachment(id: string): Promise<{ attachment: Attachment; bytes: Uint8Array }> {
    const att = this.manifestState.attachments[id];
    if (!att) throw new StorageError("invalid", "ไม่พบไฟล์แนบ");
    return (async () => {
      const bytes = await readFileBytes(this.root, att.path, MAX_ATTACHMENT_BYTES);
      if (!bytes || bytes.byteLength !== att.byteSize || (await sha256Hex(bytes)) !== att.sha256) {
        throw new StorageError("unreadable", "ไฟล์แนบหายหรือไม่ตรงกับที่บันทึกไว้");
      }
      return { attachment: att, bytes };
    })();
  }

  /** Permanent delete: commit refs removed, verify a post-delete snapshot, retire affected history, then delete bytes. */
  purgeRecord(recordId: string): Promise<string[]> {
    return this.enqueue(async () => {
      this.assertWritable();
      await this.reconcile();
      const next = structuredClone(this.manifestState);
      const idx = next.records.findIndex((r) => r.id === recordId);
      if (idx < 0) throw new StorageError("invalid", "ไม่พบรายการที่จะลบ");
      const [removed] = next.records.splice(idx, 1);
      if (!removed) throw new StorageError("invalid", "ไม่พบรายการที่จะลบ");
      for (const year of Object.values(next.years)) {
        const inputs = year.taxInputs;
        if (inputs && [...inputs.incomeItems, ...inputs.deductions].some((i) => i.sourceRecordIds.includes(recordId))) {
          for (const item of [...inputs.incomeItems, ...inputs.deductions]) {
            if (!item.sourceRecordIds.includes(recordId)) continue;
            item.sourceRecordIds = item.sourceRecordIds.filter((id) => id !== recordId);
            if ("eligibility" in item) item.eligibility = "unknown";
          }
          inputs.confirmedSourcesDigest = null;
          inputs.confirmedWorksheetDigest = null;
          inputs.incomeComplete = "unknown";
          inputs.withholdingComplete = "unknown";
          inputs.deductionsComplete = "unknown";
          inputs.finalTaxGroupsComplete = "unknown";
        }
        if (year.plan?.evidenceRecordId === recordId) {
          year.plan.evidenceRecordId = null;
          year.plan.completionDigest = null;
        }
      }
      const stillReferenced = new Set(next.records.flatMap((r) => r.attachmentIds));
      const purged: Attachment[] = [];
      for (const aid of removed.attachmentIds) {
        const att = next.attachments[aid];
        if (!stillReferenced.has(aid) && att) {
          purged.push(att);
          delete next.attachments[aid];
        }
      }
      await this.commitLocked(next);
      const current = await readFileBytes(this.root, DATA_FILE, MAX_METADATA_BYTES);
      if (!current) throw new StorageError("unreadable", "อ่าน data.json หลังลบไม่ได้");
      await writeVerified(this.root, `${RECOVERY_DIR}/post-${this.manifestState.revision}-${crypto.randomUUID()}.json`, current);
      if (purged.length > 0) {
        await retireSnapshotsReferencing(this.root, new Set(purged.map((a) => a.id)));
      }
      for (const att of purged) await removeFileIfExists(this.root, att.path);
      return purged.map((a) => a.displayName);
    });
  }

  /** Pins a rule snapshot into rules/<year>/<version>.json and records its version and digest on the year. */
  pinRules(taxYear: number, version: string, path: string, bytes: Uint8Array, digest: string): Promise<Manifest> {
    return this.enqueue(async () => {
      this.assertWritable();
      await this.reconcile();
      if ((await sha256Hex(bytes)) !== digest) throw new StorageError("invalid", "เนื้อหากฎไม่ตรงกับ digest");
      for (const seg of path.split("/")) assertSegment(seg);
      await writeVerified(this.root, path, bytes);
      this.ruleBytes += bytes.byteLength;
      const next = structuredClone(this.manifestState);
      const key = String(taxYear);
      const existing = next.years[key];
      next.years[key] = {
        taxYear,
        rulesVersion: version,
        rulesDigest: digest,
        eligibility: existing?.eligibility ?? {},
        taxInputs: existing?.taxInputs ?? null,
        scenarios: existing?.scenarios ?? [],
        plan: existing?.plan ?? null,
      };
      await this.commitLocked(next);
      return this.manifestState;
    });
  }

  /** Ensures a year entry exists before records are added to that year. */
  ensureYear(taxYear: number): Promise<Manifest> {
    if (this.manifestState.years[String(taxYear)]) return Promise.resolve(this.manifestState);
    return this.mutate((draft) => {
      draft.years[String(taxYear)] = { taxYear, rulesVersion: null, rulesDigest: null, eligibility: {}, taxInputs: null, scenarios: [] };
    });
  }

  /** Exposed for the backup module so it can verify the managed inventory. */
  get attachmentsSnapshot(): Attachment[] {
    return Object.values(this.manifestState.attachments);
  }
}

/** Shows the native folder picker in readwrite mode. Must be called from a user gesture. */
export async function pickWorkspaceFolder(): Promise<DirHandleLike> {
  const picker = (globalThis as unknown as { showDirectoryPicker?: (opts: { mode: "readwrite" }) => Promise<DirHandleLike> }).showDirectoryPicker;
  if (!picker) throw new StorageError("unsupported-file", "เบราว์เซอร์นี้ไม่รองรับการเลือกโฟลเดอร์ (ใช้ Chrome หรือ Edge บนคอมพิวเตอร์)");
  try {
    return await picker({ mode: "readwrite" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new StorageError("permission", "ยกเลิกการเลือกโฟลเดอร์");
    throw new StorageError("permission", "เลือกโฟลเดอร์ไม่สำเร็จ");
  }
}
