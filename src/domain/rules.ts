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
export function coverageFor(bundle: AnyRuleBundle | null, categoryId: string): "verified" | "partial" | "unavailable" {
  if (!bundle) return "unavailable";
  return bundle.coverage[categoryId]?.status ?? "unavailable";
}

// ---- Rule bundle schema 2: typed numeric tables. Schema 1 above stays frozen and coverage-only. ----

export const NUMERIC_COMPONENTS = [
  "progressive_brackets",
  "salary_expense",
  "personal_allowance",
  "social_security",
  "health_insurance",
  "life_insurance",
  "annuity_insurance",
  "retirement_funds",
  "donations",
  "tax_credits",
  "final_tax_income",
  "withholding_settlement",
  "rounding",
] as const;
export type NumericComponent = (typeof NUMERIC_COMPONENTS)[number];

/** Components that must be verified before any numeric output of this slice can be trusted. */
export const SLICE_COMPONENTS: readonly NumericComponent[] = [
  "progressive_brackets",
  "salary_expense",
  "personal_allowance",
  "social_security",
  "health_insurance",
  "rounding",
];

const satangInt = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const percentInt = z.number().int().min(0).max(100);
const isoDay = z.string().refine(isValidIsoDate, "วันที่ไม่ถูกต้อง");

export const ruleBundleV2Schema = z
  .strictObject({
    schemaVersion: z.literal(2),
    taxYear: z.number().int().refine(isSupportedTaxYear, "ปีภาษีไม่ถูกต้อง"),
    version: z.string().regex(VERSION_TOKEN, "version ไม่ถูกต้อง"),
    reviewedAt: isoDay,
    officialReviewed: z.boolean(),
    sources: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z0-9_]{1,32}$/),
          title: z.string().min(1).max(200),
          url: z.string().max(2048),
          publication: z.string().max(200),
          effectiveFrom: isoDay,
          fetchedAt: isoDay,
          quote: z.string().min(1).max(300),
        }),
      )
      .max(50),
    coverage: z.record(z.string(), z.strictObject({ status: coverageStatusSchema, reason: z.string().max(500) })),
    calculation: z.strictObject({
      engineVersion: z.literal(1),
      components: z.record(
        z.enum(NUMERIC_COMPONENTS),
        z.strictObject({ status: coverageStatusSchema, sourceIds: z.array(z.string().max(32)).max(10), reason: z.string().max(500) }),
      ),
      brackets: z.array(z.strictObject({ upToSatang: satangInt.min(1).nullable(), ratePercent: percentInt })).min(1).max(20),
      personalAllowanceSatang: satangInt,
      salaryExpenseRatePercent: percentInt,
      salaryExpenseCapSatang: satangInt,
      socialSecurityRatePercent: percentInt,
      socialSecurityCapSatang: satangInt,
      healthInsuranceCapSatang: satangInt,
      combinedLifeHealthCapSatang: satangInt,
      roundingVerified: z.boolean(),
    }),
    notes: z.string().max(2000),
  })
  .superRefine((b, ctx) => {
    for (const id of CATEGORY_IDS) {
      if (!b.coverage[id]) ctx.addIssue({ code: "custom", message: `ไม่มี coverage ของหมวด ${id}`, path: ["coverage"] });
    }
    for (const key of Object.keys(b.coverage)) {
      if (!CATEGORY_IDS.includes(key)) ctx.addIssue({ code: "custom", message: `หมวดไม่รู้จัก ${key}`, path: ["coverage", key] });
    }
    const sourceIds = new Set<string>();
    for (const s of b.sources) {
      if (sourceIds.has(s.id)) ctx.addIssue({ code: "custom", message: `source ID ซ้ำ ${s.id}`, path: ["sources"] });
      sourceIds.add(s.id);
      if (!isOfficialHttps(s.url)) ctx.addIssue({ code: "custom", message: "source ต้องเป็น https ของโฮสต์ทางการ", path: ["sources"] });
    }
    for (const [name, c] of Object.entries(b.calculation.components)) {
      for (const id of c.sourceIds) {
        if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", message: `${name} อ้าง source ที่ไม่มี ${id}`, path: ["calculation", "components", name] });
      }
    }
    const brackets = b.calculation.brackets;
    brackets.forEach((br, i) => {
      const last = i === brackets.length - 1;
      if (last !== (br.upToSatang === null)) ctx.addIssue({ code: "custom", message: "ขั้นภาษีต้องมีขอบบนเฉพาะขั้นสุดท้ายที่เปิด", path: ["calculation", "brackets", i] });
      const prev = brackets[i - 1]?.upToSatang;
      if (i > 0 && prev != null && br.upToSatang != null && br.upToSatang <= prev) {
        ctx.addIssue({ code: "custom", message: "ขอบบนของขั้นภาษีต้องเพิ่มขึ้น", path: ["calculation", "brackets", i] });
      }
    });
    // Trust invariant: an official-reviewed bundle must have verified rounding and every slice component.
    if (b.officialReviewed) {
      if (!b.calculation.roundingVerified) ctx.addIssue({ code: "custom", message: "officialReviewed ต้องมีการปัดเศษที่ยืนยันแล้ว", path: ["calculation"] });
      for (const name of SLICE_COMPONENTS) {
        if (b.calculation.components[name]?.status !== "verified") {
          ctx.addIssue({ code: "custom", message: `officialReviewed ต้องยืนยัน ${name} แล้ว`, path: ["calculation", "components", name] });
        }
      }
    }
  });

function isOfficialHttps(raw: string): boolean {
  return safeOfficialHref(raw) !== null;
}

export type RuleBundleV2 = z.infer<typeof ruleBundleV2Schema>;
export type AnyRuleBundle = RuleBundle | RuleBundleV2;

/** Version dispatch by exact integer. Unknown versions return null and never fall back to another schema. */
export function parseRuleBundle(json: unknown): AnyRuleBundle | null {
  const version = typeof json === "object" && json !== null && "schemaVersion" in json ? (json as { schemaVersion: unknown }).schemaVersion : null;
  if (version === 1) {
    const r = ruleBundleSchema.safeParse(json);
    return r.success ? r.data : null;
  }
  if (version === 2) {
    const r = ruleBundleV2Schema.safeParse(json);
    return r.success ? r.data : null;
  }
  return null;
}

/** Empty list means numeric output may be trusted for this bundle. Each entry explains one blocker for the UI. */
export function numericBlockers(bundle: AnyRuleBundle | null): string[] {
  if (!bundle) return ["ไม่มีกฎที่ปักไว้สำหรับปีนี้"];
  if (bundle.schemaVersion !== 2) return ["กฎรุ่นนี้เป็นข้อมูลขอบเขตเท่านั้น ไม่มีตารางตัวเลข"];
  const blockers: string[] = [];
  if (!bundle.officialReviewed) blockers.push("กฎยังไม่ผ่านการตรวจกับแหล่งทางการ");
  if (!bundle.calculation.roundingVerified) blockers.push("ยังไม่มีกฎการปัดเศษที่ยืนยันจากแหล่งทางการ");
  for (const name of SLICE_COMPONENTS) {
    const status = bundle.calculation.components[name]?.status ?? "unavailable";
    if (status !== "verified") blockers.push(`องค์ประกอบ ${name} ยังไม่ยืนยัน (${status})`);
  }
  return blockers;
}
