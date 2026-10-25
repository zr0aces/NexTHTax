// Synthetic, redacted fixtures only. No real taxpayer documents are stored in the repository.

export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n");

export function pngBytes(width: number, height: number): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = new Uint8Array(25);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 13);
  ihdr.set([0x49, 0x48, 0x44, 0x52], 4); // IHDR
  view.setUint32(8, width);
  view.setUint32(12, height);
  ihdr.set([8, 2, 0, 0, 0], 16);
  const out = new Uint8Array(sig.length + ihdr.length);
  out.set(sig, 0);
  out.set(ihdr, sig.length);
  return out;
}

export function jpegBytes(width: number, height: number): Uint8Array {
  // SOI, APP0 (length 4 payload 2), SOF0 with precision 8, height, width.
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x0b, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x01, 0x01, 0x11, 0x00,
  ]);
}

/** Minimal File-like object accepted by addAttachment (name, size, arrayBuffer). */
export function fakeFile(bytes: Uint8Array, name: string): File {
  const copy = bytes.slice();
  return {
    name,
    size: copy.byteLength,
    arrayBuffer: async () => copy.buffer.slice(0) as ArrayBuffer,
  } as unknown as File;
}
