// Money is stored as non-negative safe integer satang. Intermediate math uses BigInt; floating point is never used for totals.

export const MAX_SAFE_SATANG = Number.MAX_SAFE_INTEGER;

export type ParseResult =
  | { ok: true; satang: number | null }
  | { ok: false; error: "format" | "range" };

/** Blank input means unknown (null), not zero. Accepts "1,234.5" or "1234.50" style baht amounts only. */
export function parseBahtInput(raw: string): ParseResult {
  const text = raw.trim();
  if (text === "") return { ok: true, satang: null };
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(text.replace(/,/g, ""));
  if (!match) return { ok: false, error: "format" };
  const baht = BigInt(match[1] ?? "0");
  const frac = BigInt((match[2] ?? "").padEnd(2, "0"));
  const satang = baht * 100n + frac;
  if (satang > BigInt(MAX_SAFE_SATANG)) return { ok: false, error: "range" };
  return { ok: true, satang: Number(satang) };
}

/** Formats satang as baht with two decimals and thousands separators. Uses BigInt, no float rounding. */
export function formatSatang(satang: number): string {
  const total = BigInt(satang);
  const baht = total / 100n;
  const cents = (total % 100n).toString().padStart(2, "0");
  return `${baht.toLocaleString("en-US")}.${cents}`;
}

export type SumResult = { ok: true; satang: number } | { ok: false; error: "overflow" };

/** Sums non-negative satang values exactly. Returns overflow instead of wrapping or losing precision. */
export function sumSatang(values: readonly number[]): SumResult {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return { ok: false, error: "overflow" };
    total += BigInt(value);
  }
  if (total > BigInt(MAX_SAFE_SATANG)) return { ok: false, error: "overflow" };
  return { ok: true, satang: Number(total) };
}
