import { isSupportedTaxYear, isValidIsoDate } from "./years";
import { MAX_SAFE_SATANG } from "./money";

export const CATEGORIES = [
  { id: "income_salary", group: "income", label: "เงินเดือน/โบนัส" },
  { id: "income_investment", group: "income", label: "รายได้จากการลงทุน (ดอกเบี้ย/เงินปันผล)" },
  { id: "income_other", group: "income", label: "รายได้อื่น (เก็บหลักฐานเท่านั้น)" },
  { id: "withholding_50bis", group: "withholding", label: "หนังสือรับรองภาษีหัก ณ ที่จ่าย 50 ทวิ" },
  { id: "withholding_investment", group: "withholding", label: "หนังสือรับรองภาษีหัก ณ ที่จ่ายจากการลงทุน" },
  { id: "deduction_personal", group: "deduction", label: "ค่าลดหย่อนส่วนบุคคล/ครอบครัว" },
  { id: "deduction_insurance", group: "deduction", label: "เบี้ยประกัน" },
  { id: "deduction_retirement", group: "deduction", label: "กองทุนและเงินออมเพื่อเกษียณ" },
  { id: "deduction_social_security", group: "deduction", label: "เงินสมทบประกันสังคม" },
  { id: "deduction_mortgage_interest", group: "deduction", label: "ดอกเบี้ยเงินกู้ที่อยู่อาศัย" },
  { id: "deduction_other", group: "deduction", label: "ค่าลดหย่อนอื่น/มาตรการเฉพาะปี" },
  { id: "donation_general", group: "donation", label: "เงินบริจาคทั่วไป" },
  { id: "donation_conditional", group: "donation", label: "เงินบริจาคกลุ่มมีเงื่อนไข" },
  { id: "donation_edonation", group: "donation", label: "หลักฐาน e-Donation" },
  { id: "other", group: "other", label: "อื่น ๆ / รอจำแนก" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

/** Classification only: a label does not establish eligibility in any tax year. */
export const SUBCATEGORIES = [
  { id: "fund_rmf", parent: "deduction_retirement", label: "RMF" },
  { id: "fund_thai_esg", parent: "deduction_retirement", label: "ThaiESG" },
  { id: "fund_thai_esgx", parent: "deduction_retirement", label: "ThaiESGX" },
  { id: "fund_ssf", parent: "deduction_retirement", label: "SSF" },
  { id: "fund_ltf", parent: "deduction_retirement", label: "LTF" },
  { id: "fund_provident", parent: "deduction_retirement", label: "กองทุนสำรองเลี้ยงชีพ (PVD)" },
  { id: "fund_gpf", parent: "deduction_retirement", label: "กบข." },
  { id: "fund_nsf", parent: "deduction_retirement", label: "กอช." },
  { id: "fund_other", parent: "deduction_retirement", label: "กองทุนอื่น ๆ" },
  { id: "insurance_life", parent: "deduction_insurance", label: "ประกันชีวิต" },
  { id: "insurance_annuity", parent: "deduction_insurance", label: "ประกันบำนาญ" },
  { id: "insurance_health", parent: "deduction_insurance", label: "ประกันสุขภาพ" },
  { id: "insurance_other", parent: "deduction_insurance", label: "ประกันอื่น ๆ" },
] as const;
/** Frozen on-disk vocabulary of schemas 2 and 3, including their original contribution limit. */
export const LEGACY_SUBCATEGORY_IDS = [
  "fund_rmf", "fund_thai_esg", "fund_other",
  "insurance_life", "insurance_annuity", "insurance_health", "insurance_other",
] as const;

export type SubcategoryId = (typeof SUBCATEGORIES)[number]["id"];
export const SUBCATEGORY_IDS = SUBCATEGORIES.map((s) => s.id);
export const subcategoriesFor = (category: string) => SUBCATEGORIES.filter((s) => s.parent === category);
export function subcategoryLabel(value: SubcategoryId | null): string {
  return SUBCATEGORIES.find((s) => s.id === value)?.label ?? "รอจัดประเภท";
}
export function isSubcategoryApplicable(category: string, value: string | null): boolean {
  return value === null || SUBCATEGORIES.some((s) => s.id === value && s.parent === category);
}

/** null scope = all categories; absent subtype = whole parent; null subtype = unclassified. */
export type DocumentScope = { category: CategoryId; subcategory?: SubcategoryId | null } | null;

export function matchesDocumentScope(record: { category: string; subcategory: SubcategoryId | null }, scope: DocumentScope): boolean {
  return scope === null || (record.category === scope.category && (scope.subcategory === undefined || record.subcategory === scope.subcategory));
}

export function documentScopeKey(scope: DocumentScope): string {
  return scope === null ? "all" : `${scope.category}/${scope.subcategory === undefined ? "all" : scope.subcategory ?? "unclassified"}`;
}

export function documentScopeLabel(scope: DocumentScope): string {
  return scope === null ? "ทุกหมวด" : scope.subcategory === undefined ? categoryLabel(scope.category) : `${categoryLabel(scope.category)} / ${subcategoryLabel(scope.subcategory)}`;
}

export const REVIEW_STATUSES = ["waiting-document", "waiting-review", "reviewed", "excluded"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  "waiting-document": "รอเอกสาร",
  "waiting-review": "รอตรวจทาน",
  reviewed: "ตรวจทานแล้ว (ตามข้อมูลที่บันทึก)",
  excluded: "ไม่นับในสรุป",
};

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "ไม่ทราบหมวด";
}

/** Draft fields as entered in the form. Amounts are already parsed satang or null (unknown). */
export interface RecordDraft {
  taxYear: number;
  category: string;
  subcategory: SubcategoryId | null;
  date: string;
  title: string;
  issuer: string;
  notes: string;
  evidenceAmountSatang: number | null;
  claimedAmountSatang: number | null;
  withheldAmountSatang: number | null;
  status: ReviewStatus;
  attachmentIds: string[];
}

export type DraftErrors = Partial<Record<keyof RecordDraft | "title", string>>;

/** Pure validation for a record draft. Returns field errors in Thai; empty object means valid. */
export function validateDraft(draft: RecordDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!isSupportedTaxYear(draft.taxYear)) errors.taxYear = "ปีภาษีไม่ถูกต้อง";
  if (!CATEGORY_IDS.includes(draft.category)) errors.category = "กรุณาเลือกหมวด";
  if (!isSubcategoryApplicable(draft.category, draft.subcategory)) errors.subcategory = "ประเภทเอกสารย่อยไม่ตรงกับหมวด";
  if (!isValidIsoDate(draft.date)) errors.date = "วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเป็นวันที่จริง";
  if (draft.title.trim() === "") errors.title = "กรุณาระบุชื่อรายการ";
  if (draft.title.length > 200) errors.title = "ชื่อรายการยาวเกิน 200 ตัวอักษร";
  if (draft.notes.length > 2000) errors.notes = "หมายเหตุยาวเกิน 2000 ตัวอักษร";
  for (const key of ["evidenceAmountSatang", "claimedAmountSatang", "withheldAmountSatang"] as const) {
    const value = draft[key];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_SATANG)) {
      errors[key] = "จำนวนเงินไม่ถูกต้อง";
    }
  }
  if (!REVIEW_STATUSES.includes(draft.status)) errors.status = "สถานะไม่ถูกต้อง";
  return errors;
}

/** Meaningful edits return a record to waiting-review. Status-only changes keep their chosen state. */
export function invalidatesReview(prev: { category: string; subcategory: SubcategoryId | null; taxYear: number; claimedAmountSatang: number | null; evidenceAmountSatang: number | null; attachmentIds: string[]; date: string; title: string; withheldAmountSatang: number | null }, next: RecordDraft): boolean {
  return (
    prev.category !== next.category ||
    prev.subcategory !== next.subcategory ||
    prev.taxYear !== next.taxYear ||
    prev.claimedAmountSatang !== next.claimedAmountSatang ||
    prev.evidenceAmountSatang !== next.evidenceAmountSatang ||
    prev.withheldAmountSatang !== next.withheldAmountSatang ||
    prev.date !== next.date ||
    prev.title !== next.title ||
    prev.attachmentIds.length !== next.attachmentIds.length ||
    prev.attachmentIds.some((id, i) => id !== next.attachmentIds[i])
  );
}
