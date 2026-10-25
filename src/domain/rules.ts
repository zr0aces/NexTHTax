import { z } from "zod";
import { CATEGORY_IDS } from "./documents";
import { sha256Schema } from "./schema";
import { isSupportedTaxYear, isValidIsoDate } from "./years";

// Official hosts reviewed by the maintainer. Imported citations never widen this list.
export const OFFICIAL_HOSTS: readonly string[] = ["www.rd.go.th", "rd.go.th"];

const VERSION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const coverageStatusSchema = z.enum(["verified", "partial", "unavailable"]);

export const ruleBundleSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    taxYear: z.number().int().refine(isSupportedTaxYear, "ปีภาษีไม่ถูกต้อง"),
    version: z.string().regex(VERSION_TOKEN, "version ไม่ถูกต้อง"),
    reviewedAt: z.string().refine(isValidIsoDate, "วันที่ตรวจไม่ถูกต้อง"),
    officialReviewed: z.boolean(),
    sources: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(200),
          url: z.string().max(2048),
          publication: z.string().max(200),
          effectiveFrom: z.string().refine(isValidIsoDate, "วันที่ไม่ถูกต้อง"),
        }),
      )
      .max(50),
    coverage: z.record(z.string(), z.strictObject({ status: coverageStatusSchema, reason: z.string().max(500) })),
    notes: z.string().max(2000),
  })
  .superRefine((b, ctx) => {
    for (const id of CATEGORY_IDS) {
      if (!b.coverage[id]) ctx.addIssue({ code: "custom", message: `ไม่มี coverage ของหมวด ${id}`, path: ["coverage"] });
    }
    for (const key of Object.keys(b.coverage)) {
      if (!CATEGORY_IDS.includes(key)) ctx.addIssue({ code: "custom", message: `หมวดไม่รู้จัก ${key}`, path: ["coverage", key] });
    }
  });

export type RuleBundle = z.infer<typeof ruleBundleSchema>;

export const catalogSchema = z.strictObject({
  schemaVersion: z.literal(1),
  bundles: z
    .array(
      z.strictObject({
        taxYear: z.number().int(),
        version: z.string().regex(VERSION_TOKEN),
        path: z.string(),
        sha256: sha256Schema,
        reviewedAt: z.string(),
        officialReviewed: z.boolean(),
      }),
    )
    .max(200),
});

export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogEntry = Catalog["bundles"][number];

/** Canonical relative path for a snapshot. Anything else is rejected so the path cannot escape rules/. */
export function bundlePath(taxYear: number, version: string): string {
  if (!isSupportedTaxYear(taxYear) || !VERSION_TOKEN.test(version)) throw new Error("invalid bundle identity");
  return `rules/${taxYear}/${version}.json`;
}

/** Officially reviewed label only when version and content digest match the trusted shipped catalog. */
export function isTrustedMatch(catalog: Catalog | null, bundle: { taxYear: number; version: string }, digest: string): boolean {
  if (!catalog) return false;
  return catalog.bundles.some(
    (e) => e.taxYear === bundle.taxYear && e.version === bundle.version && e.sha256 === digest && e.officialReviewed,
  );
}

/** Returns an https href only for exact official hosts without credentials. Otherwise null (render as plain text). */
export function safeOfficialHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  if (!OFFICIAL_HOSTS.includes(url.hostname)) return null;
  return url.toString();
}

/** Coverage lookup. Missing bundle means unavailable; never falls back to another year. */
export function coverageFor(bundle: RuleBundle | null, categoryId: string): "verified" | "partial" | "unavailable" {
  if (!bundle) return "unavailable";
  return bundle.coverage[categoryId]?.status ?? "unavailable";
}
