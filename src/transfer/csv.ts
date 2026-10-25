import { CATEGORIES, subcategoriesFor, subcategoryLabel, STATUS_LABELS } from "../domain/documents";
import { type RecordEntry } from "../domain/schema";

const FORMULA_LEAD = /^[\s]*[=+\-@\t\r]/;

/** Neutralizes spreadsheet formulas in text cells. Numeric amounts are formatted here and never start with a sign. */
export function escapeCell(value: string): string {
  const neutral = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
}

export function formatPlainBaht(satang: number | null): string {
  if (satang === null) return "";
  const baht = Math.trunc(satang / 100);
  const cents = satang % 100;
  return `${baht}.${String(cents).padStart(2, "0")}`;
}

const HEADER = ["ปีภาษี", "วันที่", "หมวด", "ชื่อรายการ", "ผู้ออกเอกสาร", "สถานะ", "ยอดหลักฐาน (บาท)", "ยอดที่เลือกใช้สิทธิ (บาท)", "หัก ณ ที่จ่าย (บาท)", "หมายเหตุ", "รหัสประเภทเอกสารย่อย", "ประเภทเอกสารย่อย"];

/** UTF-8 CSV with BOM for Thai text in spreadsheet apps. This is a working report, not a filing format. */
export function recordsToCsv(records: readonly RecordEntry[], taxYear: number): string {
  const rows = records
    .filter((r) => r.taxYear === taxYear && r.trashedAt === null)
    .map((r) => [
      String(r.taxYear),
      r.date,
      CATEGORIES.find((c) => c.id === r.category)?.label ?? "ไม่ทราบหมวด",
      r.title,
      r.issuer,
      STATUS_LABELS[r.status],
      formatPlainBaht(r.evidenceAmountSatang),
      formatPlainBaht(r.claimedAmountSatang),
      formatPlainBaht(r.withheldAmountSatang),
      r.notes,
      r.subcategory ?? "",
      subcategoriesFor(r.category).length > 0 ? subcategoryLabel(r.subcategory) : "",
    ]);
  const lines = [HEADER, ...rows].map((cells) => cells.map(escapeCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
