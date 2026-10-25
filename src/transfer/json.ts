import { type Manifest } from "../domain/schema";
import { decodeManifest, encodeManifest } from "../storage/manifest";
import { type DirHandleLike, StorageError, listNames, writeVerified } from "../storage/fs";
import { DATA_FILE } from "../storage/workspace";

/** Metadata-only export. It is NOT a full backup: attachment bytes, rules and recovery are excluded. */
export function exportMetadataJson(manifest: Manifest): Blob {
  return new Blob([encodeManifest(manifest) as BlobPart], { type: "application/json" });
}

/**
 * Imports a metadata JSON into an EMPTY new folder only. Attachments are reported as missing until the user relinks files.
 * Input is validated before any write.
 */
export async function importMetadataIntoEmptyFolder(root: DirHandleLike, bytes: Uint8Array): Promise<Manifest> {
  if ((await listNames(root)).length > 0) throw new StorageError("not-empty", "นำเข้า JSON ได้เฉพาะโฟลเดอร์ว่างใหม่เท่านั้น");
  const manifest = decodeManifest(bytes);
  await writeVerified(root, DATA_FILE, encodeManifest(manifest));
  return manifest;
}
