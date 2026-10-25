import { describe, expect, it } from "vitest";
import { MAX_PREVIEW_PIXELS, readImageHeader } from "../../src/domain/imageHeaders";
import { jpegBytes, pngBytes } from "../fixtures/samples";

describe("readImageHeader", () => {
  it("reads PNG dimensions from IHDR", () => {
    expect(readImageHeader(pngBytes(640, 480), "image/png")).toEqual({ ok: true, width: 640, height: 480 });
  });
  it("reads JPEG dimensions from SOF", () => {
    expect(readImageHeader(jpegBytes(800, 600), "image/jpeg")).toEqual({ ok: true, width: 800, height: 600 });
  });
  it("refuses pixel counts above the preview limit before decoding", () => {
    expect(MAX_PREVIEW_PIXELS).toBe(16_000_000n);
    expect(readImageHeader(pngBytes(10000, 2000), "image/png")).toEqual({ ok: false, reason: "pixel-limit" });
  });
  it("rejects zero dimensions and bad signatures", () => {
    expect(readImageHeader(pngBytes(0, 10), "image/png")).toEqual({ ok: false, reason: "zero-dimension" });
    expect(readImageHeader(new Uint8Array([1, 2, 3, 4]), "image/png").ok).toBe(false);
    expect(readImageHeader(new Uint8Array([0xff, 0x00, 0x00, 0x00]), "image/jpeg").ok).toBe(false);
  });
  it("does not overflow on huge width times height", () => {
    expect(readImageHeader(pngBytes(0xffffffff, 0xffffffff), "image/png")).toEqual({ ok: false, reason: "pixel-limit" });
  });
  it("treats truncated JPEG headers as unavailable", () => {
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]), "image/jpeg").ok).toBe(false);
  });
});
