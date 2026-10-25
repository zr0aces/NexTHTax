import { useEffect, useRef, useState } from "react";
import { CATEGORIES, subcategoriesFor, isSubcategoryApplicable, type SubcategoryId, REVIEW_STATUSES, STATUS_LABELS, type RecordDraft, type ReviewStatus, validateDraft } from "../domain/documents";
import { parseBahtInput } from "../domain/money";
import type { Attachment, RecordEntry } from "../domain/schema";
import type { AddAttachmentResult } from "../storage/workspace";
import { formatPlainBaht } from "../transfer/csv";

export const AUTOSAVE_MS = 500;

interface Props {
  supportsSubcategories?: boolean;
  canStoreSubcategory?: (subcategory: SubcategoryId | null) => boolean;
  onUnsupportedSubcategory?: () => void;
  record: RecordEntry;
  attachments: Attachment[];
  missingNames: string[];
  onSave: (draft: RecordDraft) => Promise<RecordEntry>;
  onUnsavedChange: (dirty: boolean) => void;
  onAddFile: (file: File, displayName: string, allowDuplicate: boolean) => Promise<AddAttachmentResult>;
  onLink: (attachmentId: string) => Promise<void>;
  onUnlink: (attachmentId: string) => Promise<void>;
  onPreview: (attachmentId: string) => void;
}

interface Form {
  taxYear: number;
  category: string;
  subcategory: SubcategoryId | null;
  date: string;
  title: string;
  issuer: string;
  notes: string;
  evidence: string;
  claimed: string;
  withheld: string;
  status: ReviewStatus;
  noAttachmentConfirmed: boolean;
}

function toForm(r: RecordEntry): Form {
  return {
    taxYear: r.taxYear,
    category: r.category,
    subcategory: r.subcategory,
    date: r.date,
    title: r.title,
    issuer: r.issuer,
    notes: r.notes,
    evidence: formatPlainBaht(r.evidenceAmountSatang),
    claimed: formatPlainBaht(r.claimedAmountSatang),
    withheld: formatPlainBaht(r.withheldAmountSatang),
    status: r.status,
    noAttachmentConfirmed: false,
  };
}

type ParsedForm = { ok: true; draft: RecordDraft } | { ok: false; errors: Record<string, string> };

/** Raw form to domain draft. Invalid input stays in the form and never reaches the manifest. */
export function parseForm(f: Form, attachmentIds: string[]): ParsedForm {
  const errors: Record<string, string> = {};
  const amount = (raw: string, key: "evidence" | "claimed" | "withheld"): number | null => {
    const parsed = parseBahtInput(raw);
    if (!parsed.ok) {
      errors[key] = parsed.error === "range" ? "จำนวนเงินเกินช่วงที่ระบบรองรับ" : "รูปแบบจำนวนเงินไม่ถูกต้อง (ตัวเลขไม่เกิน 2 ตำแหน่งทศนิยม)";
      return null;
    }
    return parsed.satang;
  };
  const draft: RecordDraft = {
    taxYear: f.taxYear,
    category: f.category,
    subcategory: f.subcategory,
    date: f.date,
    title: f.title,
    issuer: f.issuer,
    notes: f.notes,
    evidenceAmountSatang: amount(f.evidence, "evidence"),
    claimedAmountSatang: amount(f.claimed, "claimed"),
    withheldAmountSatang: amount(f.withheld, "withheld"),
    status: f.status,
    attachmentIds,
  };
  Object.assign(errors, validateDraft(draft));
  if (f.status === "reviewed" && attachmentIds.length === 0 && !f.noAttachmentConfirmed) {
    errors.status = "ตรวจทานแล้วโดยไม่มีไฟล์แนบ ต้องยืนยันว่าไม่ต้องมีเอกสารแนบ";
  }
  return Object.keys(errors).length === 0 ? { ok: true, draft } : { ok: false, errors };
}

/** One record in edit. Parent keys this component by record ID so drafts never carry across records. */
export function DocumentEditor({ record, attachments, missingNames, onSave, onUnsavedChange, onAddFile, onLink, onUnlink, onPreview, supportsSubcategories = true, canStoreSubcategory = () => true, onUnsupportedSubcategory }: Props) {
  const [form, setForm] = useState<Form>(() => toForm(record));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const version = useRef(0);
  const attachmentIds = record.attachmentIds;
  const parsed = parseForm(form, attachmentIds);
  const hasErrors = !parsed.ok;
  const errors = parsed.ok ? {} : parsed.errors;

  useEffect(() => {
    onUnsavedChange(dirty || hasErrors);
  }, [dirty, hasErrors, onUnsavedChange]);

  useEffect(() => {
    if (!dirty || !parsed.ok) return;
    const snapshot = version.current;
    const draft = parsed.draft;
    const timer = window.setTimeout(() => {
      onSave(draft)
        .then((saved) => {
          if (version.current === snapshot) {
            setDirty(false);
            if (saved.status !== draft.status) setForm((f) => ({ ...f, status: saved.status }));
          }
          setMessage(null);
        })
        .catch((err: unknown) => {
          setMessage(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ ข้อมูลยังอยู่ในฟอร์ม");
        });
  }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // parsed is derived from form and attachmentIds; the effect is keyed on those inputs.
  }, [form, dirty, attachmentIds.join(",")]);

  const update = <K extends keyof Form>(key: K, value: Form[K]) => {
    version.current += 1;
    setDirty(true);
    setForm((f) => {
      if (key === "category") {
        const nextCategory = value as string;
        const stale = f.subcategory && !isSubcategoryApplicable(nextCategory, f.subcategory);
        return { ...f, category: nextCategory, subcategory: stale ? null : f.subcategory };
      }
      return { ...f, [key]: value };
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const result = await onAddFile(file, file.name, false);
      if (result.status === "duplicate") {
        const useExisting = window.confirm("มีไฟล์เหมือนกันอยู่แล้วในโฟลเดอร์ ต้องการใช้ไฟล์เดิมแทนการคัดลอกซ้ำหรือไม่");
        if (useExisting && result.existingIds[0]) {
          await onLink(result.existingIds[0]);
        } else if (window.confirm("ต้องการคัดลอกไฟล์นี้เพิ่มเป็นสำเนาใหม่หรือไม่")) {
          const again = await onAddFile(file, file.name, true);
          if (again.status === "added") await onLink(again.attachment.id);
        }
      } else {
        await onLink(result.attachment.id);
      }
      setMessage("เพิ่มไฟล์แนบแล้ว");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "เพิ่มไฟล์ไม่สำเร็จ");
    }
  };

  const attachmentById = new Map(attachments.map((a) => [a.id, a]));

  return (
    <form className="editor card" aria-label="แก้ไขรายการ" onSubmit={(e) => e.preventDefault()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div>
          <h2 style={{ margin: 0 }}>แก้ไขรายการ</h2>
          <span className="muted">รหัสรายการ: {record.id.slice(0, 8)}...</span>
        </div>
        <div className={`save-state-pill ${hasErrors ? "error" : dirty ? "saving" : "saved"}`}>
          <span className="dot" />
          <span className="status" role="status" aria-live="polite">
            {hasErrors ? "มีข้อมูลที่ยังไม่ถูกต้อง ยังไม่บันทึก" : dirty ? "กำลังจะบันทึกอัตโนมัติ" : "บันทึกแล้ว"}
          </span>
        </div>
      </div>

      {message && <p role="alert" className="error alert-danger">{message}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
        <label>
          วันที่ (ปปปป-ดด-วว)
          <input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} aria-invalid={!!errors.date} />
          {errors.date && <span className="error">{errors.date}</span>}
        </label>
        <label>
          ชื่อรายการ
          <input value={form.title} maxLength={200} onChange={(e) => update("title", e.target.value)} aria-invalid={!!errors.title} />
          {errors.title && <span className="error">{errors.title}</span>}
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: supportsSubcategories && subcategoriesFor(form.category).length > 0 ? "1fr 1fr" : "1fr", gap: "12px" }}>
        <label>
          หมวด
          <select value={form.category} onChange={(e) => update("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        {supportsSubcategories && subcategoriesFor(form.category).length > 0 && (
          <label>
            ประเภทเอกสารย่อย
            <select value={form.subcategory ?? ""} onChange={(e) => {
                const next = (e.target.value || null) as SubcategoryId | null;
                if (!canStoreSubcategory(next)) { onUnsupportedSubcategory?.(); return; }
                update("subcategory", next);
              }} aria-invalid={!!errors.subcategory}>
              <option value="">รอจัดประเภท</option>
              {subcategoriesFor(form.category).map((s) => <option key={s.id} value={s.id}>{s.label}{canStoreSubcategory(s.id) ? "" : " (ต้องสร้างสำเนา)"}</option>)}
            </select>
            {errors.subcategory && <span className="error">{errors.subcategory}</span>}
            <span className="muted">ใช้จัดเอกสาร ไม่ใช่การรับรองสิทธิลดหย่อน</span>
          </label>
        )}
      </div>

      <label>
        ผู้ออกเอกสาร
        <input value={form.issuer} maxLength={200} placeholder="เช่น บริษัท, ธนาคาร, บริษัทประกัน" onChange={(e) => update("issuer", e.target.value)} />
      </label>

      {/* 3-Tier Financial Input Grid */}
      <fieldset style={{ margin: "14px 0", padding: "12px", background: "var(--slate-surface)", borderRadius: "6px" }}>
        <legend>จำนวนเงิน (บาท)</legend>
        <div className="money-grid">
          <label>
            ยอดตามหลักฐาน
            <input inputMode="decimal" placeholder="0.00" value={form.evidence} onChange={(e) => update("evidence", e.target.value)} aria-invalid={!!errors.evidence} />
            <span className="muted">เว้นว่างหากไม่ทราบ</span>
            {errors.evidence && <span className="error">{errors.evidence}</span>}
          </label>
          <label>
            ยอดที่เลือกใช้สิทธิ
            <input inputMode="decimal" placeholder="0.00" value={form.claimed} onChange={(e) => update("claimed", e.target.value)} aria-invalid={!!errors.claimed} />
            <span className="muted">ก่อนกฎลดหย่อน</span>
            {errors.claimed && <span className="error">{errors.claimed}</span>}
          </label>
          <label>
            หัก ณ ที่จ่าย
            <input inputMode="decimal" placeholder="0.00" value={form.withheld} onChange={(e) => update("withheld", e.target.value)} aria-invalid={!!errors.withheld} />
            <span className="muted">จาก 50 ทวิ</span>
            {errors.withheld && <span className="error">{errors.withheld}</span>}
          </label>
        </div>
      </fieldset>

      <label>
        สถานะการตรวจทาน
        <select value={form.status} onChange={(e) => update("status", e.target.value as ReviewStatus)}>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {errors.status && <span className="error">{errors.status}</span>}
      </label>

      {form.status === "reviewed" && attachmentIds.length === 0 && (
        <div className="warning" style={{ margin: "10px 0" }}>
          <label style={{ margin: 0, flexDirection: "row", alignItems: "center", gap: "8px" }}>
            <input type="checkbox" checked={form.noAttachmentConfirmed} onChange={(e) => update("noAttachmentConfirmed", e.target.checked)} />
            <span>ยืนยันว่ารายการนี้ไม่ต้องมีเอกสารแนบ (เช่น ข้อมูลที่กรอกเองตามที่ผู้ใช้ยืนยัน)</span>
          </label>
        </div>
      )}

      <label>
        หมายเหตุ
        <textarea value={form.notes} maxLength={2000} placeholder="บันทึกข้อความเพิ่มเติม..." onChange={(e) => update("notes", e.target.value)} />
        {errors.notes && <span className="error">{errors.notes}</span>}
      </label>

      <fieldset>
        <legend>ไฟล์แนบเอกสาร (PDF, JPEG, PNG)</legend>
        {missingNames.length > 0 && <p className="warning">ไฟล์ที่หายไปหรือไม่ตรงกับข้อมูล: {missingNames.join(", ")}</p>}
        {attachmentIds.length === 0 ? (
          <p className="muted" style={{ margin: "8px 0" }}>ยังไม่มีไฟล์แนบสำหรับรายการนี้</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0", display: "flex", flexDirection: "column", gap: "6px" }}>
            {attachmentIds.map((id) => {
              const att = attachmentById.get(id);
              return (
                <li key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--slate-surface)", borderRadius: "4px", border: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontWeight: 500 }}>{att ? att.displayName : "ไฟล์ที่ไม่พบ"}</span>
                  <div className="actions" style={{ margin: 0 }}>
                    {att && <button type="button" className="btn-primary" onClick={() => onPreview(id)}>ดูตัวอย่าง</button>}
                    <button type="button" className="btn-danger" onClick={() => onUnlink(id).catch((err: unknown) => setMessage(err instanceof Error ? err.message : "ไม่สำเร็จ"))}>
                      นำออกจากรายการ
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <label className="dropzone-box" style={{ marginTop: "10px" }}>
          <span>+ เพิ่มไฟล์แนบ (ไฟล์จะถูกคัดลอกเข้าโฟลเดอร์ ไม่ย้ายหรือแก้ต้นฉบับ)</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png" style={{ display: "none" }} onChange={(e) => void handleFile(e.target.files?.[0])} />
        </label>
      </fieldset>
    </form>
  );
}
