import { useMemo, useState } from "react";
import { subcategoriesFor, subcategoryLabel, categoryLabel, STATUS_LABELS, type ReviewStatus, REVIEW_STATUSES, matchesDocumentScope, documentScopeLabel, type DocumentScope } from "../domain/documents";
import { formatSatang } from "../domain/money";
import type { RecordEntry } from "../domain/schema";

interface Props {
  records: RecordEntry[];
  scope?: DocumentScope;
  canEdit?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

/** Records for one tax year with search, category/status filters and a trash view. */
export function DocumentList({ records, selectedId, onSelect, onAdd, onTrash, onRestore, onPurge, scope = null, canEdit = true }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const [showTrash, setShowTrash] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => (showTrash ? r.trashedAt !== null : r.trashedAt === null))
      .filter((r) => matchesDocumentScope(r, scope))
      .filter((r) => status === "" || r.status === status)
      .filter((r) => q === "" || `${r.title} ${r.issuer} ${r.notes} ${categoryLabel(r.category)} ${subcategoriesFor(r.category).length ? subcategoryLabel(r.subcategory) : ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, "th") : a.date.localeCompare(b.date)));
  }, [records, query, scope, status, showTrash]);

  return (
    <section id="document-list" aria-labelledby="docs-title" className="documents card">
      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 id="docs-title" tabIndex={-1} style={{ margin: 0 }}>{showTrash ? "ถังขยะ" : `รายการเอกสาร (${records.filter(r => r.trashedAt === null && matchesDocumentScope(r, scope)).length})`}</h2>
        <div className="actions" style={{ margin: 0 }}>
          <button type="button" onClick={() => setShowTrash((v) => !v)}>{showTrash ? "กลับไปรายการ" : "ดูถังขยะ"}</button>
          {!showTrash && <button type="button" className="btn-primary" disabled={!canEdit} onClick={onAdd}>{scope === null ? "+ เพิ่มรายการ" : "เพิ่มเอกสารในหมวดนี้"}</button>}
        </div>
      </div>

      <p className="muted">{documentScopeLabel(scope)}</p>
      <div className="toolbar">
        <label>
          ค้นหา
          <input type="search" role="searchbox" placeholder="ค้นหาชื่อ, ผู้ออก, หมวด..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          สถานะ
          <select value={status} onChange={(e) => setStatus(e.target.value as ReviewStatus | "")}>
            <option value="">ทุกสถานะ</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--ink-muted)" }}>
          <p>ไม่มีรายการ</p>
          {!showTrash && scope === null && (
            <button type="button" className="btn-primary" disabled={!canEdit} onClick={onAdd}>เพิ่มรายการแรกสำหรับปีนี้</button>
          )}
        </div>
      ) : (
        <ul className="record-list">
          {visible.map((r) => (
            <li key={r.id} className="record-item" aria-current={r.id === selectedId ? "true" : undefined}>
              <button type="button" className="link" onClick={() => onSelect(r.id)} style={{ flex: "1 1 auto" }}>
                {r.date} · {r.title} · {categoryLabel(r.category)}{subcategoriesFor(r.category).length > 0 ? ` / ${subcategoryLabel(r.subcategory)}` : ""} · {STATUS_LABELS[r.status]}
                {r.evidenceAmountSatang !== null ? ` · หลักฐาน ${formatSatang(r.evidenceAmountSatang)} บาท` : " · ยังไม่ระบุยอด"}
                {r.claimedAmountSatang !== null ? ` · เลือกใช้สิทธิ ${formatSatang(r.claimedAmountSatang)} บาท (ยังไม่รับรอง)` : ""}
              </button>
              {showTrash ? (
                <div className="actions" style={{ margin: 0 }}>
                  <button type="button" disabled={!canEdit} onClick={() => onRestore(r.id)}>กู้คืนจากถังขยะ</button>
                  <button type="button" className="btn-danger" disabled={!canEdit} onClick={() => onPurge(r.id)}>ลบถาวร</button>
                </div>
              ) : (
                <button type="button" disabled={!canEdit} onClick={() => onTrash(r.id)} title="ย้ายไปถังขยะ">ย้ายไปถังขยะ</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
