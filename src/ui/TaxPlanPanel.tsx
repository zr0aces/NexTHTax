import { useEffect, useState } from "react";
import { formatSatang, parseBahtInput } from "../domain/money";
import type { Manifest } from "../domain/schema";
import type { TaxPlan, TaxScenario } from "../domain/taxInputs";
import { confirmationState, sourceProjection, worksheetProjection } from "../domain/taxInputs";
import { planCompletionProjection, planEstimates, planReviewReasons, planStatus, selectedPlanScenario, type SavingEstimate } from "../domain/planning";
import type { AnyRuleBundle } from "../domain/rules";
import type { Answer } from "../domain/tax";
import { sha256Hex } from "../storage/hash";

export interface TaxPlanPanelProps {
  manifest: Manifest;
  taxYear: number;
  bundle: AnyRuleBundle | null;
  trustedRules: boolean;
  ruleDigest: string | null;
  disabled?: boolean;
  onUnsavedChange: (dirty: boolean) => void;
  onSave: (scenario: TaxScenario, plan: TaxPlan, complete: boolean) => Promise<void>;
  onVerifyEvidence: (recordId: string) => Promise<void>;
}

function initialDraft(manifest: Manifest, taxYear: number) {
  const year = manifest.years[String(taxYear)];
  const plan = year?.plan;
  const scenario = selectedPlanScenario(year);
  const item = scenario?.contributions[0];
  const amount = (n: number | null | undefined) => n == null ? "" : formatSatang(n);
  return {
    amount: amount(item?.additionalContributionSatang), budget: amount(scenario?.budgetSatang),
    eligible: item?.eligibility ?? "unknown" as Answer,
    holding: item?.holdingAccepted === "yes", liquidity: item?.liquidityAccepted === "yes",
    actual: amount(plan?.actualAmountSatang), paid: plan?.paid ?? false,
    excludes: plan?.baselineExcludesAction ?? false, evidenceId: plan?.evidenceRecordId ?? "",
  };
}

function Estimate({ label, value }: { label: string; value: SavingEstimate | null }) {
  return <p>{label}: {value ? `จ่ายเพิ่ม ${formatSatang(value.outlaySatang)} บาท · ประหยัดภาษี ${formatSatang(value.savingSatang)} บาท · เงินจ่ายสุทธิ ${formatSatang(value.netCostSatang)} บาท` : "ยังประเมินไม่ได้ (ไม่ใช่ 0)"}</p>;
}

/** A single additional health-premium action. No product selection or invented deadlines. */
export function TaxPlanPanel({ manifest, taxYear, bundle, trustedRules, ruleDigest, disabled = false, onUnsavedChange, onSave, onVerifyEvidence }: TaxPlanPanelProps) {
  const year = manifest.years[String(taxYear)];
  const savedPlan = year?.plan;
  const savedScenario = selectedPlanScenario(year);
  const savedKey = JSON.stringify([savedPlan, savedScenario]);
  const [draft, setDraft] = useState(() => initialDraft(manifest, taxYear));
  const [draftKey, setDraftKey] = useState(savedKey);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const projection = planCompletionProjection(manifest, taxYear);
  const [checks, setChecks] = useState<{ projection: string; ruleDigest: string | null; digest: string; verified: boolean; confirmed: boolean } | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft(manifest, taxYear));

  useEffect(() => {
    if (savedKey !== draftKey) { setDraftKey(savedKey); setDraft(initialDraft(manifest, taxYear)); }
  }, [savedKey, draftKey, manifest, taxYear]);
  useEffect(() => {
    onUnsavedChange(dirty);
    return () => onUnsavedChange(false);
  }, [dirty, onUnsavedChange]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const digest = await sha256Hex(new TextEncoder().encode(projection));
      let verified = false;
      if (savedPlan?.completionDigest && savedPlan.evidenceRecordId) {
        try { await onVerifyEvidence(savedPlan.evidenceRecordId); verified = true; } catch { /* Needs review, never a completed estimate. */ }
      }
      const sourcesDigest = await sha256Hex(new TextEncoder().encode(sourceProjection(manifest.records, taxYear)));
      const worksheetDigest = year?.taxInputs ? await sha256Hex(new TextEncoder().encode(worksheetProjection(year.taxInputs, { taxYear, sourcesDigest, ruleDigest, engineVersion: 1 }))) : "";
      const confirmed = confirmationState(year?.taxInputs ?? null, { sourcesDigest, worksheetDigest }) === "confirmed";
      if (!cancelled) setChecks({ projection, ruleDigest, digest, verified, confirmed });
    })().catch(() => { if (!cancelled) setChecks(null); });
    return () => { cancelled = true; };
  }, [projection, ruleDigest, manifest, taxYear, year, savedPlan, onVerifyEvidence]);

  const current = checks?.projection === projection && checks.ruleDigest === ruleDigest ? checks : null;
  const status = planStatus(manifest, taxYear, current?.digest ?? null, current?.verified ?? false);
  const estimates = planEstimates(manifest, taxYear, bundle, trustedRules, current?.confirmed ?? false, status === "completed");
  const reasons = planReviewReasons(manifest, taxYear);
  const records = manifest.records.filter((r) => r.taxYear === taxYear && r.trashedAt === null && r.category === "deduction_insurance" && r.subcategory === "insurance_health");
  const set = <K extends keyof typeof draft>(key: K, value: typeof draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async (complete: boolean) => {
    if (disabled || pending) return;
    const amount = parseBahtInput(draft.amount), budget = parseBahtInput(draft.budget), actual = parseBahtInput(draft.actual);
    if (!amount.ok || amount.satang === null || !budget.ok || budget.satang === null || !actual.ok) {
      setMessage("กรอกยอดเพิ่มและงบประมาณให้ถูกต้อง ช่องว่างไม่ใช่ 0"); return;
    }
    if (amount.satang > budget.satang) { setMessage("ยอดที่วางแผนเกินงบประมาณ กรุณาปรับยอดหรืองบ"); return; }
    const scenario: TaxScenario = {
      id: savedScenario?.id ?? crypto.randomUUID(), label: savedScenario?.label ?? "แผนประกันสุขภาพ", budgetSatang: budget.satang,
      contributions: [{ subcategory: "insurance_health", additionalContributionSatang: amount.satang, eligibility: draft.eligible, holdingAccepted: draft.holding ? "yes" : "unknown", liquidityAccepted: draft.liquidity ? "yes" : "unknown", riskAccepted: savedScenario?.contributions[0]?.riskAccepted ?? "unknown" }],
      confirmedChoiceDigest: null,
    };
    const plan: TaxPlan = { scenarioId: scenario.id, actualAmountSatang: actual.satang, paid: draft.paid, baselineExcludesAction: draft.excludes, evidenceRecordId: draft.evidenceId || null, completionDigest: null };
    setPending(true);
    try { await onSave(scenario, plan, complete); setMessage(complete ? "ยืนยันการทำรายการแล้ว ไม่ใช่การรับรองสิทธิจากกรมสรรพากร" : "บันทึกแผนแล้ว"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "บันทึกแผนไม่สำเร็จ"); }
    finally { setPending(false); }
  };

  return <section aria-labelledby="tax-plan-title" className="task-details">
    <h3 id="tax-plan-title">3. แผนของฉัน</h3>
    <p>หนึ่งแผนต่อปี เริ่มจากเบี้ยประกันสุขภาพเพิ่ม ไม่เลือกผลิตภัณฑ์ให้คุณ กองทุนและแผนลงทุนยังไม่รองรับ</p>
    <p>กำหนดเวลาตามกฎหมาย: ยังไม่ยืนยันสำหรับปี {taxYear} กรุณาตรวจสอบกับกรมสรรพากรก่อนทำรายการ</p>
    {savedPlan && <p role="status">สถานะแผน: {status === "completed" ? "ทำรายการครบแล้ว" : status === "needs-review" ? "ต้องตรวจสอบใหม่" : "วางแผนไว้"} · ความคืบหน้า {status === "completed" ? "1/1" : "0/1"}</p>}
    <form onSubmit={(e) => { e.preventDefault(); void save(false); }}>
      <fieldset className="form-controls" disabled={disabled || pending}>
        <legend className="sr-only">แผนประกันสุขภาพ</legend>
        <div className="worksheet-grid">
          <label>เบี้ยสุขภาพที่จะจ่ายเพิ่มจากข้อมูลภาษี (บาท)<input inputMode="decimal" value={draft.amount} onChange={(e) => set("amount", e.target.value)} /></label>
          <label>งบประมาณที่จ่ายเพิ่มได้ (บาท)<input inputMode="decimal" value={draft.budget} onChange={(e) => set("budget", e.target.value)} /></label>
          <label>สิทธิของรายการ<select value={draft.eligible} onChange={(e) => set("eligible", e.target.value as Answer)}><option value="unknown">ยังไม่ทราบ</option><option value="yes">เข้าเงื่อนไข</option><option value="no">ไม่เข้าเงื่อนไข</option></select></label>
        </div>
        <label><input type="checkbox" checked={draft.holding} onChange={(e) => set("holding", e.target.checked)} />ฉันตรวจและยอมรับเงื่อนไขระยะเวลาและการยกเลิกประกันแล้ว</label>
        <label><input type="checkbox" checked={draft.liquidity} onChange={(e) => set("liquidity", e.target.checked)} />ฉันจ่ายยอดนี้ได้โดยไม่กระทบเงินสำรองที่จำเป็น</label>
        <label><input type="checkbox" checked={draft.excludes} onChange={(e) => set("excludes", e.target.checked)} />ยอดนี้ยังไม่รวมในข้อมูลภาษีตั้งต้น จึงไม่ถูกนับซ้ำ</label>
        <details className="task-details">
          <summary>ติดตามการชำระและหลักฐาน</summary>
          <label>ยอดที่จ่ายจริงสำหรับแผนนี้ (บาท)<input inputMode="decimal" value={draft.actual} onChange={(e) => set("actual", e.target.value)} /></label>
          <label><input type="checkbox" checked={draft.paid} onChange={(e) => set("paid", e.target.checked)} />ฉันชำระยอดนี้แล้ว</label>
          <label>หลักฐานประกันสุขภาพของแผน<select value={draft.evidenceId} onChange={(e) => set("evidenceId", e.target.value)}><option value="">ยังไม่ได้เลือก</option>{records.map((r) => <option key={r.id} value={r.id}>{r.title} · {r.status === "reviewed" ? "ตรวจทานแล้ว" : "รอตรวจทาน"}</option>)}</select></label>
          <p>เพิ่มหลักฐานและไฟล์แนบในหน้าเอกสารก่อน ยอดจ่ายจริงต้องตรงกับยอดตามหลักฐานที่ตรวจทานแล้ว</p>
          <button type="button" onClick={() => void save(true)}>ยืนยันทำรายการครบแล้ว</button>
        </details>
        <button type="submit" className="btn-primary">บันทึกแผน</button>
      </fieldset>
    </form>
    {dirty && <p role="status">แผนมีการแก้ไขที่ยังไม่บันทึก ผลด้านล่างยังไม่รวมการแก้ไข</p>}
    {message && <p role="status">{message}</p>}
    {savedPlan && <>
      <p>ไม่จ่ายเพิ่ม: จ่ายเพิ่ม 0.00 บาท · ประหยัดภาษีเพิ่มเติม 0.00 บาท (ฐานเปรียบเทียบ ไม่ใช่ยอดภาษีที่ต้องชำระ)</p>
      <Estimate label="ตามแผนที่บันทึก" value={dirty ? null : estimates.projected} />
      <Estimate label="จากรายการที่ทำครบแล้ว" value={dirty ? null : estimates.actual} />
      {estimates.reasons.map((r) => <p key={r}>{r}</p>)}
      {status === "needs-review" && <><p>ข้อมูล เงื่อนไข หรือหลักฐานเปลี่ยน/ยังไม่ครบ โปรดตรวจและยืนยันใหม่</p><ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul></>}
      <p>การประหยัดภาษีไม่ใช่ผลตอบแทน เบี้ยประกันมีต้นทุนแม้ช่วยลดภาษี ตัวเลขไม่ใช่ยอดชำระหรือขอคืนและไม่ใช่สิทธิที่กรมสรรพากรรับรอง</p>
    </>}
  </section>;
}
