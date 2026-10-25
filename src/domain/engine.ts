import { newId, type RuleSet, type TaxRule, type TaxRecord, type TaxYearData } from "./model";
import { countedChildCount, countIsUsable, fixedAllowanceTotal, isActiveOn, isCountableRecord, isCountedFamily } from "./fixed-allowances";

export interface CategoryResult { ruleId: string; paid: number; eligible: number; allowed: number; remaining: number | null; pending: number; excess: number; }
export interface Calculation {
  categories: CategoryResult[]; income: number | null; expense: number; personal: number; deductions: number;
  netIncome: number | null; taxBefore: number | null; taxAfter: number | null; taxSaved: number | null;
  withholdingBalance: number | null; warnings: string[];
}
const ratio = (amount: number, bps: number) => Number(BigInt(Math.max(0, Math.floor(amount))) * BigInt(bps) / 10000n);
const sum = (values: number[]) => values.reduce((a,b) => a+b, 0);

/** Satang intermediates; final PIT fraction below one baht is exempt (Decree 10/2500 s.5). */
export function progressiveTax(net: number, rules: RuleSet): number {
  if (!Number.isSafeInteger(net) || net < 0) throw new Error("เงินได้สุทธิไม่ถูกต้อง");
  let previous = 0;
  let taxNumerator = 0n;
  for (const bracket of rules.brackets) {
    const taxable = Math.max(0, Math.min(net, bracket.upTo ?? net) - previous);
    taxNumerator += BigInt(taxable) * BigInt(bracket.rateBps);
    if (bracket.upTo === null || net <= bracket.upTo) break;
    previous = bracket.upTo;
  }
  return Number(taxNumerator / 1_000_000n) * 100;
}

export function calculate(data: TaxYearData): Calculation {
  const { profile, rules, records } = data;
  const income = profile.income;
  const warnings = [...rules.notes];
  const personalRule = rules.rules.find(r => r.id === "personal" && r.formula === "fixed" && isActiveOn(r, `${rules.taxYear - 543}-12-31`));
  const personal = personalRule?.cap ?? 0;
  const salaryRule = rules.rules.find(r => r.formula === "salary" && r.kind === "expense" && isActiveOn(r, `${rules.taxYear - 543}-12-31`));
  const expense = income === null ? 0 : profile.incomeType === "salary" ? (salaryRule ? Math.min(salaryRule.cap ?? income, ratio(income, salaryRule.rateBps ?? 0)) : 0) : Math.min(income, profile.manualExpense ?? 0);
  const sharedUsed = new Map<string, number>();
  const categoryResults = new Map<string,CategoryResult>();
  const carrySources = new Set<string>();
  let deductions = 0;
  let specialDonations = 0;
  const base = income === null ? null : Math.max(0, income - expense - personal);
  const childCount = countedChildCount(records, rules.taxYear);
  const sharedRemaining = (key: string) => Math.max(0, (Object.hasOwn(rules.sharedCaps,key) ? rules.sharedCaps[key] : 0) - (sharedUsed.get(key) ?? 0));
  const useShared = (key: string, value: number) => { sharedUsed.set(key, (sharedUsed.get(key) ?? 0) + value); };

  for (const rule of [...rules.rules].sort((a,b) => a.order-b.order)) {
    const rows = records.filter(record => record.categoryId === rule.id);
    const result: CategoryResult = {ruleId:rule.id, paid:sum(rows.map(r => r.amount)), eligible:0, allowed:0, remaining:rule.cap, pending:0, excess:0};
    categoryResults.set(rule.id, result);
    if (rule.kind === "documents" || rule.kind === "expense" || rule.formula === "fixed") {
      if (rule.id === "personal") { result.allowed=personal; result.eligible=personal; result.remaining=0; }
      continue;
    }
    let validRows = rows.filter(record => isCountableRecord(record, rule, rules.taxYear));
    result.pending = sum(rows.filter(record => record.eligibility !== "ineligible" && !validRows.includes(record)).map(r => r.amount));
    if (rule.status !== "verified") { result.remaining=null; result.excess=Math.max(0,result.paid-result.pending); continue; }
    if (isCountedFamily(rule.id) || rule.id === "housing" || rule.id === "spouse") {
      if (validRows.length > 1) {
        result.pending += sum(validRows.slice(1).map(r => r.amount));
        warnings.push(`${rule.name}: รุ่นนี้ใช้หนึ่งรายการรวมทั้งปี รายการซ้ำไม่ถูกนับ กรุณาเปิดตรวจรายการซ้ำและเลือกรายการหลักให้เหลือหนึ่งรายการ`);
        validRows = validRows.slice(0,1);
      }
    }
    let cap = rule.cap ?? Number.MAX_SAFE_INTEGER;
    if (isCountedFamily(rule.id)) {
      const count = validRows[0]?.facts.qualifyingCount;
      if (!countIsUsable(rule.id, count, childCount)) {
        result.pending += sum(validRows.map(r => r.amount)); result.remaining=null;
        if (validRows.length) warnings.push(`${rule.name}: ต้องระบุจำนวนผู้เข้าเกณฑ์และตรวจสิทธิที่เกี่ยวข้องก่อนคำนวณ`);
        continue;
      }
      cap = fixedAllowanceTotal(rule.id, rule.cap ?? 0, count);
      result.eligible=cap;
    } else if (rule.id === "spouse") {
      result.eligible=validRows.length ? cap : 0;
    } else if (rule.id === "housing" && validRows[0]) {
      const n=validRows[0].facts.coBorrowers ?? 1;
      cap=Math.floor(cap/n);
      result.eligible=Math.floor(Math.min(validRows[0].amount,validRows[0].eligibleAmount ?? validRows[0].amount)/n);
    } else {
      result.eligible = sum(validRows.map(r => Math.min(r.amount,r.eligibleAmount ?? r.amount)));
    }
    if (["gpf","provident"].includes(rule.id) && profile.incomeType !== "salary") {
      result.pending+=result.eligible; result.remaining=null;
      warnings.push(`${rule.name}: ต้องทราบฐานเงินเดือน/ค่าจ้างที่ใช้สะสม รุ่นนี้ไม่ใช้รายได้ประเภทอื่นแทนเงินเดือน`); continue;
    }
    if (rule.formula === "esgx-carry") {
      result.eligible=0;
      for (const row of validRows) {
        const f=row.facts;
        const transfer=f.carryTransfer;
        const first=f.carryFirstYearUsed;
        if (!f.carryProofConfirmed || !f.carrySourceId || transfer === undefined || first === undefined || carrySources.has(f.carrySourceId) || transfer > 50_000_000 || first !== Math.min(transfer,30_000_000) || rules.taxYear < 2569 || rules.taxYear > 2572) {
          result.pending+=row.amount;
          warnings.push("Thai ESGX ต่อเนื่อง: ต้องตรวจหลักฐานยอดสับเปลี่ยนและสิทธิปี 2568 ให้ตรงกัน แหล่งเดียวห้ามใช้ซ้ำ; กรณีใช้สิทธิปีแรกไม่เต็มเพดานยังไม่คำนวณอัตโนมัติ");
          continue;
        }
        carrySources.add(f.carrySourceId);
        result.eligible+=Math.min(row.amount,row.eligibleAmount ?? row.amount,Math.floor((transfer-first)/4));
      }
    }
    if (rule.formula === "pension") {
      let lifeRequested=0;
      for (const row of validRows) {
        const eligible=Math.min(row.amount,row.eligibleAmount ?? row.amount);
        const allocation=row.facts.pensionLifeAllocation ?? Math.min(eligible,Math.max(0,sharedRemaining("life-health")-lifeRequested));
        lifeRequested+=Math.min(eligible,allocation);
      }
      const lifeAllowed=Math.min(lifeRequested,sharedRemaining("life-health"));
      useShared("life-health",lifeAllowed);
      const retirementEligible=Math.max(0,result.eligible-lifeRequested);
      const retirementCap=income === null ? null : Math.min(cap,ratio(income,rule.rateBps ?? 0),sharedRemaining("retirement"));
      const retirementAllowed=retirementCap === null ? 0 : Math.min(retirementEligible,retirementCap);
      if (retirementCap === null) result.pending+=retirementEligible;
      useShared("retirement",retirementAllowed);
      result.allowed=lifeAllowed+retirementAllowed;
      result.remaining=retirementCap === null ? null : Math.max(0,retirementCap-retirementAllowed);
    } else if (rule.formula === "donation") {
      if (base === null) { result.pending+=result.eligible; result.remaining=null; continue; }
      const beforeDonations=Math.max(0,base-(deductions-specialDonations));
      const donationBase=rule.multiplier > 1 ? beforeDonations : Math.max(0,base-deductions);
      cap=Math.min(rule.cap ?? Number.MAX_SAFE_INTEGER,ratio(donationBase,rule.rateBps ?? 0));
      if (rule.multiplier > 1) cap=Math.max(0,cap-specialDonations);
      result.allowed=Math.min(result.eligible*rule.multiplier,cap);
      result.remaining=Math.max(0,cap-result.allowed);
      if (rule.multiplier > 1) specialDonations+=result.allowed;
    } else {
      if (rule.rateBps !== null) {
        if (income === null) { result.pending+=result.eligible; result.remaining=null; continue; }
        cap=Math.min(cap,ratio(income,rule.rateBps));
      }
      if (rule.sharedCap) cap=Math.min(cap,sharedRemaining(rule.sharedCap));
      result.allowed=Math.min(result.eligible,cap);
      result.remaining=cap === Number.MAX_SAFE_INTEGER ? null : Math.max(0,cap-result.allowed);
      if (rule.sharedCap) useShared(rule.sharedCap,result.allowed);
    }
    result.excess=Math.max(0,result.paid-result.pending-(rule.formula === "donation" ? Math.floor(result.allowed/rule.multiplier) : result.allowed));
    deductions+=result.allowed;
  }
  // Reconcile each shared remainder after ALL claims; never present independent pots to add.
  for (const rule of rules.rules) {
    const result=categoryResults.get(rule.id)!;
    if (rule.formula === "pension" && result.remaining !== null) result.remaining=Math.min(result.remaining,sharedRemaining("retirement"));
    if (!rule.sharedCap || rule.formula === "pension" || rule.formula === "donation" || result.remaining === null) continue;
    result.remaining=Math.min(result.remaining,sharedRemaining(rule.sharedCap));
  }
  for (const rule of rules.rules.filter(r => r.formula === "donation" && r.multiplier > 1)) {
    const result=categoryResults.get(rule.id)!;
    if (base !== null && result.remaining !== null) result.remaining=Math.min(result.remaining,Math.max(0,ratio(Math.max(0,base-(deductions-specialDonations-(categoryResults.get("donation")?.allowed ?? 0))),rule.rateBps ?? 0)-specialDonations));
  }
  const canEstimate=income !== null && rules.brackets.length>0 && (profile.incomeType !== "salary" || salaryRule !== undefined) && personalRule !== undefined && (profile.incomeType === "salary" || profile.manualExpense !== null);
  const netIncome=canEstimate ? Math.max(0,income!-expense-personal-deductions) : null;
  const taxBefore=canEstimate ? progressiveTax(Math.max(0,income!-expense-personal),rules) : null;
  const taxAfter=netIncome === null ? null : progressiveTax(netIncome,rules);
  if (income === null) warnings.push("กรอกรายได้เพื่อคำนวณวงเงินตามสัดส่วน");
  if (profile.incomeType === "other") warnings.push("รายได้อื่น/หลายประเภท: ค่าใช้จ่ายต้องระบุเอง ประมาณเฉพาะอัตราก้าวหน้า ไม่ครอบคลุมภาษีขั้นต่ำตามมาตรา 48(2) หรือ ภ.ง.ด.90 ทุกกรณี");
  if (rules.status === "pending") warnings.push("กฎภาษีปีนี้ยังไม่ยืนยัน");
  return {categories:[...categoryResults.values()],income,expense,personal,deductions,netIncome,taxBefore,taxAfter,taxSaved:taxBefore === null || taxAfter === null ? null : taxBefore-taxAfter,withholdingBalance:taxAfter === null || profile.withholding === null ? null : taxAfter-profile.withholding,warnings:[...new Set(warnings)]};
}

export function simulate(data: TaxYearData, ruleId: string, amount: number): Calculation {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("ยอดจำลองไม่ถูกต้อง");
  const rule=data.rules.rules.find(r => r.id===ruleId);
  if (!rule || rule.status!=="verified" || !["rmf","life","health","pension"].includes(ruleId)) throw new Error("หมวดนี้ยังไม่รองรับการจำลอง");
  const record: TaxRecord={id:newId(),categoryId:ruleId,title:"รายการจำลอง — ไม่ใช่รายการจริง",amount,date:`${data.rules.taxYear-543}-12-31`,eligibleAmount:null,provider:"",reference:"",note:"",documentStatus:"none",eligibility:"confirmed",checklist:[],attachments:[],facts:{}};
  return calculate({...data,records:[...data.records,record]});
}
