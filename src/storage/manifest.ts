import { manifestSchema, legacyManifestSchema, v2ManifestSchema, v3ManifestSchema, detectSchemaVersion, SCHEMA_VERSION, MAX_METADATA_BYTES, type Manifest, type StoredManifest } from "../domain/schema";
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
  const result = (version === 1 ? legacyManifestSchema : version === 2 ? v2ManifestSchema : version === 3 ? v3ManifestSchema : manifestSchema).safeParse(parsed);
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

/** Strict current-only decoder for callers requiring newer-format features. */
export function decodeCurrentManifest(bytes: Uint8Array): Manifest {
  const manifest = decodeManifest(bytes);
  if (manifest.schemaVersion !== SCHEMA_VERSION) throw new StorageError("upgrade-required", "ข้อมูลรุ่นเดิม ต้องสร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่างก่อนแก้ไข");
  return manifest;
}

/** Normalize only in memory. Opening old data must not write or bump its revision. */
export function editableManifest(stored: StoredManifest): Manifest {
  if (stored.schemaVersion === SCHEMA_VERSION) return stored;
  if (stored.schemaVersion !== 1) return validateManifest({ ...stored, schemaVersion: SCHEMA_VERSION });
  return validateManifest({
    ...stored, schemaVersion: SCHEMA_VERSION,
    records: stored.records.map((r) => ({ ...r, subcategory: null })),
    years: Object.fromEntries(Object.entries(stored.years).map(([key, year]) => [key, { ...year, taxInputs: null, scenarios: [] }])),
  });
}

/** Write back the opened format. Unsupported new facts are rejected, never silently dropped. */
export function manifestForStorage(current: Manifest, version: StoredManifest["schemaVersion"]): StoredManifest {
  if (version === SCHEMA_VERSION) return current;
  if (version === 3) {
    const stored = v3ManifestSchema.safeParse({ ...current, schemaVersion: 3 });
    if (!stored.success) throw new StorageError("upgrade-required", "ประเภทกองทุนนี้ต้องใช้รูปแบบใหม่ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน");
    return stored.data;
  }
  const years: Record<string, unknown> = {};
  for (const [key, year] of Object.entries(current.years)) {
    const { plan, ...v2Year } = year;
    if (plan != null) throw new StorageError("upgrade-required", "แผนที่บันทึกต้องใช้รูปแบบใหม่ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน");
    if (version === 2) { years[key] = v2Year; continue; }
    const { taxInputs, scenarios, ...v1Year } = v2Year;
    if (taxInputs !== null || scenarios.length > 0) throw new StorageError("upgrade-required", "ข้อมูลคำนวณภาษีต้องใช้รูปแบบใหม่ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน");
    years[key] = v1Year;
  }
  const records = version === 2 ? current.records : current.records.map(({ subcategory, ...record }) => {
    if (subcategory !== null) throw new StorageError("upgrade-required", "ประเภทย่อยต้องใช้รูปแบบใหม่ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน");
    return record;
  });
  const result = (version === 2 ? v2ManifestSchema : legacyManifestSchema).safeParse({ ...current, schemaVersion: version, years, records });
  if (!result.success) throw new StorageError("upgrade-required", "ประเภทกองทุนนี้ต้องใช้รูปแบบใหม่ กรุณาสร้างสำเนาสำหรับคุณสมบัติใหม่ก่อน");
  return result.data;
}
