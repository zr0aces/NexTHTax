import { describe, expect, it } from "vitest";
import { checkBudget, LIMITS, MIB } from "../../src/storage/capacity";

describe("checkBudget", () => {
  it("admits a small workspace", () => {
    expect(checkBudget({ attachmentByteSizes: [1000], metadataBytes: 5000, ruleBytes: 0, extraEntries: 4 })).toEqual({ ok: true });
  });
  it("rejects metadata above 20 MiB", () => {
    expect(checkBudget({ attachmentByteSizes: [], metadataBytes: 21 * MIB, ruleBytes: 0, extraEntries: 4 })).toEqual({ ok: false, reason: "metadata" });
  });
  it("rejects managed bytes above 768 MiB including metadata peak copies", () => {
    expect(checkBudget({ attachmentByteSizes: [LIMITS.managedBytes], metadataBytes: 1, ruleBytes: 0, extraEntries: 4 })).toEqual({ ok: false, reason: "managed-bytes" });
  });
  it("rejects entry counts above the managed limit", () => {
    const sizes = new Array(8001).fill(1);
    expect(checkBudget({ attachmentByteSizes: sizes, metadataBytes: 1, ruleBytes: 0, extraEntries: 0 })).toEqual({ ok: false, reason: "entries" });
  });
});
