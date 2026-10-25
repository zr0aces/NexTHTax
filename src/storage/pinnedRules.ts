import { bundlePath, catalogSchema, parseRuleBundle, type AnyRuleBundle, type Catalog, type CatalogEntry } from "../domain/rules";
import { type Manifest, MAX_METADATA_BYTES } from "../domain/schema";
import { type DirHandleLike, StorageError, readFileBytes } from "./fs";
import { sha256Hex } from "./hash";

export interface LoadedBundle {
  bundle: AnyRuleBundle;
  digest: string;
}

function parseBundle(bytes: Uint8Array, expectedYear: number): AnyRuleBundle {
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new StorageError("invalid", "ไฟล์กฎไม่ใช่ JSON UTF-8 ที่ถูกต้อง");
  }
  const parsed = parseRuleBundle(json);
  if (!parsed) throw new StorageError("invalid", "ไฟล์กฎไม่ผ่านการตรวจสอบโครงสร้าง");
  if (parsed.taxYear !== expectedYear) throw new StorageError("invalid", "ปีของไฟล์กฎไม่ตรงกับปีที่ปักไว้");
  return parsed;
}

/** Loads the rule snapshot pinned for a year. Digest must match the value recorded in the manifest. */
export async function loadPinnedBundle(root: DirHandleLike, manifest: Manifest, taxYear: number): Promise<LoadedBundle | null> {
  const year = manifest.years[String(taxYear)];
  if (!year?.rulesVersion || !year.rulesDigest) return null;
  const bytes = await readFileBytes(root, bundlePath(taxYear, year.rulesVersion), MAX_METADATA_BYTES);
  if (!bytes) throw new StorageError("unreadable", "ไม่พบ snapshot กฎที่ปักไว้ในโฟลเดอร์");
  const digest = await sha256Hex(bytes);
  if (digest !== year.rulesDigest) throw new StorageError("invalid", "snapshot กฎในโฟลเดอร์ไม่ตรงกับ digest ที่บันทึกไว้");
  return { bundle: parseBundle(bytes, taxYear), digest };
}

export async function fetchCatalog(baseUrl: string): Promise<Catalog> {
  const response = await fetch(`${baseUrl}rules/index.json`, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new StorageError("unreadable", "ไม่สามารถโหลดรายการกฎได้");
  const parsed = catalogSchema.safeParse(await response.json());
  if (!parsed.success) throw new StorageError("invalid", "รายการกฎไม่ผ่านการตรวจสอบ");
  return parsed.data;
}

/** Fetches one catalog bundle. Its bytes must match the catalog digest before they are parsed or pinned. */
export async function fetchBundle(baseUrl: string, entry: CatalogEntry): Promise<LoadedBundle & { bytes: Uint8Array }> {
  const response = await fetch(`${baseUrl}rules/${entry.path}`, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new StorageError("unreadable", "ไม่สามารถโหลดไฟล์กฎได้");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_METADATA_BYTES) throw new StorageError("too-large", "ไฟล์กฎใหญ่เกินกำหนด");
  const digest = await sha256Hex(bytes);
  if (digest !== entry.sha256) throw new StorageError("invalid", "ไฟล์กฎไม่ตรงกับ digest ในรายการ");
  return { bundle: parseBundle(bytes, entry.taxYear), digest, bytes };
}

/** Latest catalog entry for a year (catalog order is publication order). */
export function catalogEntryFor(catalog: Catalog | null, taxYear: number): CatalogEntry | null {
  if (!catalog) return null;
  const matches = catalog.bundles.filter((b) => b.taxYear === taxYear);
  return matches[matches.length - 1] ?? null;
}
