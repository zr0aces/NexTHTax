import { manifestSchema, legacyManifestSchema, v2ManifestSchema, detectSchemaVersion, SCHEMA_VERSION, MAX_METADATA_BYTES, type Manifest, type StoredManifest } from "../domain/schema";
import { StorageError } from "./fs";

export function encodeManifest(m: StoredManifest): Uint8Array {
  const bytes = new TextEncoder().encode(`${JSON.stringify(m, null, 2)}\n`);
  if (bytes.byteLength > MAX_METADATA_BYTES) throw new StorageError("capacity", "ข้อมูลเมทาดาทาเกิน 20 MiB");
  return bytes;
}

/** Decodes and validates a manifest. Newer schema is reported as such and never downgraded. */
export function decodeManifest(bytes: Uint8Array): StoredManifest {
  if (bytes.byteLength > MAX_METADATA_BYTES) throw new StorageError("too-large", "data.json ใหญ่เกิน 20 MiB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new StorageError("invalid", "data.json ไม่ใช่ JSON UTF-8 ที่ถูกต้อง");
  }
  const version = detectSchemaVersion(parsed);
  if (version !== null && version > SCHEMA_VERSION) {
    throw new StorageError("newer-schema", `ข้อมูลสร้างด้วยเวอร์ชันใหม่กว่า (schema ${version}) กรุณาใช้แอปรุ่นที่รองรับ`);
  }
  const result = (version === 1 ? legacyManifestSchema : version === 2 ? v2ManifestSchema : manifestSchema).safeParse(parsed);
  if (!result.success) {
    throw new StorageError("invalid", `data.json ไม่ผ่านการตรวจสอบ: ${result.error.issues[0]?.message ?? "ไม่ทราบสาเหตุ"}`);
  }
  return result.data;
}

export function validateManifest(m: unknown): Manifest {
  const result = manifestSchema.safeParse(m);
  if (!result.success) throw new StorageError("invalid", result.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  return result.data;
}

/** Writable sessions accept only current manifests, never silently upgrade legacy data. */
export function decodeCurrentManifest(bytes: Uint8Array): Manifest {
  const manifest = decodeManifest(bytes);
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new StorageError("upgrade-required", "ข้อมูลรุ่นเดิม ต้องสร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่างก่อนแก้ไข");
  return manifest;
}
