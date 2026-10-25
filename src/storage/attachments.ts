export type MediaType = "application/pdf" | "image/jpeg" | "image/png";

/** Detects type from magic bytes only. Extensions and user-declared types are never trusted. */
export function detectMediaType(bytes: Uint8Array): MediaType | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "application/pdf";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((v, i) => bytes[i] === v)) return "image/png";
  return null;
}

/** Display name is user text only. It never becomes a path. */
export function safeDisplayName(raw: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return cleaned === "" ? fallback.slice(0, 200) : cleaned;
}

export const ATTACHMENT_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/;
