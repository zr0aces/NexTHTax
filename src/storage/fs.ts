import { sha256Hex } from "./hash";

// Minimal structural types for the File System Access API. Real handles satisfy these; tests use an in-memory fake.
export interface WritableLike {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
export interface FileHandleLike {
  kind: "file";
  name: string;
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  createWritable(): Promise<WritableLike>;
}
export interface DirHandleLike {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, FileHandleLike | DirHandleLike]>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  queryPermission?(opts: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
  requestPermission?(opts: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
}

export class StorageError extends Error {
  constructor(
    readonly code:
      | "permission"
      | "not-empty"
      | "newer-schema"
      | "invalid"
      | "conflict"
      | "capacity"
      | "read-only"
      | "write-failed"
      | "unreadable"
      | "duplicate"
      | "unsupported-file"
      | "too-large"
      | "recovery",
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === "NotFoundError";
}

/** Walks a relative path made of single segments, optionally creating directories. Rejects traversal. */
export async function resolveDir(root: DirHandleLike, segments: readonly string[], create: boolean): Promise<DirHandleLike> {
  let current = root;
  for (const seg of segments) {
    assertSegment(seg);
    current = await current.getDirectoryHandle(seg, { create });
  }
  return current;
}

export function assertSegment(seg: string): void {
  if (seg === "" || seg === "." || seg === ".." || /[\\/\u0000]/.test(seg)) {
    throw new StorageError("invalid", "ชื่อไฟล์หรือโฟลเดอร์ไม่ปลอดภัย");
  }
}

/** Reads a file by relative path. Returns null when absent. Refuses files above maxBytes before reading them. */
export async function readFileBytes(root: DirHandleLike, rel: string, maxBytes: number): Promise<Uint8Array | null> {
  const parts = rel.split("/");
  const name = parts.pop() ?? "";
  try {
    const dir = await resolveDir(root, parts, false);
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    if (file.size > maxBytes) throw new StorageError("too-large", `ไฟล์ ${rel} ใหญ่เกินขีดจำกัด`);
    return new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    if (err instanceof StorageError) throw err;
    if (isNotFound(err)) return null;
    throw new StorageError("unreadable", `อ่าน ${rel} ไม่ได้`);
  }
}

/**
 * Writes bytes to a file, closes it, reads it back and compares SHA-256.
 * createWritable commits on close; any failure aborts and leaves the previous file content in place.
 */
export async function writeVerified(root: DirHandleLike, rel: string, bytes: Uint8Array): Promise<string> {
  const parts = rel.split("/");
  const name = parts.pop() ?? "";
  const expected = await sha256Hex(bytes);
  const dir = await resolveDir(root, parts, true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as BufferSource);
    await writable.close();
  } catch (err) {
    await writable.abort(err).catch(() => undefined);
    throw new StorageError("write-failed", `เขียน ${rel} ไม่สำเร็จ`);
  }
  const readBack = await readFileBytes(root, rel, Number.MAX_SAFE_INTEGER);
  if (!readBack || (await sha256Hex(readBack)) !== expected) {
    throw new StorageError("write-failed", `อ่านกลับ ${rel} ไม่ตรงกับที่เขียน`);
  }
  return expected;
}

export async function removeFileIfExists(root: DirHandleLike, rel: string): Promise<void> {
  const parts = rel.split("/");
  const name = parts.pop() ?? "";
  try {
    const dir = await resolveDir(root, parts, false);
    await dir.removeEntry(name);
  } catch (err) {
    if (!isNotFound(err)) throw new StorageError("write-failed", `ลบ ${rel} ไม่สำเร็จ`);
  }
}

export async function listNames(dir: DirHandleLike): Promise<Array<{ name: string; kind: "file" | "directory" }>> {
  const out: Array<{ name: string; kind: "file" | "directory" }> = [];
  for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind === "file" ? "file" : "directory" });
  return out;
}
