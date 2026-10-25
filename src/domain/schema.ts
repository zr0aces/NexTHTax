import { z } from "zod";
import { CATEGORY_IDS, REVIEW_STATUSES, SUBCATEGORY_IDS, LEGACY_SUBCATEGORY_IDS, isSubcategoryApplicable, type SubcategoryId } from "./documents";
import { taxInputsSchema, taxScenarioSchema, taxPlanSchema, legacyTaxInputsSchema, legacyTaxScenarioSchema } from "./taxInputs";
import { MAX_SAFE_SATANG } from "./money";
import { isSupportedTaxYear, isValidIsoDate } from "./years";

export const SCHEMA_VERSION = 4;
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const MAX_METADATA_BYTES = 20 * 1024 * 1024;

const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
// Control characters are rejected so names cannot spoof layout or hide content.
// eslint-disable-next-line no-control-regex
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]*$/;

export const uuidSchema = z.string().regex(LOWER_UUID, "UUID ต้องเป็นตัวพิมพ์เล็ก");
export const sha256Schema = z.string().regex(SHA256_HEX, "SHA-256 ไม่ถูกต้อง");
export const isoDateSchema = z.string().refine(isValidIsoDate, "วันที่ไม่ถูกต้อง");
const taxYearSchema = z.number().int().refine(isSupportedTaxYear, "ปีภาษีไม่ถูกต้อง");
const satangSchema = z.number().int().min(0).max(MAX_SAFE_SATANG);
const safeText = (max: number) => z.string().max(max).regex(SAFE_TEXT, "มีอักขระควบคุม");

export const MEDIA_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const attachmentSchema = z
  .strictObject({
    id: uuidSchema,
    displayName: safeText(200).min(1),
    path: z.string(),
    mediaType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
    byteSize: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
    sha256: sha256Schema,
  })
  .refine((a) => a.path === `attachments/${a.id}.${MEDIA_EXTENSIONS[a.mediaType]}`, {
    message: "path ของแนบไม่ตรง namespace ที่แอปสร้าง",
    path: ["path"],
  });

export const legacyRecordSchema = z
  .strictObject({
    id: uuidSchema,
    taxYear: taxYearSchema,
    category: z.enum(CATEGORY_IDS as [string, ...string[]]),
    date: isoDateSchema,
    title: safeText(200).min(1),
    issuer: safeText(200),
    notes: safeText(2000),
    evidenceAmountSatang: satangSchema.nullable(),
    claimedAmountSatang: satangSchema.nullable(),
    withheldAmountSatang: satangSchema.nullable(),
    status: z.enum(REVIEW_STATUSES),
    attachmentIds: z.array(uuidSchema).max(200),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    trashedAt: z.iso.datetime().nullable(),
  });

export const recordSchema = legacyRecordSchema.extend({
  subcategory: z.enum(SUBCATEGORY_IDS).nullable(),
}).refine((r) => isSubcategoryApplicable(r.category, r.subcategory), {
  message: "ประเภทเอกสารย่อยไม่ตรงกับหมวด", path: ["subcategory"],
});

// Older readers must never accept the expanded fund vocabulary under an old version number.
const v2RecordSchema = legacyRecordSchema.extend({
  subcategory: z.enum(LEGACY_SUBCATEGORY_IDS).nullable(),
}).refine((r) => isSubcategoryApplicable(r.category, r.subcategory), {
  message: "ประเภทเอกสารย่อยไม่ตรงกับหมวด", path: ["subcategory"],
});

export const legacyYearSchema = z.strictObject({
  taxYear: taxYearSchema,
  rulesVersion: z.string().max(64).nullable(),
  rulesDigest: sha256Schema.nullable(),
  eligibility: z.record(z.string().max(64), z.enum(["yes", "no", "unknown"])),
});

export const v2YearSchema = legacyYearSchema.extend({
  taxInputs: legacyTaxInputsSchema.nullable(),
  scenarios: z.array(legacyTaxScenarioSchema).max(20),
});
const v3YearSchema = v2YearSchema.extend({ plan: taxPlanSchema.nullable().optional() });
export const yearSchema = v3YearSchema.extend({
  taxInputs: taxInputsSchema.nullable(),
  scenarios: z.array(taxScenarioSchema).max(20),
});

const manifestFields = {
    schemaVersion: z.literal(1),
    workspaceId: uuidSchema,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    taxpayer: z.strictObject({ displayName: safeText(200).min(1) }),
    years: z.record(z.string(), legacyYearSchema),
    records: z.array(legacyRecordSchema).max(20000),
    attachments: z.record(z.string(), attachmentSchema),
};

const legacyRoot = z.strictObject(manifestFields);
function checkReferences(m: z.infer<typeof legacyRoot>, ctx: z.RefinementCtx) {
    const ids = new Set<string>();
    for (const r of m.records) {
      if (ids.has(r.id)) ctx.addIssue({ code: "custom", message: "record ID ซ้ำ", path: ["records"] });
      ids.add(r.id);
      for (const aid of r.attachmentIds) {
        if (!m.attachments[aid]) ctx.addIssue({ code: "custom", message: "record อ้างไฟล์แนบที่ไม่มี", path: ["records"] });
      }
    }
    for (const [key, att] of Object.entries(m.attachments)) {
      if (key !== att.id) ctx.addIssue({ code: "custom", message: "key ของแนบไม่ตรง ID", path: ["attachments", key] });
    }
    for (const [key, year] of Object.entries(m.years)) {
      if (key !== String(year.taxYear)) ctx.addIssue({ code: "custom", message: "key ของปีไม่ตรง", path: ["years", key] });
    }
}

export const legacyManifestSchema = legacyRoot.superRefine(checkReferences);
const v2Root = z.strictObject({
  ...manifestFields,
  schemaVersion: z.literal(2),
  years: z.record(z.string(), v2YearSchema),
  records: z.array(v2RecordSchema).max(20000),
});
const v3Root = v2Root.extend({ schemaVersion: z.literal(3), years: z.record(z.string(), v3YearSchema) });
const currentRoot = v2Root.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  years: z.record(z.string(), yearSchema),
  records: z.array(recordSchema).max(20000),
});
function checkTaxReferences(m: z.infer<typeof currentRoot>, ctx: z.RefinementCtx) {
  checkReferences({ ...m, schemaVersion: 1 }, ctx);
  for (const year of Object.values(m.years)) {
    const seen = new Set<string>();
    const refs = new Set<string>();
    for (const item of [...(year.taxInputs?.incomeItems ?? []), ...(year.taxInputs?.deductions ?? [])]) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", message: "worksheet event ID ซ้ำ" });
      seen.add(item.id);
      for (const id of item.sourceRecordIds) {
        const record = m.records.find((r) => r.id === id);
        if (!record || record.taxYear !== year.taxYear || refs.has(id)) ctx.addIssue({ code: "custom", message: "worksheet อ้างรายการผิดปี/ไม่มี/ซ้ำ" });
        refs.add(id);
      }
      if ("category" in item && !isSubcategoryApplicable(item.category, item.subcategory)) ctx.addIssue({ code: "custom", message: "ประเภท worksheet ไม่ตรงหมวด" });
    }
    const scenarioIds = year.scenarios.map((s) => s.id);
    if (new Set(scenarioIds).size !== scenarioIds.length) ctx.addIssue({ code: "custom", message: "scenario ID ซ้ำ" });
  }
}
function checkCurrentReferences(m: z.infer<typeof currentRoot>, ctx: z.RefinementCtx) {
  checkTaxReferences(m, ctx);
  for (const year of Object.values(m.years)) {
    if (!year.plan) continue;
    const scenario = year.scenarios.find((s) => s.id === year.plan!.scenarioId);
    if (!scenario || scenario.contributions.length !== 1 || scenario.contributions[0]?.subcategory !== "insurance_health") {
      ctx.addIssue({ code: "custom", message: "แผนต้องอ้างทางเลือกประกันสุขภาพหนึ่งรายการในปีเดียวกัน" });
    }
    if (year.plan.evidenceRecordId !== null && !m.records.some((r) => r.id === year.plan!.evidenceRecordId && r.taxYear === year.taxYear)) {
      ctx.addIssue({ code: "custom", message: "หลักฐานแผนไม่มีหรืออยู่คนละปี" });
    }
  }
}
export const v2ManifestSchema = v2Root.superRefine((m, ctx) => checkTaxReferences({ ...m, schemaVersion: SCHEMA_VERSION }, ctx));
export const v3ManifestSchema = v3Root.superRefine((m, ctx) => checkCurrentReferences({ ...m, schemaVersion: SCHEMA_VERSION }, ctx));
export const manifestSchema = currentRoot.superRefine(checkCurrentReferences);

export function canStoreSubcategory(version: StoredManifest["schemaVersion"], subcategory: SubcategoryId | null): boolean {
  return subcategory === null || version === 4 || (version !== 1 && LEGACY_SUBCATEGORY_IDS.some((id) => id === subcategory));
}

export type V3Manifest = z.infer<typeof v3ManifestSchema>;
export type V2Manifest = z.infer<typeof v2ManifestSchema>;
export type PriorManifest = LegacyManifest | V2Manifest | V3Manifest;
export type LegacyManifest = z.infer<typeof legacyManifestSchema>;
export type StoredManifest = PriorManifest | Manifest;

export type Attachment = z.infer<typeof attachmentSchema>;
export type RecordEntry = z.infer<typeof recordSchema>;
export type YearEntry = z.infer<typeof yearSchema>;
export type Manifest = z.infer<typeof manifestSchema>;

/** Reads schemaVersion before full validation so newer files are reported as newer, not corrupt. */
export function detectSchemaVersion(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !("schemaVersion" in value)) return null;
  const v = (value as { schemaVersion: unknown }).schemaVersion;
  return typeof v === "number" ? v : null;
}
