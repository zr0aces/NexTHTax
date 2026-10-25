// Whole-workspace envelope. Every admitted state must also fit a STORE-mode ZIP backup inside its limits.
export const MIB = 1024 * 1024;
export const LIMITS = {
  managedBytes: 768 * MIB,
  managedEntries: 8000,
  attachmentBytes: 100 * MIB,
  metadataBytes: 20 * MIB,
  zipEntryOverhead: 1024,
  zipReserve: 1 * MIB,
  zipBudgetBytes: 1024 * MIB,
  zipEntries: 10000,
  /** Metadata copies peak during a write: candidate + previous valid + pending journal. */
  metadataPeakCopies: 3,
} as const;

export interface BudgetInput {
  attachmentByteSizes: readonly number[];
  metadataBytes: number;
  ruleBytes: number;
  /** Count of non-attachment files: data.json, rule snapshots, recovery files. */
  extraEntries: number;
}

export type BudgetResult = { ok: true } | { ok: false; reason: "metadata" | "managed-bytes" | "entries" | "zip-budget" | "zip-entries" };

export function checkBudget(input: BudgetInput): BudgetResult {
  if (input.metadataBytes > LIMITS.metadataBytes) return { ok: false, reason: "metadata" };
  const attachments = input.attachmentByteSizes.reduce((a, b) => a + b, 0);
  const managed = attachments + input.metadataBytes * LIMITS.metadataPeakCopies + input.ruleBytes;
  const entries = input.attachmentByteSizes.length + input.extraEntries;
  if (managed > LIMITS.managedBytes) return { ok: false, reason: "managed-bytes" };
  if (entries > LIMITS.managedEntries) return { ok: false, reason: "entries" };
  if (entries > LIMITS.zipEntries) return { ok: false, reason: "zip-entries" };
  const zipTotal = managed + entries * LIMITS.zipEntryOverhead + LIMITS.zipReserve;
  if (zipTotal > LIMITS.zipBudgetBytes) return { ok: false, reason: "zip-budget" };
  return { ok: true };
}
