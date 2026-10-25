import { CATEGORIES, subcategoriesFor, type SubcategoryId } from "./documents";
import { type RecordEntry } from "./schema";
import { sumSatang } from "./money";

export type SummaryResult =
  | {
      ok: true;
      /** Evidence totals from documents (not deductions). */
      evidenceTotal: number;
      /** User-selected claim base before any rule. Not an allowable deduction. */
      claimedTotal: number;
      /** Claim base only from records whose status is reviewed. */
      reviewedClaimedTotal: number;
      /** Withholding evidence is shown separately and never added to deductions. */
      withheldTotal: number;
      /** Included records where a deduction/donation claim amount is still unknown. */
      unknownClaimCount: number;
      counts: Record<"waiting-document" | "waiting-review" | "reviewed", number>;
      excludedCount: number;
      trashedCount: number;
    }
  | { ok: false; error: "overflow" };

/** Summary counts live, non-excluded records of one tax year. Trashed and excluded records are not totalled. */
export function summarizeYear(records: readonly RecordEntry[], taxYear: number): SummaryResult {
  const ofYear = records.filter((r) => r.taxYear === taxYear);
  const live = ofYear.filter((r) => r.trashedAt === null && r.status !== "excluded");
  const counts = { "waiting-document": 0, "waiting-review": 0, reviewed: 0 };
  for (const r of live) {
    if (r.status !== "excluded") counts[r.status]++;
  }
  const evidence = sumSatang(live.flatMap((r) => (r.evidenceAmountSatang === null ? [] : [r.evidenceAmountSatang])));
  const claimed = sumSatang(live.flatMap((r) => (r.claimedAmountSatang === null ? [] : [r.claimedAmountSatang])));
  const reviewed = sumSatang(
    live.filter((r) => r.status === "reviewed").flatMap((r) => (r.claimedAmountSatang === null ? [] : [r.claimedAmountSatang])),
  );
  const withheld = sumSatang(live.flatMap((r) => (r.withheldAmountSatang === null ? [] : [r.withheldAmountSatang])));
  if (!evidence.ok || !claimed.ok || !reviewed.ok || !withheld.ok) return { ok: false, error: "overflow" };
  const claimGroups = new Set(["deduction", "donation"]);
  const unknownClaimCount = live.filter((r) => {
    const group = CATEGORIES.find((c) => c.id === r.category)?.group ?? "other";
    return claimGroups.has(group) && r.claimedAmountSatang === null;
  }).length;
  return {
    ok: true,
    evidenceTotal: evidence.satang,
    claimedTotal: claimed.satang,
    reviewedClaimedTotal: reviewed.satang,
    withheldTotal: withheld.satang,
    unknownClaimCount,
    counts,
    excludedCount: ofYear.filter((r) => r.trashedAt === null && r.status === "excluded").length,
    trashedCount: ofYear.filter((r) => r.trashedAt !== null).length,
  };
}

/** Child partitions explain their parent subtotal; they must never be added to it again. */
export function summarizeSubcategories(records: readonly RecordEntry[], taxYear: number) {
  return (["deduction_retirement", "deduction_insurance"] as const).map((parent) => {
    const selected = records.filter((r) => r.category === parent);
    const ids: Array<SubcategoryId | null> = [...subcategoriesFor(parent).map((s) => s.id), null];
    return {
      parent,
      summary: summarizeYear(selected, taxYear),
      children: ids.map((subcategory) => ({
        subcategory,
        summary: summarizeYear(selected.filter((r) => r.subcategory === subcategory), taxYear),
      })),
    };
  });
}
