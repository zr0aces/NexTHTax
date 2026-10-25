import { useMemo, useState } from "react";
import { CATEGORIES, subcategoriesFor, subcategoryLabel, categoryLabel, STATUS_LABELS, type ReviewStatus, REVIEW_STATUSES } from "../domain/documents";
import { formatSatang } from "../domain/money";
import type { RecordEntry } from "../domain/schema";

interface Props {
  records: RecordEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
}

/** Records for one tax year with search, category/status filters and a trash view. */
export function DocumentList({ records, selectedId, onSelect, onAdd, onTrash, onRestore, onPurge }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const [showTrash, setShowTrash] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => (showTrash ? r.trashedAt !== null : r.trashedAt === null))
      .filter((r) => category === "" || r.category === category)
      .filter((r) => subcategory === "" || (subcategory === "unclassified" ? r.subcategory === null : r.subcategory === subcategory))
      .filter((r) => status === "" || r.status === status)
      .filter((r) => q === "" || `${r.title} ${r.issuer} ${r.notes} ${categoryLabel(r.category)} ${subcategoriesFor(r.category).length ? subcategoryLabel(r.subcategory) : ""}`.toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, "th") : a.date.localeCompare(b.date)));
  }, [records, query, category, subcategory, status, showTrash]);

  return (
    <section aria-labelledby="docs-title" className="documents card">
      <div className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 id="docs-title" style={{ margin: 0 }}>{showTrash ? "ถังขยะ" : `รายการเอกสาร (${records.filter(r => r.trashedAt === null).length})`}</h2>
        <div className="actions" style={{ margin: 0 }}>
          <button type="button" onClick={() => setShowTrash((v) => !v)}>{showTrash ? "กลับไปรายการ" : "ดูถังขยะ"}</button>
          {!showTrash && <button type="button" className="btn-primary" onClick={onAdd}>+ เพิ่มรายการ</button>}
        </div>
      </div>

      <div className="toolbar">
        <label>
          ค้นหา
          <input type="search" role="searchbox" placeholder="ค้นหาชื่อ, ผู้ออก, หมวด..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          หมวด
          <select value={category} onChange={(e) => { setCategory(e.target.value); setSubcategory(""); }}>
            <option value="">ทุกหมวด</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        {subcategoriesFor(category).length > 0 && (
          <label>
            ประเภทเอกสารย่อย
            <select value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="">ทุกประเภท</option>
              <option value="unclassified">ยังไม่ระบุประเภท</option>
              {subcategoriesFor(category).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        )}
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
          {!showTrash && (
            <button type="button" className="btn-primary" onClick={onAdd}>เพิ่มรายการแรกสำหรับปีนี้</button>
          )}
        </div>
      ) : (
        <ul className="record-list">
          {visible.map((r) => (
            <li key={r.id} className="record-item" aria-current={r.id === selectedId ? "true" : undefined}>
              <button type="button" className="link" onClick={() => onSelect(r.id)} style={{ flex: "1 1 auto" }}>
                {r.date} · {r.title} · {categoryLabel(r.category)}{subcategoriesFor(r.category).length > 0 ? ` / ${subcategoryLabel(r.subcategory)}` : ""} · {STATUS_LABELS[r.status]}
                {r.claimedAmountSatang !== null ? ` · ใช้สิทธิ ${formatSatang(r.claimedAmountSatang)} บาท` : ""}
              </button>
              {showTrash ? (
                <div className="actions" style={{ margin: 0 }}>
                  <button type="button" onClick={() => onRestore(r.id)}>กู้คืนจากถังขยะ</button>
                  <button type="button" className="btn-danger" onClick={() => onPurge(r.id)}>ลบถาวร</button>
                </div>
              ) : (
                <button type="button" onClick={() => onTrash(r.id)} title="ย้ายไปถังขยะ">ย้ายไปถังขยะ</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
