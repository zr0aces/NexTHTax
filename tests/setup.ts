import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

// jsdom does not provide WebCrypto subtle. Use Node's implementation for SHA-256 in tests.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}
