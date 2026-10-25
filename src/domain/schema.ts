import { z } from "zod";
import { CATEGORY_IDS, REVIEW_STATUSES } from "./documents";
import { MAX_SAFE_SATANG } from "./money";
import { isSupportedTaxYear, isValidIsoDate } from "./years";

export const SCHEMA_VERSION = 1;
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

export const recordSchema = z
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

export const yearSchema = z.strictObject({
  taxYear: taxYearSchema,
  rulesVersion: z.string().max(64).nullable(),
  rulesDigest: sha256Schema.nullable(),
  eligibility: z.record(z.string().max(64), z.enum(["yes", "no", "unknown"])),
});

export const manifestSchema = z
  .strictObject({
    schemaVersion: z.literal(SCHEMA_VERSION),
    workspaceId: uuidSchema,
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    taxpayer: z.strictObject({ displayName: safeText(200).min(1) }),
    years: z.record(z.string(), yearSchema),
    records: z.array(recordSchema).max(20000),
    attachments: z.record(z.string(), attachmentSchema),
  })
  .superRefine((m, ctx) => {
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
  });

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
