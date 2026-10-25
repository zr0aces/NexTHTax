import { useEffect, useState } from "react";
import { categoryLabel, subcategoriesFor, subcategoryLabel } from "../domain/documents";
import { parseBahtInput, formatSatang } from "../domain/money";
import { annualInputReasons, annualSourceProjection, calculateAnnualTax, emptyAnnualInputs } from "../domain/annualTax";
import { confirmationState, worksheetProjection, taxInputsSchema, type TaxInputs } from "../domain/taxInputs";
import type { AnyRuleBundle } from "../domain/rules";
import type { Manifest, RecordEntry } from "../domain/schema";
import { sha256Hex } from "../storage/hash";

type Deduction = TaxInputs["deductions"][number];
const CATEGORIES = ["deduction_insurance", "deduction_retirement", "deduction_social_security", "deduction_mortgage_interest", "deduction_other", "donation_general", "donation_conditional", "donation_edonation"] as const;
const ANSWERS = [["unknown", "ยังไม่ทราบ"], ["yes", "ใช่"], ["no", "ไม่ใช่"]] as const;
const moneyText = (v: number | null) => v === null ? "" : formatSatang(v);
interface Draft { input: TaxInputs; amounts: Record<string, string>; age: string; dependents: string }
function draftFrom(t: TaxInputs | null): Draft {
  const input = structuredClone(t ?? emptyAnnualInputs());
  const amounts: Record<string, string> = {};
  for (const i of input.incomeItems) { amounts[`${i.id}/gross`] = moneyText(i.grossAmountSatang); amounts[`${i.id}/withheld`] = moneyText(i.withheldAmountSatang); }
  for (const d of input.deductions) amounts[`${d.id}/paid`] = moneyText(d.existingContributionSatang);
  return { input, amounts, age: input.facts.ageAtYearEnd?.toString() ?? "", dependents: input.facts.dependentClaimCount?.toString() ?? "" };
}
interface Props {
  manifest: Manifest; taxYear: number; bundle: AnyRuleBundle | null; ruleDigest: string | null; trustedRules: boolean;
  onSave: (input: TaxInputs) => Promise<void>; disabled: boolean; supportsAnnual: boolean; onUpgrade: () => void;
  onUnsavedChange: (value: boolean) => void;
}

export function AnnualTaxWorksheet({ manifest, taxYear, bundle, ruleDigest, trustedRules, onSave, disabled, supportsAnnual, onUpgrade, onUnsavedChange }: Props) {
  const saved = manifest.years[String(taxYear)]?.taxInputs ?? null;
  const savedKey = JSON.stringify(saved);
  const [seedKey, setSeedKey] = useState(savedKey);
  const [draft, setDraft] = useState(() => draftFrom(saved));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sourceId, setSourceId] = useState("");
  // Bind asynchronous digest results to exact synchronous input identity. Old hashes can never authorize a new render.
  const hashKey = JSON.stringify([saved, annualSourceProjection(manifest.records, taxYear), taxYear, ruleDigest]);
  const [digests, setDigests] = useState<{ key: string; sources: string; worksheet: string } | null>(null);
  useEffect(() => {
    if (savedKey !== seedKey) { setDraft(draftFrom(saved)); setSeedKey(savedKey); }
  }, [saved, savedKey, seedKey]);
  useEffect(() => {
    let cancelled = false;
    if (!saved) return;
    (async () => {
      const sources = await sha256Hex(new TextEncoder().encode(annualSourceProjection(manifest.records, taxYear)));
      const worksheet = await sha256Hex(new TextEncoder().encode(worksheetProjection(saved, { taxYear, sourcesDigest: sources, ruleDigest, engineVersion: 2 })));
      if (!cancelled) setDigests({ key: hashKey, sources, worksheet });
    })().catch(() => { if (!cancelled) setDigests(null); });
    return () => { cancelled = true; };
  }, [hashKey, saved, manifest.records, taxYear, ruleDigest]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved));
  useEffect(() => { onUnsavedChange(dirty); return () => onUnsavedChange(false); }, [dirty, onUnsavedChange]);
  const currentDigests = digests?.key === hashKey ? digests : null;
  const confirmed = !dirty && currentDigests !== null && confirmationState(saved, { sourcesDigest: currentDigests.sources, worksheetDigest: currentDigests.worksheet }) === "confirmed";
  const result = calculateAnnualTax({ taxYear, inputs: saved, records: manifest.records, bundle, trusted: trustedRules, confirmed });
  const update = (change: (input: TaxInputs) => void) => setDraft((d) => {
    const input = structuredClone(d.input); change(input);
    input.confirmedSourcesDigest = null; input.confirmedWorksheetDigest = null;
    // Completeness is an acknowledgement of this exact selection, not of future edits.
    input.incomeComplete = "unknown"; input.withholdingComplete = "unknown";
    input.deductionsComplete = "unknown"; input.finalTaxGroupsComplete = "unknown";
    return { ...d, input };
  });
  const setAmount = (key: string, text: string) => {
    update(() => {});
    setDraft((d) => ({ ...d, amounts: { ...d.amounts, [key]: text } }));
  };
  const used = new Set([...draft.input.incomeItems, ...draft.input.deductions].flatMap((i) => i.sourceRecordIds));
  const candidates = manifest.records.filter((r) => r.taxYear === taxYear && r.trashedAt === null && r.status !== "excluded" && !used.has(r.id) && (["income_salary", "withholding_50bis"].includes(r.category) || CATEGORIES.some((c) => c === r.category)));
  const addIncome = (r?: RecordEntry) => {
    const id = crypto.randomUUID();
    update((t) => t.incomeItems.push({ id, sourceRecordIds: r ? [r.id] : [], kind: "salary", grossAmountSatang: r?.evidenceAmountSatang ?? null, withheldAmountSatang: r?.withheldAmountSatang ?? null, treatment: "progressive", electionGroup: null }));
    setDraft((d) => ({ ...d, amounts: { ...d.amounts, [`${id}/gross`]: moneyText(r?.evidenceAmountSatang ?? null), [`${id}/withheld`]: moneyText(r?.withheldAmountSatang ?? null) } }));
  };
  const addDeduction = (r?: RecordEntry) => {
    const id = crypto.randomUUID();
    const category = CATEGORIES.find((c) => c === r?.category) ?? "deduction_insurance";
    update((t) => t.deductions.push({ id, sourceRecordIds: r ? [r.id] : [], category, subcategory: r?.subcategory ?? null, existingContributionSatang: r?.claimedAmountSatang ?? r?.evidenceAmountSatang ?? null, eligibility: "unknown" }));
    setDraft((d) => ({ ...d, amounts: { ...d.amounts, [`${id}/paid`]: moneyText(r?.claimedAmountSatang ?? r?.evidenceAmountSatang ?? null) } }));
  };
  const selectSource = () => {
    const r = candidates.find((r) => r.id === sourceId);
    if (!r) return;
    if (["income_salary", "withholding_50bis"].includes(r.category)) addIncome(r); else addDeduction(r);
    setSourceId("");
  };
  const build = (): TaxInputs | null => {
    const t = structuredClone(draft.input);
    let invalid = false;
    const money = (key: string) => { const v = parseBahtInput(draft.amounts[key] ?? ""); if (!v.ok) { invalid = true; return null; } return v.satang; };
    for (const i of t.incomeItems) { i.grossAmountSatang = money(`${i.id}/gross`); i.withheldAmountSatang = money(`${i.id}/withheld`); }
    for (const d of t.deductions) d.existingContributionSatang = money(`${d.id}/paid`);
    t.facts.ageAtYearEnd = draft.age.trim() === "" ? null : Number(draft.age);
    t.facts.dependentClaimCount = draft.dependents.trim() === "" ? null : Number(draft.dependents);
    t.confirmedSourcesDigest = null; t.confirmedWorksheetDigest = null;
    const parsed = taxInputsSchema.safeParse(t);
    if (invalid || !parsed.success) { setMessage("ตรวจรูปแบบจำนวนเงิน อายุ และจำนวนผู้อยู่ในอุปการะ ช่องว่างหมายถึงยังไม่ทราบ"); return null; }
    const reasons = annualInputReasons(parsed.data, manifest.records, taxYear);
    if (reasons.length) { setMessage(reasons.join("; ")); return null; }
    return parsed.data;
  };
  const persist = async (confirm: boolean) => {
    if (disabled || pending || (confirm && (!saved || dirty || !currentDigests))) return;
    const value = confirm && saved && currentDigests ? { ...saved, confirmedSourcesDigest: currentDigests.sources, confirmedWorksheetDigest: currentDigests.worksheet } : build();
    if (!value) return;
    // Old formats can save representable edits, but never write new facts under their old version.
    setPending(true);
    try { await onSave(value); setMessage(confirm ? "ยืนยันข้อมูลแล้ว ผลยังขึ้นกับขอบเขตและกฎที่ตรวจรับ" : "บันทึกข้อมูลภาษีแล้ว กรุณาตรวจและยืนยันข้อมูลล่าสุด"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ ข้อมูลที่แก้ไขยังอยู่ในหน้าจอ"); }
    finally { setPending(false); }
  };
  const sources = (ids: string[]) => ids.length === 0 ? <p className="muted">กรอกเอง — ยังไม่มีหลักฐานแนบ ตรวจว่าไม่ซ้ำกับเอกสารที่เลือก</p> : <ul className="worksheet-sources">{ids.map((id) => {
    const r = manifest.records.find((r) => r.id === id);
    return <li key={id}>{r?.title ?? "ไม่พบเอกสารต้นทาง"} · ยอดหลักฐาน {r?.evidenceAmountSatang === null || r?.evidenceAmountSatang === undefined ? "ยังไม่ทราบ" : `${formatSatang(r.evidenceAmountSatang)} บาท`}</li>;
  })}</ul>;
  const answer = (value: "yes" | "no" | "unknown", onChange: (v: "yes" | "no" | "unknown") => void) => <select value={value} onChange={(e) => onChange(e.target.value as typeof value)}>{ANSWERS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>;
  const complete = draft.input.incomeComplete === "yes" && draft.input.withholdingComplete === "yes" && draft.input.deductionsComplete === "yes" && draft.input.finalTaxGroupsComplete === "yes";
  return <section className="card worksheet-card" aria-labelledby="annual-title">
    <h2 id="annual-title">คำนวณภาษี ปี {taxYear + 543}</h2>
    <p className="warning">ประมาณการเท่านั้น ไม่ใช่การยื่นแบบ แสดงยอดจ่ายเพิ่มหรือขอคืนเมื่อข้อมูลครบและกฎปีนี้ผ่านการตรวจรับแล้วเท่านั้น</p>
    <p>รองรับผู้มีรายได้เฉพาะเงินเดือน โสด มีถิ่นที่อยู่ในไทย อายุต่ำกว่า 65 ปี ไม่เป็นคนพิการ และไม่มีค่าลดหย่อนผู้อยู่ในอุปการะ</p>
    {!supportsAnnual && <div className="notice"><p>แก้ข้อมูลเดิมในรูปแบบเดิมได้ การเพิ่มรายละเอียดที่รูปแบบเดิมเก็บไม่ได้ต้องสร้างสำเนา ต้นฉบับไม่ถูกแก้ไข</p><button type="button" disabled={disabled || pending || dirty} onClick={onUpgrade}>สร้างสำเนาสำหรับคุณสมบัติใหม่</button><p>หากมีงานค้าง ให้บันทึกข้อมูลที่รูปแบบเดิมรองรับก่อน หรือส่งออก/จดข้อมูลไว้ก่อนออกจากหน้านี้</p></div>}
    <fieldset disabled={disabled || pending} className="annual-form">
      <legend className="sr-only">ข้อมูลคำนวณภาษี</legend>
      <h3>1. ข้อมูลผู้เสียภาษี</h3>
      <div className="worksheet-grid">
        <label>อายุ ณ สิ้นปีภาษี<input inputMode="numeric" value={draft.age} onChange={(e) => { update(() => {}); setDraft((d) => ({ ...d, age: e.target.value })); }} /></label>
        <label>จำนวนผู้อยู่ในอุปการะที่ขอหัก<input inputMode="numeric" value={draft.dependents} onChange={(e) => { update(() => {}); setDraft((d) => ({ ...d, dependents: e.target.value })); }} /></label>
        <label>เป็นผู้มีถิ่นที่อยู่ในไทย{answer(draft.input.facts.resident, (v) => update((t) => { t.facts.resident = v; }))}</label>
        <label>มีสถานภาพสมรส{answer(draft.input.facts.married, (v) => update((t) => { t.facts.married = v; }))}</label>
        <label>อายุ 65 ปีขึ้นไปหรือเป็นคนพิการ{answer(draft.input.facts.elderlyOrDisabled, (v) => update((t) => { t.facts.elderlyOrDisabled = v; }))}</label>
      </div>
      <h3>2. ตรวจรายได้และสิทธิที่เลือก</h3>
      <p>ไม่เลือกเอกสารให้อัตโนมัติ ยอดที่เลือกแก้ไขได้โดยไม่เปลี่ยนต้นฉบับ ช่องว่างคือยังไม่ทราบ ไม่ใช่ 0</p>
      <div className="worksheet-source-picker">
        <label>เลือกเอกสารปีนี้<select value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">เลือกเอกสาร</option>{candidates.map((r) => <option key={r.id} value={r.id}>{r.title} · {categoryLabel(r.category)}{r.subcategory ? ` / ${subcategoryLabel(r.subcategory)}` : ""}</option>)}</select></label>
        <button type="button" disabled={!sourceId} onClick={selectSource}>เลือกใช้คำนวณ</button>
      </div>
      <p className="muted">เงินเดือนและ 50 ทวิอาจเป็นรายได้ก้อนเดียวกัน เลือกเพียงครั้งเดียว ส่วน e-Donation/ThaiESGX/ประกันบำนาญต้องมีกฎและรายละเอียดตรงสิทธิ ไม่เดาจากชื่อหมวด</p>
      <h4>รายได้</h4>
      {draft.input.incomeItems.map((i, index) => <fieldset className="annual-row" key={i.id}><legend>รายได้ {index + 1} · {i.kind === "salary" ? "เงินเดือน" : i.kind}</legend>
        {sources(i.sourceRecordIds)}
        {i.treatment !== "progressive" || i.electionGroup !== null ? <p className="warning">เก็บวิธีคำนวณเดิมไว้ กรณีนี้ยังไม่รองรับ</p> : null}
        <div className="worksheet-grid">
          <label>เงินได้ทั้งปี (บาท)<input inputMode="decimal" value={draft.amounts[`${i.id}/gross`] ?? ""} onChange={(e) => setAmount(`${i.id}/gross`, e.target.value)} /></label>
          <label>ภาษีหัก ณ ที่จ่าย (บาท)<input inputMode="decimal" value={draft.amounts[`${i.id}/withheld`] ?? ""} onChange={(e) => setAmount(`${i.id}/withheld`, e.target.value)} /></label>
        </div>
        <button type="button" onClick={() => update((t) => { t.incomeItems = t.incomeItems.filter((x) => x.id !== i.id); })}>นำรายได้ {index + 1} ออกจากการคำนวณ</button>
      </fieldset>)}
      <button type="button" onClick={() => addIncome()}>เพิ่มรายได้กรอกเอง</button>
      <p>หากมีรายได้อื่นนอกจากเงินเดือน อย่าใช้ผลนี้เป็นภาษีทั้งปี กรณีดังกล่าวยังไม่รองรับ</p>
      <h4>ค่าลดหย่อนและบริจาค</h4>
      {draft.input.deductions.map((d, index) => <fieldset className="annual-row" key={d.id}><legend>สิทธิ {index + 1}</legend>
        {sources(d.sourceRecordIds)}
        <div className="worksheet-grid">
          <label>หมวดสิทธิ<select value={d.category} disabled={d.sourceRecordIds.length > 0} onChange={(e) => update((t) => { const row = t.deductions.find((x) => x.id === d.id)!; row.category = e.target.value as Deduction["category"]; row.subcategory = null; row.eligibility = "unknown"; })}>{CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}</select></label>
          {subcategoriesFor(d.category).length > 0 && <label>ประเภทสิทธิ<select value={d.subcategory ?? ""} disabled={d.sourceRecordIds.length > 0} onChange={(e) => update((t) => { const row = t.deductions.find((x) => x.id === d.id)!; row.subcategory = subcategoriesFor(d.category).find((s) => s.id === e.target.value)?.id ?? null; row.eligibility = "unknown"; })}><option value="">รอจัดประเภท</option>{subcategoriesFor(d.category).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
          <label>ยอดที่ขอใช้ก่อนตรวจเพดาน (บาท)<input inputMode="decimal" value={draft.amounts[`${d.id}/paid`] ?? ""} onChange={(e) => { setAmount(`${d.id}/paid`, e.target.value); update((t) => { t.deductions.find((x) => x.id === d.id)!.eligibility = "unknown"; }); }} /></label>
          <label>ยืนยันว่าจ่ายจริงและเข้าเงื่อนไขสิทธิปีนี้{answer(d.eligibility, (v) => update((t) => { t.deductions.find((x) => x.id === d.id)!.eligibility = v; }))}</label>
        </div>
        <button type="button" onClick={() => update((t) => { t.deductions = t.deductions.filter((x) => x.id !== d.id); })}>นำสิทธิ {index + 1} ออกจากการคำนวณ</button>
      </fieldset>)}
      <button type="button" onClick={() => addDeduction()}>เพิ่มสิทธิกรอกเอง</button>
      <label className="annual-complete"><input type="checkbox" checked={complete} onChange={(e) => {
        const value = e.target.checked ? "yes" : "unknown";
        setDraft((d) => ({ ...d, input: { ...d.input, incomeComplete: value, withholdingComplete: value, deductionsComplete: value, finalTaxGroupsComplete: value, confirmedSourcesDigest: null, confirmedWorksheetDigest: null } }));
      }} />ยืนยันว่ามีเฉพาะเงินเดือน รายได้ ภาษีหัก ณ ที่จ่าย และสิทธิครบแล้ว ยอดกรอกเองไม่ซ้ำกับเอกสารที่เลือก รวมถึงเงินเดือนกับ 50 ทวิ</label>
      <div className="actions"><button type="button" className="btn-primary" onClick={() => void persist(false)}>บันทึกข้อมูลภาษี</button><button type="button" disabled={!saved || dirty || !currentDigests || !complete} onClick={() => void persist(true)}>ยืนยันข้อมูลที่บันทึกแล้ว</button></div>
    </fieldset>
    {dirty && <p role="status">มีการแก้ไขที่ยังไม่บันทึก ผลคำนวณยังไม่แสดง</p>}
    {message && <p role="status">{message}</p>}
    <p role="status">{confirmed ? "ยืนยันแล้วตามข้อมูลที่บันทึก" : saved?.confirmedWorksheetDigest ? "ข้อมูลหรือเอกสารเปลี่ยน ต้องตรวจและยืนยันใหม่" : "ยังไม่ได้ยืนยันข้อมูลล่าสุด"}</p>
    <h3>3. ผลประมาณการ</h3>
    {result.status === "blocked" ? <div role="status"><p>ยังไม่แสดงยอดภาษี จ่ายเพิ่ม หรือขอคืน:</p><ul>{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div> : <>
      <table><caption>ยอดที่เลือกและยอดใช้สิทธิหลังตรวจเพดาน (บาท)</caption><thead><tr><th>รายการ</th><th>ยอดขอใช้</th><th>ยอดใช้สิทธิ</th><th>เหตุผล</th></tr></thead><tbody>{result.lines.map((l, i) => <tr key={i}><th scope="row">{l.label}</th><td>{formatSatang(l.requestedSatang)}</td><td>{formatSatang(l.allowedSatang)}</td><td>{l.reason}</td></tr>)}</tbody></table>
      <dl className="annual-result">{[["เงินเดือนรวม", result.salarySatang], ["ค่าใช้จ่ายเงินเดือนตามกฎ", result.expenseSatang], ["ค่าลดหย่อนส่วนตัวตามกฎ", result.personalAllowanceSatang], ["เงินได้สุทธิ", result.taxableSatang], ["ภาษีประมาณการทั้งปี", result.taxSatang], ["ภาษีหัก ณ ที่จ่าย", result.withheldSatang], ["ประมาณการจ่ายเพิ่ม", result.payableSatang], ["ประมาณการขอคืน", result.refundSatang]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatSatang(Number(value))} บาท</dd></div>)}</dl>
    </>}
  </section>;
}
