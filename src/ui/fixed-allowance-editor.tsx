import { useMemo, useRef, useState, type FormEvent } from "react";
import { ZodError } from "zod";
import { FileText, FilePlus2, Minus, Plus, Trash2, UploadCloud } from "lucide-react";
import type { Attachment, TaxRecord, TaxRule, TaxYearData, Workspace } from "../domain/model";
import { calculate } from "../domain/engine";
import {
  applyFixedDrafts, classifyFixedRecords, isFixedAllowanceId, maxQualifyingCount, quantityKindOf,
  type FixedAllowanceId, type FixedDraft,
} from "../domain/fixed-allowances";
import { addAttachments } from "../storage/documents";
import { Modal } from "./primitives";
import { money, recordStateLabels } from "./format";

const countLabels: Record<string, string> = {
  child: "บุตรที่เข้าเงื่อนไข", "child-additional": "บุตรที่เข้าเกณฑ์ส่วนเพิ่ม",
  parents: "บิดามารดาที่เข้าเกณฑ์", "disability-care": "ผู้พิการ/ทุพพลภาพที่อุปการะ",
};
export const fixedEntryChoices: FixedAllowanceId[] = ["child", "parents", "spouse", "disability-care"];
const choiceLabels: Record<string, string> = {child: "บุตร", parents: "บิดามารดา", spouse: "คู่สมรสไม่มีเงินได้", "disability-care": "ผู้พิการ/ทุพพลภาพที่อุปการะ"};
const messageOf = (err: unknown) => err instanceof ZodError ? "ข้อมูลบางช่องไม่ถูกต้อง กรุณาตรวจจำนวนผู้เข้าเกณฑ์" : err instanceof Error ? err.message : "บันทึกสิทธิไม่สำเร็จ";

interface Line { id: FixedAllowanceId; rule: TaxRule; rows: TaxRecord[]; qty: number; confirmed: boolean; canonicalId: string | null; }

function groupFor(categoryId: string): FixedAllowanceId[] {
  const ids = categoryId === "child" || categoryId === "child-additional" ? ["child", "child-additional"] : [categoryId];
  return ids.filter(isFixedAllowanceId);
}
function initialLines(data: TaxYearData, ids: FixedAllowanceId[]): Line[] {
  return ids.flatMap(id => {
    const rule = data.rules.rules.find(r => r.id === id);
    if (!rule) return [];
    const rows = data.records.filter(r => r.categoryId === id);
    const first = rows[0];
    const qty = quantityKindOf(id) === "count" ? (first?.facts.qualifyingCount ?? (id === "child-additional" ? 0 : 1)) : 0;
    return [{ id, rule, rows, qty, confirmed: rows.length === 1 && rows[0].eligibility === "confirmed", canonicalId: rows.length === 1 ? rows[0].id : null }];
  });
}

/** One form for a fixed claim group. The preview runs the same pure command that saving uses. */
export function FixedAllowanceEditor({workspace, year, categoryId, onClose, onSave}: {
  workspace: Workspace; year: number; categoryId: string; onClose: () => void;
  onSave: (drafts: FixedDraft[], files: Map<string, Uint8Array>, expected: Workspace, year: number, backupFirst: boolean) => Promise<void>;
}) {
  const data = workspace.years[year];
  const ids = groupFor(categoryId);
  const primaryId = ids.includes(categoryId as FixedAllowanceId) ? categoryId : ids[0];
  const [lines, setLines] = useState<Line[]>(() => initialLines(data, ids));
  const [checklist, setChecklist] = useState<string[]>(() => {
    const rows = data.records.filter(r => r.categoryId === primaryId);
    return rows.length === 1 ? rows[0].checklist : [];
  });
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const states = useMemo(() => classifyFixedRecords(data), [data]);
  const primaryLine = lines.find(l => l.id === primaryId);
  const primaryRule = primaryLine?.rule;
  const storedRows = useMemo(() => lines.flatMap(l => l.rows), [lines]);
  const baseLine = lines.find(l => l.id === "child");
  const backupFirst = lines.some(l => l.rows.length > 1);

  function patch(id: FixedAllowanceId, part: Partial<Line>) {
    setLines(prev => {
      const next = prev.map(l => l.id === id ? {...l, ...part} : l);
      const base = next.find(l => l.id === "child");
      return base && !base.confirmed ? next.map(l => l.id === "child-additional" ? {...l, confirmed: false} : l) : next;
    });
  }
  function chooseCanonical(line: Line, row: TaxRecord) {
    const qty = quantityKindOf(line.id) === "count" ? (row.facts.qualifyingCount ?? (line.id === "child-additional" ? 0 : 1)) : 0;
    patch(line.id, {canonicalId: row.id, qty, confirmed: row.eligibility === "confirmed"});
    if (line.id === primaryId) setChecklist(row.checklist);
  }

  // Additional child is kept only when it has stored data or an explicit entry.
  function draftsFor(currentLines: Line[], newAttachments: Attachment[]): FixedDraft[] {
    return currentLines.filter(l => l.id === primaryId || l.rows.length > 0 || l.qty > 0 || l.confirmed).map(l => {
      const reference = l.rows.length === 1 ? l.rows[0] : undefined;
      return {
        categoryId: l.id,
        qualifyingCount: quantityKindOf(l.id) === "count" ? l.qty : null,
        confirmed: l.confirmed,
        checklist: l.id === primaryId ? checklist : (reference?.checklist ?? []),
        newAttachments: l.id === primaryId ? newAttachments : [],
        canonicalId: l.rows.length === 0 ? null : (l.rows.length === 1 ? l.rows[0].id : l.canonicalId),
      };
    });
  }

  const preview = useMemo(() => {
    try {
      const next = applyFixedDrafts(data, draftsFor(lines, []));
      const after = calculate(next);
      return {after, error: ""};
    } catch (err) {
      return {after: null, error: messageOf(err)};
    }
  }, [data, lines, checklist, primaryId]);
  const before = useMemo(() => {
    const calc = calculate(data);
    return ids.reduce((sum, id) => sum + (calc.categories.find(c => c.ruleId === id)?.allowed ?? 0), 0);
  }, [data, ids]);
  const after = preview.after ? ids.reduce((sum, id) => sum + (preview.after!.categories.find(c => c.ruleId === id)?.allowed ?? 0), 0) : null;
  const unresolved = lines.some(l => l.rows.length > 1 && l.canonicalId === null);
  const disabledSave = busy || Boolean(preview.error) || unresolved || !primaryRule;

  function choose(list: FileList | null) { if (list) setFiles(prev => [...prev, ...Array.from(list)]); }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current || disabledSave) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const staged: Workspace = {...workspace, files: new Map(workspace.files)};
      const attachments = await addAttachments(staged, year, primaryRule!.group, files);
      await onSave(draftsFor(lines, attachments), staged.files, workspace, year, backupFirst);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  const title = primaryRule ? `ตั้งค่าสิทธิ${primaryRule.name} — ปีภาษี ${year}` : "ตั้งค่าสิทธิ";
  return <Modal title={title} onClose={() => { if (!submitting.current) onClose(); }} busy={busy} wide>
    <form onSubmit={submit} className="editor-form fixed-form"><fieldset disabled={busy} className="editor-fieldset">
      <p className="muted">ไม่ต้องกรอกชื่อรายการ ยอดจ่าย หรือวันที่จ่าย ระบบคำนวณจากจำนวนผู้เข้าเกณฑ์และวงเงินของกฎปีนี้</p>
      {!primaryRule && <p className="notice">สิทธิประเภทนี้ไม่มีในชุดกฎของปีนี้ กรุณาเก็บเป็นเอกสารแทน</p>}
      {primaryRule && primaryRule.status !== "verified" && <p className="notice">กฎปีนี้ยังไม่ยืนยัน ตั้งค่าสิทธินี้ยังไม่ได้ จัดเก็บเอกสารได้เท่านั้น</p>}

      {lines.map(l => {
        const kind = quantityKindOf(l.id);
        const cap = l.rule.cap ?? 0;
        const max = kind === "count" ? maxQualifyingCount(l.id, l.id === "child-additional" ? (baseLine?.qty ?? 0) : 20) : 0;
        const total = kind === "count" ? l.qty * cap : cap;
        const isAdditional = l.id === "child-additional";
        const baseConfirmed = Boolean(baseLine?.confirmed);
        const label = countLabels[l.id] ?? l.rule.name;
        const stored = l.rows.length === 1 ? l.rows[0] : undefined;
        return <section className="fixed-line" key={l.id} aria-labelledby={`fixed-${l.id}`}>
          <div className="fixed-line-head"><h3 id={`fixed-${l.id}`}>{isAdditional ? "บุตรส่วนเพิ่ม" : l.rule.name}</h3>{l.id === "child" && <span className="pill neutral">บุตรพื้นฐาน</span>}</div>
          {kind === "count" ? <div className="fixed-stepper">
            <span className="fixed-stepper-label">{label}</span>
            <button type="button" className="icon-button" aria-label={`ลด${label}`} disabled={l.qty <= 0} onClick={() => patch(l.id, {qty: Math.max(0, l.qty - 1), confirmed: false})}><Minus size={18}/></button>
            <label className="sr-only" htmlFor={`fixed-qty-${l.id}`}>{label}</label>
            <input id={`fixed-qty-${l.id}`} type="number" inputMode="numeric" min={0} max={max} step={1} value={l.qty}
              onChange={e => { const n = Number(e.target.value); patch(l.id, {qty: Number.isFinite(n) ? Math.trunc(n) : 0, confirmed: false}); }}/>
            <button type="button" className="icon-button" aria-label={`เพิ่ม${label}`} disabled={l.qty >= max} onClick={() => patch(l.id, {qty: Math.min(max, l.qty + 1), confirmed: false})}><Plus size={18}/></button>
            <span className="muted">คน (ไม่เกิน {max})</span>
          </div> : <p className="muted">สิทธิคู่สมรสใช้ยืนยันหนึ่งสิทธิต่อปี ไม่ต้องระบุจำนวนผู้รับสิทธิ</p>}
          <p className="fixed-equation">{kind === "count" ? `${l.qty} คน × ${money(cap)} บาท` : `สิทธิต่อปี ${money(cap)} บาท`} = <strong>{money(total)} บาท</strong></p>
          <p className="fixed-state">{l.confirmed ? "นำมาคำนวณเมื่อบันทึก" : "ยอดตามจำนวนที่ระบุ — ยังไม่นำมาคำนวณ"}</p>
          {stored?.eligibility === "ineligible" && !l.confirmed && <p className="notice">รายการนี้เคยระบุว่าไม่เข้าเงื่อนไข จะคงสถานะนี้จนกว่าจะติ๊กยืนยันใหม่</p>}
          <label className="check fixed-confirm">
            <input type="checkbox" checked={l.confirmed} disabled={!l.confirmed && ((isAdditional && !baseConfirmed) || (kind === "count" && l.qty < 1))} onChange={e => patch(l.id, {confirmed: e.target.checked})}/>
            {isAdditional ? "ตรวจเงื่อนไขส่วนเพิ่มแล้ว ให้นำส่วนเพิ่มมาคำนวณ (เปิดได้เมื่อยืนยันบุตรพื้นฐานแล้ว)" : "ตรวจเงื่อนไขแล้ว ให้นำสิทธินี้มาคำนวณ"}
          </label>
          <p className="muted small">การติ๊กเป็นการยืนยันของคุณเอง ไม่ใช่การรับรองจากแอป</p>
          <details className="conditions"><summary>ดูเงื่อนไขทั้งหมด</summary><p>{l.rule.description}</p><ul>{l.rule.conditions.map(c => <li key={c}>{c}</li>)}</ul></details>
          {l.rows.length > 1 && <fieldset className="fixed-conflict">
            <legend>พบ {l.rows.length} รายการของสิทธินี้ เลือกรายการหลักหนึ่งรายการ</legend>
            <p className="muted small">รายการอื่นจะไม่ถูกนับ ระบบไม่ลบและไม่รวมไฟล์ให้อัตโนมัติ</p>
            {l.rows.map(r => <label className="fixed-candidate" key={r.id}>
              <input type="radio" name={`canonical-${l.id}`} checked={l.canonicalId === r.id} onChange={() => chooseCanonical(l, r)}/>
              <span><strong>{r.title}</strong><small>{recordStateLabels[states.get(r.id) ?? "rule-pending"]} · จำนวน {r.facts.qualifyingCount ?? "ไม่ระบุ"} · ไฟล์ {r.attachments.length}{r.amount > 0 ? ` · ยอดจ่ายเดิม ${money(r.amount)} บาท (ไม่ใช่ยอดสิทธิ)` : ""}</small></span>
            </label>)}
          </fieldset>}
        </section>;
      })}

      <section className="fixed-summary" aria-live="polite">
        <span>ยอดที่นำมาคำนวณ</span>
        <strong>{after === null ? "—" : money(after)} บาท</strong>
        <small>ตอนนี้ {money(before)} บาท · หลังบันทึก {after === null ? "—" : money(after)} บาท</small>
        {preview.error && <p role="alert" className="error">{preview.error}</p>}
      </section>

      <details className="fixed-docs">
        <summary>แนบเอกสารและรายการตรวจ (ไม่จำเป็นตอนนี้)</summary>
        <p className="muted small">การแนบเอกสารไม่ได้ยืนยันสิทธิ และการติ๊กรายการตรวจไม่ได้ยืนยันสิทธิโดยอัตโนมัติ</p>
        {primaryRule && primaryRule.documents.map(d => <label className="check" key={d}><input type="checkbox" checked={checklist.includes(d)} onChange={e => setChecklist(e.target.checked ? [...checklist, d] : checklist.filter(x => x !== d))}/>{d}</label>)}
        <section className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) choose(e.dataTransfer.files); }}>
          <UploadCloud/><strong>ลากเอกสารมาวางที่นี่</strong><span>PDF, JPG, PNG, WebP · ไม่เกิน 20 MB ต่อไฟล์</span>
          <label className="button secondary">เลือกไฟล์<input className="sr-only" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => { choose(e.target.files); e.target.value = ""; }}/></label>
        </section>
        <ul className="file-list">{storedRows.flatMap(r => r.attachments).map(a => <li key={a.id}><FileText size={16}/><span>{a.originalName}</span></li>)}{files.map((f, i) => <li key={i}><FilePlus2 size={16}/><span>{f.name}</span><button type="button" className="icon-button" aria-label={`นำไฟล์ใหม่ ${f.name} ออก`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><Trash2 size={16}/></button></li>)}</ul>
      </details>

      {backupFirst && <p className="notice">ก่อนบันทึกการเลือกรายการหลัก ระบบจะดาวน์โหลด ZIP สำรองของแฟ้มปัจจุบันก่อน หากสำรองไม่สำเร็จจะไม่บันทึก</p>}
      {error && <div role="alert" className="error">{error}</div>}
      <footer className="modal-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>ยกเลิก</button>
        <button className="button primary" disabled={disabledSave}>{busy ? "กำลังบันทึก…" : backupFirst ? "สำรอง ZIP แล้วบันทึก" : "บันทึกสิทธิ"}</button>
      </footer>
    </fieldset></form>
  </Modal>;
}

/** Entry point for the generic "add" action: the user picks the kind before typing. */
export function EntryTypeChooser({onFixed, onPaid, onClose}: {onFixed: (id: FixedAllowanceId) => void; onPaid: () => void; onClose: () => void}) {
  const [step, setStep] = useState<"type" | "fixed">("type");
  return <Modal title={step === "type" ? "เพิ่มรายการใหม่" : "เลือกสิทธิยอดคงที่"} onClose={onClose}>
    <div className="modal-body">
      {step === "type" ? <>
        <p className="muted">เลือกให้ตรงกับสิ่งที่ต้องการเก็บ</p>
        <div className="create-options">
          <button className="create-option fixed-choice" onClick={() => setStep("fixed")}><strong>สิทธิยอดคงที่</strong><span>บุตร บิดามารดา คู่สมรส หรือผู้พิการที่อุปการะ · ไม่ต้องกรอกยอดจ่ายหรือวันที่จ่าย</span></button>
          <button className="create-option fixed-choice" onClick={onPaid}><strong>จ่ายจริงหรือเอกสาร</strong><span>ค่าประกัน กองทุน ดอกเบี้ย หรือรายการที่มีวันที่จ่ายจริง</span></button>
        </div>
      </> : <div className="create-options">{fixedEntryChoices.map(id => <button className="create-option fixed-choice" key={id} onClick={() => onFixed(id)}><strong>{choiceLabels[id]}</strong></button>)}</div>}
    </div>
  </Modal>;
}
