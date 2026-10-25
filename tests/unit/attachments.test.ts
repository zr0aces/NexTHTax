import { describe, expect, it } from "vitest";
import { detectMediaType, safeDisplayName } from "../../src/storage/attachments";
import { PDF_BYTES, jpegBytes, pngBytes } from "../fixtures/samples";

describe("detectMediaType", () => {
  it("detects by magic bytes, not by name", () => {
    expect(detectMediaType(PDF_BYTES)).toBe("application/pdf");
    expect(detectMediaType(jpegBytes(1, 1))).toBe("image/jpeg");
    expect(detectMediaType(pngBytes(1, 1))).toBe("image/png");
    expect(detectMediaType(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("safeDisplayName", () => {
  it("strips control characters and falls back when empty", () => {
    expect(safeDisplayName("a\u0007b", "x.pdf")).toBe("ab");
    expect(safeDisplayName("   ", "fallback.pdf")).toBe("fallback.pdf");
  });
});
