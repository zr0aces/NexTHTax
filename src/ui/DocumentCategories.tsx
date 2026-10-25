import { useMemo } from "react";
import { documentScopeKey, documentScopeLabel, subcategoryLabel, type DocumentScope } from "../domain/documents";
import { formatSatang } from "../domain/money";
import type { RecordEntry } from "../domain/schema";
import { summarizeDocumentCategories, type DocumentEvidenceSummary } from "../domain/summary";

interface Props {
  records: RecordEntry[];
  taxYear: number;
  scope: DocumentScope;
  onSelect: (scope: DocumentScope) => void;
  disabled?: boolean;
}

function EvidenceMetrics({ summary, id }: { summary: DocumentEvidenceSummary; id: string }) {
  const amount = summary.documentCount === 0 ? "ยังไม่มีเอกสาร"
    : summary.documentCount === summary.excludedCount ? "ไม่มีรายการที่นับในยอด"
    : !summary.evidence.ok ? "ยอดเกินช่วงที่รวมได้อย่างแม่นยำ"
    : summary.knownEvidenceCount === 0 ? "ยังไม่ระบุยอด"
    : `ยอดที่ระบุ ${formatSatang(summary.evidence.satang)} บาท`;
  return <span id={id} className="category-metrics">
    <span>{summary.documentCount} เอกสาร · {amount}</span>
    <span>รอเอกสาร {summary.waitingDocumentCount} · รอตรวจ {summary.waitingReviewCount}</span>
    {summary.unknownEvidenceCount > 0 && <span>ยังไม่ทราบยอด {summary.unknownEvidenceCount} รายการ</span>}
    {summary.excludedCount > 0 && <span>ไม่นับในยอด {summary.excludedCount} รายการ</span>}
  </span>;
}

/** Category-first navigation only. Selecting a folder tab never writes a document. */
export function DocumentCategories({ records, taxYear, scope, onSelect, disabled = false }: Props) {
  const categories = useMemo(() => summarizeDocumentCategories(records, taxYear), [records, taxYear]);
  const choice = (next: Exclude<DocumentScope, null>, label: string, summary: DocumentEvidenceSummary) => {
    const key = documentScopeKey(next), metricsId = `category-${key}`;
    return <button key={key} type="button" className="category-choice" disabled={disabled}
      aria-label={`เลือก${next.subcategory === undefined ? "หมวด" : "ประเภท"} ${documentScopeLabel(next)}`}
      aria-describedby={metricsId} aria-controls="document-list" aria-pressed={documentScopeKey(scope) === key}
      onClick={() => onSelect(next)}>
      <strong>{label}</strong><EvidenceMetrics id={metricsId} summary={summary} />
    </button>;
  };
  const card = (category: typeof categories[number]) => <article key={category.id} aria-label={category.label} className={`category-card ${category.children.length > 0 ? "category-card--with-types" : ""}`}>
    {choice({ category: category.id }, category.label, category.summary)}
    {category.children.length > 0 && <div className="category-types" aria-label={`ประเภท${category.label}`}>
      {category.children.map((child) => choice({ category: category.id, subcategory: child.subcategory }, subcategoryLabel(child.subcategory), child.summary))}
    </div>}
  </article>;
  return <section className="category-browser" aria-labelledby="categories-title">
    <div className="category-browser-header">
      <div><h2 id="categories-title">เลือกหมวดเอกสาร ปี {taxYear}</h2><p>เลือกหมวดเพื่อดูรายการ แล้วเพิ่มเอกสารหรือบันทึกรายการที่รอรับได้ทันที</p></div>
      <button type="button" disabled={disabled} aria-pressed={scope === null} aria-controls="document-list" onClick={() => onSelect(null)}>แสดงทุกหมวด</button>
    </div>
    <p className="muted">ยอดตามหลักฐานที่บันทึก ไม่ใช่ยอดลดหย่อนที่รับรองแล้ว สิทธิขึ้นกับปีและเงื่อนไข ยอดและงานค้างไม่นับรายการในถังขยะหรือรายการที่เลือกไม่รวมในสรุป</p>
    <h3>กองทุนและประกัน</h3>
    <div className="category-grid category-grid--types">{categories.filter((c) => c.id === "deduction_retirement" || c.id === "deduction_insurance").map(card)}</div>
    <h3>ค่าลดหย่อนและเงินบริจาคอื่น</h3>
    <div className="category-grid">{categories.filter((c) => (c.group === "deduction" || c.group === "donation") && c.children.length === 0).map(card)}</div>
    <h3>รายได้ ภาษีหัก ณ ที่จ่าย และหลักฐานประกอบ</h3>
    <div className="category-grid">{categories.filter((c) => c.group !== "deduction" && c.group !== "donation").map(card)}</div>
    <p role="status" className="category-selection">กำลังดู: {documentScopeLabel(scope)}</p>
  </section>;
}
