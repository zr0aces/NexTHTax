import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseBahtInput, formatSatang } from "../domain/money";
import { numericBlockers, type AnyRuleBundle } from "../domain/rules";
import type { Manifest, RecordEntry } from "../domain/schema";
import { TaxPlanPanel, type TaxPlanPanelProps } from "./TaxPlanPanel";
import { calculateSalaryCase, type Answer, type SalaryCaseResult } from "../domain/tax";
import {
  confirmationState,
  salaryInputFromWorksheet,
  sourceProjection,
  worksheetProjection,
  type ConfirmationState,
  type TaxInputs,
} from "../domain/taxInputs";
import { sha256Hex } from "../storage/hash";

const ANSWER_LABEL: Record<Answer, string> = { yes: "ใช่", no: "ไม่ใช่", unknown: "ยังไม่ทราบ" };
const CONFIRMATION_LABEL: Record<ConfirmationState, string> = {
  unconfirmed: "ยังไม่ได้ยืนยัน",
  confirmed: "ยืนยันแล้วตามข้อมูลที่บันทึก",
  "needs-reconfirmation": "ข้อมูลหรือรายการต้นทางเปลี่ยน ต้องยืนยันใหม่",
};

export const TAX_CAVEATS: readonly string[] = [
  "ตัวเลขเป็นการประมาณจากข้อมูลที่กรอกและกฎที่ปักไว้ ไม่ใช่การยื่นแบบและไม่ใช่คำรับรองความถูกต้องทางกฎหมาย",
  "ภาษีตามขั้นบันไดยังไม่ใช่ยอดชำระ ยอดภาษีสุดท้าย ยอดชำระเพิ่ม และยอดขอคืนยังไม่แสดงจนกว่ากฎการปัดเศษจะได้รับการยืนยัน",
  "หักภาษี ณ ที่จ่ายเป็นเครดิตในการชำระภาษี ไม่ได้ลดเงินได้สุทธิ",
  "การประหยัดภาษีจากค่าลดหย่อนไม่ใช่ผลตอบแทนการลงทุน และไม่รวมค่าธรรมเนียม ผลตอบแทน ความเสี่ยงของตลาด หรือค่าปรับจากการขายก่อนกำหนด",
  "ระบบไม่แนะนำกองทุนหรือกรมธรรม์ใด ไม่สั่งซื้อให้ และไม่รับประกันผลตอบแทนหรือความถูกต้องของผลคำนวณ",
  "ยังไม่รองรับการคำนวณค่าลดหย่อนคู่สมรส บุตร กองทุนเกษียณ เบี้ยประกันชีวิต เงินบริจาค หรือเครดิตภาษี",
  "ข้อมูลภาษีถูกเก็บในโฟลเดอร์ที่คุณเลือกเท่านั้น ไม่ส่งไปยังเซิร์ฟเวอร์",
];

interface Draft {
  salary: string;
  withheld: string;
  socialSecurity: string;
  health: string;
  eligibilityConfirmed: boolean;
  age: string;
  dependents: string;
  resident: Answer;
  married: Answer;
  elderly: Answer;
  otherClaims: Answer;
  otherIncome: Answer;
  incomeDone: boolean;
  deductionsDone: boolean;
}

interface Props {
  manifest: Manifest;
  taxYear: number;
  bundle: AnyRuleBundle | null;
  ruleDigest: string | null;
  onSave: (taxInputs: TaxInputs) => Promise<void>;
  disabled?: boolean;
  onUnsavedChange?: (dirty: boolean) => void;
  onSavePlan?: TaxPlanPanelProps["onSave"];
  onVerifyPlanEvidence?: TaxPlanPanelProps["onVerifyEvidence"];
  trustedRules?: boolean;
  planDisabled?: boolean;
}

const amountText = (satang: number | null | undefined): string => (satang === null || satang === undefined ? "" : formatSatang(satang));

function draftFrom(saved: TaxInputs | null): Draft {
  const salaryItem = saved?.incomeItems.find((i) => i.kind === "salary");
  const health = saved?.deductions.find((d) => d.subcategory === "insurance_health");
  const ss = saved?.deductions.find((d) => d.category === "deduction_social_security");
  const mapped = salaryInputFromWorksheet(saved);
  return {
    salary: amountText(salaryItem?.grossAmountSatang),
    withheld: amountText(salaryItem?.withheldAmountSatang),
    socialSecurity: amountText(ss?.existingContributionSatang),
    health: amountText(health?.existingContributionSatang),
    eligibilityConfirmed: [health, ss].some((d) => d?.eligibility === "yes"),
    age: saved?.facts.ageAtYearEnd?.toString() ?? "",
    dependents: saved?.facts.dependentClaimCount?.toString() ?? "",
    resident: saved?.facts.resident ?? "unknown",
    married: saved?.facts.married ?? "unknown",
    elderly: saved?.facts.elderlyOrDisabled ?? "unknown",
    otherClaims: mapped?.otherDeductionClaims ?? "unknown",
    otherIncome: mapped?.otherIncome ?? "unknown",
    incomeDone: saved?.incomeComplete === "yes",
    deductionsDone: saved?.deductionsComplete === "yes",
  };
}

/** Builds the persisted worksheet from the draft. Confirmations are always cleared on save. */
function buildTaxInputs(d: Draft, prev: TaxInputs | null, records: RecordEntry[], taxYear: number): { value: TaxInputs | null; errors: string[] } {
  const errors: string[] = [];
  // Imported worksheets may be richer than this deliberately narrow form. Never flatten hidden facts.
  if (prev) {
    const salaryItems = prev.incomeItems.filter((i) => i.kind === "salary");
    const otherItems = prev.incomeItems.filter((i) => i.kind !== "salary");
    const unsupportedIncome = prev.incomeItems.some((i) => {
      if (i.electionGroup !== null) return true;
      if (i.kind === "salary") return i.treatment !== "progressive";
      return i.kind !== "domestic-interest" || i.treatment !== "unknown" ||
        i.grossAmountSatang !== null || i.withheldAmountSatang !== null || i.sourceRecordIds.length > 0;
    });
    const healthItems = prev.deductions.filter((i) => i.category === "deduction_insurance" && i.subcategory === "insurance_health");
    const socialItems = prev.deductions.filter((i) => i.category === "deduction_social_security" && i.subcategory === null);
    const hiddenDeductions = healthItems.length + socialItems.length !== prev.deductions.length || prev.deductions.some((i) => i.sourceRecordIds.length > 0);
    if (salaryItems.length > 1 || otherItems.length > 1 || unsupportedIncome || hiddenDeductions ||
        healthItems.length > 1 || socialItems.length > 1 ||
        prev.facts.separateFiling !== "unknown" || prev.facts.spouseHasIncome !== "unknown") {
      return { value: null, errors: ["ข้อมูลที่นำเข้ามีรายละเอียดเกินหน้าจอแบบง่าย จึงไม่บันทึกทับข้อมูลเดิม กรุณาเก็บต้นฉบับไว้และใช้ผู้เชี่ยวชาญตรวจสอบ"] };
    }
  }
  const money = (text: string, label: string): number | null => {
    const r = parseBahtInput(text);
    if (!r.ok) {
      errors.push(`${label}: รูปแบบจำนวนเงินไม่ถูกต้อง`);
      return null;
    }
    return r.satang;
  };
  const salary = money(d.salary, "เงินเดือนรวมทั้งปี");
  const withheld = money(d.withheld, "ภาษีหัก ณ ที่จ่าย");
  const socialSecurity = money(d.socialSecurity, "เงินสมทบประกันสังคม");
  const health = money(d.health, "เบี้ยประกันสุขภาพ");
  const age = d.age.trim() === "" ? null : Number(d.age);
  if (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) errors.push("อายุไม่ถูกต้อง");
  const dependents = d.dependents.trim() === "" ? null : Number(d.dependents);
  if (dependents !== null && (!Number.isInteger(dependents) || dependents < 0 || dependents > 100)) errors.push("จำนวนบุตรไม่ถูกต้อง");
  if (errors.length > 0) return { value: null, errors };

  const salaryRecordIds = records
    .filter((r) => r.taxYear === taxYear && r.category === "income_salary" && r.trashedAt === null && r.status !== "excluded")
    .map((r) => r.id);
  const eligibility = d.eligibilityConfirmed ? "yes" : "unknown";
  const prevSalary = prev?.incomeItems.find((i) => i.kind === "salary");
  const prevOther = prev?.incomeItems.find((i) => i.kind !== "salary");
  const prevHealth = prev?.deductions.find((x) => x.subcategory === "insurance_health");
  const prevSs = prev?.deductions.find((x) => x.category === "deduction_social_security");
  const incomeItems: TaxInputs["incomeItems"] = [
    {
      id: prevSalary?.id ?? crypto.randomUUID(),
      sourceRecordIds: salaryRecordIds,
      kind: "salary",
      grossAmountSatang: salary,
      withheldAmountSatang: withheld,
      treatment: "progressive",
      electionGroup: null,
    },
  ];
  if (d.otherIncome === "yes") {
    incomeItems.push({
      id: prevOther?.id ?? crypto.randomUUID(),
      sourceRecordIds: [],
      kind: "domestic-interest",
      grossAmountSatang: null,
      withheldAmountSatang: null,
      treatment: "unknown",
      electionGroup: null,
    });
  }
  const deductions: TaxInputs["deductions"] = [
    {
      id: prevHealth?.id ?? crypto.randomUUID(),
      sourceRecordIds: [],
      category: "deduction_insurance",
      subcategory: "insurance_health",
      existingContributionSatang: health,
      eligibility,
    },
    {
      id: prevSs?.id ?? crypto.randomUUID(),
      sourceRecordIds: [],
      category: "deduction_social_security",
      subcategory: null,
      existingContributionSatang: socialSecurity,
      eligibility,
    },
  ];
  const incomeDone = d.incomeDone ? "yes" : "unknown";
  const deductionsDone = d.deductionsDone ? "yes" : "unknown";
  return {
    value: {
      incomeItems,
      deductions,
      facts: {
        resident: d.resident,
        ageAtYearEnd: age,
        elderlyOrDisabled: d.elderly,
        married: d.married,
        separateFiling: "unknown",
        spouseHasIncome: "unknown",
        dependentClaimCount: dependents,
      },
      incomeComplete: incomeDone,
      withholdingComplete: incomeDone,
      deductionsComplete: deductionsDone,
      finalTaxGroupsComplete: deductionsDone,
      confirmedSourcesDigest: null,
      confirmedWorksheetDigest: null,
    },
    errors: [],
  };
}

function describeResult(result: SalaryCaseResult | null): ReactNode {
  if (!result) return null;
  if (result.status === "incomplete") return <p>ยังขาดข้อมูล: {result.missing.join(", ")}</p>;
  if (result.status === "unsupported") {
    return (
      <div role="status">
        <p>ยังไม่รองรับการคำนวณกรณีนี้:</p>
        <ul>{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    );
  }
  return (
    <div>
      <table>
        <caption>รายการระหว่างคำนวณ (บาท)</caption>
        <tbody>
          {result.lines.map((l) => (
            <tr key={l.id}>
              <th scope="row">{l.labelTh}</th>
              <td>{formatSatang(l.amountSatang)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">ภาษีตามขั้นบันได (ก่อนปัดเศษ ยังไม่ใช่ยอดชำระ)</th>
            <td>{formatSatang(result.taxBeforeRoundingSatang)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TaxWorksheet({ manifest, taxYear, bundle, ruleDigest, onSave, disabled = false, onUnsavedChange, onSavePlan, onVerifyPlanEvidence, trustedRules = false, planDisabled = false }: Props) {
  const records = manifest.records;
  const saved: TaxInputs | null = manifest.years[String(taxYear)]?.taxInputs ?? null;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(saved));
  const [savedKey, setSavedKey] = useState(() => JSON.stringify(saved));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [digests, setDigests] = useState<{ sources: string; worksheet: string } | null>(null);
  const [planDirty, setPlanDirty] = useState(false);

  // Re-seed the draft only when the persisted worksheet changes, so typing is never overwritten.
  const currentKey = JSON.stringify(saved);
  useEffect(() => {
    if (currentKey !== savedKey) {
      setSavedKey(currentKey);
      setDraft(draftFrom(saved));
    }
  }, [currentKey, savedKey, saved, records, taxYear]);

  useEffect(() => {
    let cancelled = false;
    if (!saved) {
      setDigests(null);
      return;
    }
    (async () => {
      const sourcesDigest = await sha256Hex(new TextEncoder().encode(sourceProjection(records, taxYear)));
      const worksheetDigest = await sha256Hex(
        new TextEncoder().encode(worksheetProjection(saved, { taxYear, sourcesDigest, ruleDigest, engineVersion: 1 })),
      );
      if (!cancelled) setDigests({ sources: sourcesDigest, worksheet: worksheetDigest });
    })().catch(() => {
      if (!cancelled) setDigests(null);
    });
    return () => {
      cancelled = true;
    };
  }, [currentKey, records, taxYear, ruleDigest, saved]);

  const confirmation: ConfirmationState = digests
    ? confirmationState(saved, { sourcesDigest: digests.sources, worksheetDigest: digests.worksheet })
    : "unconfirmed";
  const mapped = useMemo(() => salaryInputFromWorksheet(saved), [saved]);
  const result = mapped ? calculateSalaryCase(bundle, mapped) : null;
  const blockers = numericBlockers(bundle);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(saved));

  useEffect(() => {
    onUnsavedChange?.(dirty || planDirty);
    return () => onUnsavedChange?.(false);
  }, [dirty, planDirty, onUnsavedChange]);

  const save = async () => {
    if (disabled || pending) return;
    const built = buildTaxInputs(draft, saved, records, taxYear);
    if (!built.value) {
      setMessage(built.errors.join("; "));
      return;
    }
    setPending(true);
    try {
      await onSave(built.value);
      setMessage("บันทึกข้อมูลภาษีแล้ว ต้องยืนยันใหม่ก่อนใช้ผลคำนวณ");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "บันทึกข้อมูลภาษีไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    if (!saved || !digests || dirty || disabled || pending) return;
    setPending(true);
    try {
      await onSave({ ...saved, confirmedSourcesDigest: digests.sources, confirmedWorksheetDigest: digests.worksheet });
      setMessage("ยืนยันตามข้อมูลที่บันทึกแล้ว การยืนยันนี้ใช้ตรวจการเปลี่ยนแปลงเท่านั้น");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "ยืนยันไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  };

  const answer = (key: keyof Draft, text: string) => (
    <label>
      {text}
      <select value={draft[key] as Answer} onChange={(e) => set(key, e.target.value as Draft[typeof key])}>
        {(["unknown", "yes", "no"] as const).map((a) => (
          <option key={a} value={a}>{ANSWER_LABEL[a]}</option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby="worksheet-title" className="worksheet-card card">
      <h2 id="worksheet-title">คำนวณและวางแผนภาษี ปี {taxYear}</h2>
      <p>สำหรับผู้มีเงินเดือน โสด และเป็นผู้มีถิ่นที่อยู่ในไทย กรณีอื่นจะแจ้งว่ายังไม่รองรับ</p>
      <p className="warning">เป็นเครื่องมือประมาณการ ไม่ใช่การยื่นภาษี ยังไม่แสดงยอดชำระหรือขอคืนจนกว่ากฎจะยืนยันครบ</p>
      <details className="task-details">
      <summary>ขอบเขตและข้อควรรู้ก่อนใช้</summary>
      <ul aria-label="ข้อจำกัดของการคำนวณ">
        {TAX_CAVEATS.map((c) => <li key={c}>{c}</li>)}
      </ul>
      </details>
      <h3>1. กรอกข้อมูลภาษีเงินเดือน</h3>
      <p className="muted">ช่องที่ว่างหมายถึงยังไม่ทราบ ไม่ใช่ 0 กรอก 0 หากไม่มีรายการนั้นจริง</p>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset className="form-controls" disabled={disabled || pending}>
        <legend className="sr-only">ข้อมูลภาษีเงินเดือน</legend>
        <fieldset>
          <legend>เงินได้และภาษีหัก ณ ที่จ่าย</legend>
          <div className="worksheet-grid">
            <label>เงินเดือนรวมทั้งปี (บาท)<input inputMode="decimal" value={draft.salary} onChange={(e) => set("salary", e.target.value)} /></label>
            <label>ภาษีหัก ณ ที่จ่ายรวม (บาท)<input inputMode="decimal" value={draft.withheld} onChange={(e) => set("withheld", e.target.value)} /></label>
          </div>
          <label>
            <input type="checkbox" checked={draft.incomeDone} onChange={(e) => set("incomeDone", e.target.checked)} />
            รายได้และภาษีหัก ณ ที่จ่ายครบแล้ว
          </label>
        </fieldset>

        <fieldset>
          <legend>ค่าลดหย่อนภาษี</legend>
          <div className="worksheet-grid">
            <label>เงินสมทบประกันสังคมที่จ่ายจริง (บาท)<input inputMode="decimal" value={draft.socialSecurity} onChange={(e) => set("socialSecurity", e.target.value)} /></label>
            <label>เบี้ยประกันสุขภาพที่จ่ายจริง (บาท)<input inputMode="decimal" value={draft.health} onChange={(e) => set("health", e.target.value)} /></label>
          </div>
          <label>
            <input type="checkbox" checked={draft.eligibilityConfirmed} onChange={(e) => set("eligibilityConfirmed", e.target.checked)} />
            ยืนยันว่ารายการหักที่กรอกจ่ายจริงและเข้าเงื่อนไข
          </label>
          <label>
            <input type="checkbox" checked={draft.deductionsDone} onChange={(e) => set("deductionsDone", e.target.checked)} />
            รายการลดหย่อนครบแล้ว
          </label>
        </fieldset>

        <fieldset>
          <legend>สถานะส่วนบุคคลและครอบครัว</legend>
          <div className="worksheet-grid">
            <label>อายุ ณ สิ้นปีภาษี<input inputMode="numeric" value={draft.age} onChange={(e) => set("age", e.target.value)} /></label>
            <label>จำนวนบุตรหรือผู้อยู่ในอุปการะที่จะขอหัก<input inputMode="numeric" value={draft.dependents} onChange={(e) => set("dependents", e.target.value)} /></label>
          </div>
          <div className="worksheet-grid">
            {answer("resident", "อยู่ในประเทศไทยตลอดปีภาษี")}
            {answer("married", "มีสถานภาพสมรส")}
            {answer("elderly", "อายุ 65 ปีขึ้นไปหรือเป็นคนพิการ")}
            {answer("otherIncome", "มีรายได้อื่นนอกจากเงินเดือน (ดอกเบี้ย เงินปันผล ฯลฯ)")}
            {answer("otherClaims", "มีรายการลดหย่อนอื่น (ชีวิต กองทุน บริจาค ฯลฯ)")}
          </div>
        </fieldset>

        <div className="actions" style={{ marginTop: "16px" }}>
          <button type="button" className="btn-primary" onClick={() => void save()}>บันทึกข้อมูลภาษี</button>
          {saved && <button type="button" disabled={!digests || dirty} onClick={() => void confirm()}>ยืนยันข้อมูลที่บันทึกแล้ว</button>}
        </div>
        </fieldset>
      </form>
      {dirty && <p role="status">มีการแก้ไขที่ยังไม่บันทึก</p>}
      {message && <p role="status">{message}</p>}
      {saved && <p role="status">สถานะการยืนยัน: {CONFIRMATION_LABEL[confirmation]}</p>}
      {!saved && <p>ยังไม่มีข้อมูลภาษีที่บันทึกสำหรับปีนี้</p>}
      <h3>2. ตรวจผลจากข้อมูลที่บันทึก</h3>
      {dirty && <p>ผลด้านล่างยังใช้ข้อมูลที่บันทึกครั้งก่อน บันทึกการแก้ไขก่อนเปรียบเทียบแผน</p>}
      {describeResult(result)}
      <p role="status">
        ยอดภาษีสุดท้าย ยอดชำระเพิ่ม และยอดขอคืน ยังไม่แสดง
        {blockers.length > 0 && <>: {blockers.join("; ")}</>}
      </p>

      {onSavePlan && onVerifyPlanEvidence && <TaxPlanPanel
        manifest={manifest} taxYear={taxYear} bundle={bundle} ruleDigest={ruleDigest}
        trustedRules={trustedRules} disabled={disabled || pending || dirty || planDisabled}
        onUnsavedChange={setPlanDirty} onSave={onSavePlan} onVerifyEvidence={onVerifyPlanEvidence}
      />}

    </section>
  );
}
