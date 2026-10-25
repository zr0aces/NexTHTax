import { emptyProfile, manifestSchema, profileSchema, taxYearDataSchema, yearSchema, type TaxYearData, type Workspace } from "./model";
import { getRules, importRules } from "./rules";

export function makeYear(year: number, selected?: string[]): TaxYearData {
  const profile = emptyProfile();
  if (selected) profile.selectedCategories = [...new Set(selected)];
  return { profile: profileSchema.parse(profile), records: [], rules: getRules(year) };
}

/** Only category choices can cross years; no figures, records, documents or rule approvals. */
export function addYear(workspace: Workspace, year: number, copySelected: boolean, sourceYear?: number): Workspace {
  yearSchema.parse(year);
  if (workspace.years[year]) throw new Error("มีปีภาษีนี้อยู่แล้ว");
  const years=manifestSchema.shape.years.safeParse([...workspace.manifest.years,year].sort((a,b)=>a-b));
  if (!years.success) throw new Error("เพิ่มปีไม่ได้: แฟ้มนี้มีจำนวนปีเกินขีดจำกัดที่รองรับ กรุณาสร้างแฟ้มใหม่");
  const source = workspace.years[sourceYear ?? Math.max(...workspace.manifest.years)];
  const data = makeYear(year, copySelected ? source?.profile.selectedCategories : undefined);
  if (copySelected && source) {
    const known = new Set(data.rules.rules.map(rule => rule.id));
    for (const rule of source.rules.rules) {
      if (rule.kind !== "documents" || known.has(rule.id) || !data.profile.selectedCategories.includes(rule.id)) continue;
      data.rules.rules.push({...structuredClone(rule),taxYear:year,status:"pending",cap:null,rateBps:null,sharedCap:null,effectiveFrom:`${year-543}-01-01`,effectiveTo:`${year-543}-12-31`,reviewedAt:"",version:`${year}.pending`,description:"หมวดกำหนดเอง จัดเก็บเอกสารเท่านั้น ไม่มีสิทธิลดหย่อนที่ยืนยันสำหรับปีนี้"});
    }
  }
  if (!taxYearDataSchema.safeParse(data).success) throw new Error("เพิ่มปีไม่ได้: หมวดที่คัดลอกเกินขีดจำกัด กรุณาเพิ่มปีโดยไม่คัดลอกหมวด");
  return {
    ...workspace,
    manifest: {...workspace.manifest, years: years.data},
    years: {...workspace.years, [year]: data},
  };
}


const ruleMeaning = (rule: TaxYearData["rules"]["rules"][number]) => {
  const {reviewedAt, version, sources, name, ...meaning}=rule;
  return JSON.stringify(meaning);
};

/** Called only after the UI has previewed the difference and obtained explicit consent. */
export function replaceYearRules(data: TaxYearData, input: TaxYearData["rules"]): TaxYearData {
  const rules=importRules(input,data.rules.taxYear);
  const nextById=new Map(rules.rules.map(rule=>[rule.id,rule]));
  const previousById=new Map(data.rules.rules.map(rule=>[rule.id,rule]));
  for (const record of data.records) {
    if (!nextById.has(record.categoryId)) throw new Error("ชุดกฎใหม่ลบหมวดที่ยังมีรายการ กรุณาจัดการรายการก่อนเปลี่ยนชุดกฎ");
  }
  const sameSharedCaps=JSON.stringify(Object.entries(data.rules.sharedCaps).sort())===JSON.stringify(Object.entries(rules.sharedCaps).sort());
  const sameRules=rules.rules.length===data.rules.rules.length && rules.rules.every(rule=>previousById.has(rule.id) && ruleMeaning(previousById.get(rule.id)!)===ruleMeaning(rule));
  const sameBrackets=JSON.stringify(rules.brackets)===JSON.stringify(data.rules.brackets);
  if (sameSharedCaps && sameRules && sameBrackets && rules.status===data.rules.status && JSON.stringify(rules.notes)===JSON.stringify(data.rules.notes)) return data;
  const records=data.records.map(record=>{
    const rule=nextById.get(record.categoryId)!;
    const previous=previousById.get(record.categoryId);
    const changed=!sameSharedCaps || !previous || ruleMeaning(previous)!==ruleMeaning(rule);
    if (!changed) return record;
    const checklist=[...new Set(record.checklist.filter(item=>rule.documents.includes(item)))];
    const documentStatus=record.attachments.length===0 ? "none" : rule.documents.every(item=>checklist.includes(item)) ? "complete" : "partial";
    const eligibility=record.eligibility==="ineligible" ? "ineligible" : rule.status==="verified" ? "unchecked" : "pending";
    return {...record,checklist,documentStatus,eligibility} as typeof record;
  });
  return {...data,rules,records};
}
