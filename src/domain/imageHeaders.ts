// Reads image dimensions from bounded headers BEFORE any native decode. Malformed or oversized input is never sent to a decoder.

export const HEADER_SCAN_BUDGET = 1024 * 1024;
export const MAX_PREVIEW_PIXELS = 16_000_000n;

export type HeaderResult =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: "signature" | "truncated" | "unknown-sof" | "header-budget" | "zero-dimension" | "pixel-limit" };

export function readImageHeader(bytes: Uint8Array, mediaType: "image/jpeg" | "image/png"): HeaderResult {
  const dims = mediaType === "image/png" ? readPng(bytes) : readJpeg(bytes);
  if (!dims.ok) return dims;
  if (dims.width <= 0 || dims.height <= 0) return { ok: false, reason: "zero-dimension" };
  const pixels = BigInt(dims.width) * BigInt(dims.height);
  if (pixels > MAX_PREVIEW_PIXELS) return { ok: false, reason: "pixel-limit" };
  return dims;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function readPng(b: Uint8Array): HeaderResult {
  if (b.length < 24) return { ok: false, reason: "truncated" };
  if (!PNG_SIG.every((v, i) => b[i] === v)) return { ok: false, reason: "signature" };
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (view.getUint32(8) !== 13) return { ok: false, reason: "signature" };
  const type = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
  if (type !== "IHDR") return { ok: false, reason: "signature" };
  return { ok: true, width: view.getUint32(16), height: view.getUint32(20) };
}

function readJpeg(b: Uint8Array): HeaderResult {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ok: false, reason: "signature" };
  const limit = Math.min(b.length, HEADER_SCAN_BUDGET);
  let pos = 2;
  while (pos < limit) {
    if (b[pos] !== 0xff) return { ok: false, reason: "truncated" };
    while (pos < limit && b[pos] === 0xff) pos++;
    if (pos >= limit) break;
    const marker = b[pos] ?? 0;
    pos++;
    // Standalone markers carry no length: TEM, RSTn, SOI, EOI.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    if (pos + 2 > limit) return { ok: false, reason: "header-budget" };
    const segLen = ((b[pos] ?? 0) << 8) | (b[pos + 1] ?? 0);
    if (segLen < 2) return { ok: false, reason: "truncated" };
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (pos + 7 > b.length) return { ok: false, reason: "truncated" };
      const height = ((b[pos + 3] ?? 0) << 8) | (b[pos + 4] ?? 0);
      const width = ((b[pos + 5] ?? 0) << 8) | (b[pos + 6] ?? 0);
      return { ok: true, width, height };
    }
    if (marker === 0xda) return { ok: false, reason: "unknown-sof" };
    pos += segLen;
  }
  return { ok: false, reason: pos >= limit && limit < b.length ? "header-budget" : "unknown-sof" };
}
