import { useMemo, useState } from "react";
import { CATEGORIES, categoryLabel, STATUS_LABELS, type ReviewStatus, REVIEW_STATUSES } from "../domain/documents";
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
  const [status, setStatus] = useState<ReviewStatus | "">("");
  const [showTrash, setShowTrash] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records
      .filter((r) => (showTrash ? r.trashedAt !== null : r.trashedAt === null))
      .filter((r) => category === "" || r.category === category)
      .filter((r) => status === "" || r.status === status)
      .filter((r) => q === "" || `${r.title} ${r.issuer} ${r.notes}`.toLowerCase().includes(q))
      .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title, "th") : a.date.localeCompare(b.date)));
  }, [records, query, category, status, showTrash]);

  return (
    <section aria-labelledby="docs-title" className="documents">
      <h2 id="docs-title">{showTrash ? "ถังขยะ" : "รายการเอกสาร"}</h2>
      <div className="toolbar">
        <label>
          ค้นหา
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          หมวด
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">ทุกหมวด</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
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
        <button type="button" onClick={() => setShowTrash((v) => !v)}>{showTrash ? "กลับไปรายการ" : "ดูถังขยะ"}</button>
        {!showTrash && <button type="button" onClick={onAdd}>เพิ่มรายการ</button>}
      </div>
      {visible.length === 0 ? (
        <p>ไม่มีรายการ</p>
      ) : (
        <ul className="record-list">
          {visible.map((r) => (
            <li key={r.id} aria-current={r.id === selectedId ? "true" : undefined}>
              <button type="button" className="link" onClick={() => onSelect(r.id)}>
                {r.date} · {r.title} · {categoryLabel(r.category)} · {STATUS_LABELS[r.status]}
                {r.claimedAmountSatang !== null ? ` · ใช้สิทธิ ${formatSatang(r.claimedAmountSatang)} บาท` : ""}
              </button>
              {showTrash ? (
                <>
                  <button type="button" onClick={() => onRestore(r.id)}>กู้คืนจากถังขยะ</button>
                  <button type="button" onClick={() => onPurge(r.id)}>ลบถาวร</button>
                </>
              ) : (
                <button type="button" onClick={() => onTrash(r.id)}>ย้ายไปถังขยะ</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
