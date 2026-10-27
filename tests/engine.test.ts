import { describe, it, expect } from "vitest";
import { calculate, progressiveTax, simulate } from "../src/domain/engine";
import { getRules, importRules } from "../src/domain/rules";
import { makeYear, addYear, replaceYearRules } from "../src/domain/workspace";
import { newId, type TaxRecord, type TaxYearData, type Workspace } from "../src/domain/model";
import { readFile } from "node:fs/promises";
import { importZip, exportZip } from "../src/storage/zip";
const B=(value:number)=>Math.round(value*100);
function year(income:number|null=1_000_000):TaxYearData { const data=makeYear(2569);data.profile.income=income===null?null:B(income);return data; }
function rec(categoryId:string,amount:number,facts:TaxRecord["facts"]={},extra:Partial<TaxRecord>={}):TaxRecord {return {id:newId(),categoryId,title:"ตัวอย่าง",amount:B(amount),date:"2026-06-01",eligibleAmount:null,provider:"",reference:"",note:"",documentStatus:"none",eligibility:"confirmed",checklist:[],attachments:[],facts,...extra};}
function category(data:TaxYearData,id:string){return calculate(data).categories.find(c=>c.ruleId===id)!;}

describe("อัตราภาษีและฐานเปรียบเทียบ",()=>{
 const rules=getRules(2569);
 it.each([[0,0],[150000,0],[300000,7500],[500000,27500],[750000,65000],[1000000,115000],[2000000,365000],[5000000,1265000],[5000100,1265035]])("เงินได้สุทธิ %s",(net,tax)=>expect(progressiveTax(B(net),rules)).toBe(B(tax)));
 it("ขอบขั้น +หนึ่งบาทไม่คิดอัตราสูงกับเงินทั้งหมด และยกเว้นเศษภาษีต่ำกว่าบาท",()=>expect(progressiveTax(B(300001),rules)).toBe(B(7500)));
 it("ใช้สตางค์ ไม่ใช้ float คูณอัตราสูงสุด",()=>expect(progressiveTax(B(300000)+1,rules)).toBe(B(7500)));
 it.each([[300009,7500],[300010,7501],[300019.99,7501],[300020,7502]])("ภาษีสุดท้ายตัดเศษบาท ไม่ปัดใกล้สุด: เงินได้%s",(net,tax)=>expect(progressiveTax(B(net),rules)).toBe(B(tax)));
 it("เงินเดือนหักค่าใช้จ่ายและส่วนตัวในฐานก่อน/หลังเท่ากัน",()=>{const out=calculate(year());expect(out.expense).toBe(B(100000));expect(out.personal).toBe(B(60000));expect(out.taxBefore).toBe(B(83000));expect(out.deductions).toBe(0);expect(out.taxSaved).toBe(0);});
 it("เงินเดือนน้อยใช้50%ไม่เติม100k",()=>expect(calculate(year(100000)).expense).toBe(B(50000)));
 it("รายได้อื่นไม่ใช้สูตรเงินเดือนและไม่สรุปภาษีหากไม่ระบุค่าใช้จ่าย",()=>{const data=year();data.profile.incomeType="other";const out=calculate(data);expect(out.expense).toBe(0);expect(out.taxAfter).toBeNull();expect(out.warnings.join()).toContain("มาตรา 48(2)");});
 it("รายได้อื่นเปิดประมาณเฉพาะอัตราก้าวหน้าเมื่อระบุค่าใช้จ่าย",()=>{const data=year();data.profile.incomeType="other";data.profile.manualExpense=B(200000);expect(calculate(data).taxBefore).toBe(B(63500));});
 it("ไม่แสดงยอดคืนหากไม่มีหัก ณ ที่จ่าย",()=>{const data=year();expect(calculate(data).withholdingBalance).toBeNull();data.profile.withholding=B(100000);expect(calculate(data).withholdingBalance).toBe(B(-17000));});
});

describe("วงเงินรายรายการและวงเงินร่วม",()=>{
 it("ชีวิตและสุขภาพรวม100kไม่ใช่125k",()=>{const data=year();data.records=[rec("life",100000),rec("health",25000)];const out=calculate(data);expect(out.deductions).toBe(B(100000));expect(category(data,"health").allowed).toBe(0);expect(category(data,"health").excess).toBe(B(25000));});
 it("วงเงินสุขภาพ25kและคงเหลือกลุ่มเดียวกัน",()=>{const data=year();data.records=[rec("life",60000),rec("health",40000)];expect(category(data,"health").allowed).toBe(B(25000));expect(category(data,"life").remaining).toBe(B(15000));});
 it("RMFจำกัด30%รายได้",()=>{const data=year();data.records=[rec("rmf",500000)];expect(category(data,"rmf").allowed).toBe(B(300000));expect(category(data,"rmf").excess).toBe(B(200000));});
 it("เกษียณทั้งหมดใช้เพดาน500kเดียวกัน",()=>{const data=year();data.records=[rec("nsf",30000),rec("gpf",300000),rec("rmf",500000)];expect(calculate(data).deductions).toBe(B(500000));expect(category(data,"rmf").remaining).toBe(0);expect(category(data,"nsf").remaining).toBe(0);});
 it("บำนาญแบ่ง40kเข้าชีวิตและ140kเข้าเกษียณ ไม่ใช้เงินซ้ำ",()=>{const data=year();data.records=[rec("life",60000),rec("pension",180000,{pensionLifeAllocation:B(40000)})];expect(calculate(data).deductions).toBe(B(240000));expect(category(data,"pension").allowed).toBe(B(180000));});
 it("บำนาญใช้กลุ่มชีวิตที่เหลือก่อนอัตโนมัติเมื่อไม่ได้จัดสรรเอง",()=>{const data=year();data.records=[rec("life",60000),rec("pension",180000)];expect(category(data,"pension").allowed).toBe(B(180000));expect(calculate(data).deductions).toBe(B(240000));});
 it("บำนาญส่วนจัดสรรชีวิตที่เกินวงเงินไม่โยกไปนับเกษียณซ้ำ",()=>{const data=year();data.records=[rec("life",100000),rec("pension",180000,{pensionLifeAllocation:B(40000)})];expect(category(data,"pension").allowed).toBe(B(140000));});
 it("ThaiESG+ESGXใหม่2569ไม่ได้คนละ300k",()=>{const data=year(2000000);data.records=[rec("thai-esg",250000),rec("thai-esgx-new",250000)];expect(category(data,"thai-esgx-new").allowed).toBe(B(50000));expect(calculate(data).deductions).toBe(B(300000));expect(category(data,"thai-esg").remaining).toBe(0);});
 it("รายได้ว่างแสดงรอคำนวณสัดส่วน แต่ยังเก็บข้อมูลได้",()=>{const data=year(null);data.records=[rec("rmf",100000),rec("health",25000)];expect(category(data,"rmf").remaining).toBeNull();expect(category(data,"rmf").allowed).toBe(0);expect(category(data,"rmf").pending).toBe(B(100000));expect(category(data,"health").allowed).toBe(B(25000));expect(calculate(data).taxAfter).toBeNull();});
 it("SSO33ใช้ยอดจริงกับเพดานใหม่10500ไม่ใช้9000",()=>{const data=year();data.records=[rec("social-33",10500)];expect(category(data,"social-33").allowed).toBe(B(10500));data.records[0].amount=B(7000);expect(category(data,"social-33").allowed).toBe(B(7000));});
 it("กองทุนสำรองเลี้ยงชีพใช้15%ค่าจ้างเฉพาะส่วนลูกจ้าง ไม่ใช่30%แบบRMF",()=>{const data=year();data.records=[rec("provident",300000)];expect(category(data,"provident").allowed).toBe(B(150000));data.profile.incomeType="other";expect(category(data,"provident").allowed).toBe(0);expect(category(data,"provident").pending).toBe(B(300000));});
 it("ยอดหนังสือรับรองต่ำกว่าจ่ายจริงใช้ยอดที่รับรอง",()=>{const data=year();data.records=[rec("life",100000,{}, {eligibleAmount:B(40000)})];expect(category(data,"life").allowed).toBe(B(40000));expect(category(data,"life").excess).toBe(B(60000));});
});

describe("เงื่อนไข ครอบครัว และกู้ร่วม",()=>{
 it("เอกสารครบไม่ทำให้สิทธิผ่านอัตโนมัติ",()=>{const data=year();data.records=[rec("life",100000,{}, {documentStatus:"complete",eligibility:"unchecked"})];expect(category(data,"life").allowed).toBe(0);expect(category(data,"life").pending).toBe(B(100000));});
 it("กฎยังไม่ยืนยันและเอกสารรายได้ไม่เพิ่มยอด",()=>{const data=year();data.records=[rec("annual-shopping",50000),rec("withholding-doc",1000000),rec("ssf-holding",100000)];expect(calculate(data).deductions).toBe(0);});
 it("วันที่ผิดปีหรือวันที่ไม่มีจริงไม่ถูกนับ",()=>{const data=year();data.records=[rec("life",30000,{}, {date:"2025-12-31"}),rec("health",20000,{}, {date:"2026-02-31"})];expect(calculate(data).deductions).toBe(0);});
 it("คู่สมรสไม่มีเงินได้ใช้สิทธิพื้นฐานไม่ใช่รายจ่ายและไม่ซ้ำ",()=>{const data=year();data.records=[rec("spouse",0),rec("spouse",0)];expect(category(data,"spouse").allowed).toBe(B(60000));});
 it("บุตรสองคนและส่วนเพิ่มคนที่สอง",()=>{const data=year();data.records=[rec("child",0,{qualifyingCount:2}),rec("child-additional",0,{qualifyingCount:1})];expect(calculate(data).deductions).toBe(B(90000));});
 it("ส่วนเพิ่มไม่มีสิทธิหลักและจำนวนเกินไม่ถูกนับ",()=>{const data=year();data.records=[rec("child-additional",0,{qualifyingCount:2})];expect(category(data,"child-additional").allowed).toBe(0);});
 it("รายการจำนวนครอบครัวซ้ำไม่เพิ่มสิทธิ",()=>{const data=year();data.records=[rec("child",0,{qualifyingCount:2}),rec("child",0,{qualifyingCount:2})];expect(category(data,"child").allowed).toBe(B(60000));expect(calculate(data).warnings.join()).toContain("หนึ่งรายการ");});
 it("บิดามารดาสูงสุด4คนผู้ใช้ต้องตรวจเงื่อนไข",()=>{const data=year();data.records=[rec("parents",0,{qualifyingCount:5})];expect(category(data,"parents").allowed).toBe(0);});
 it("กู้ร่วมดอกเบี้ย120kสามคน =100k/3ไม่ใช่คนละ100k",()=>{const data=year();data.records=[rec("housing",120000,{coBorrowers:3})];expect(category(data,"housing").allowed).toBe(3333333);expect(category(data,"housing").eligible).toBe(B(40000));});
});

describe("บริจาคและสิทธิต่อเนื่อง",()=>{
 it("บริจาคพิเศษ2เท่าเพดาน10%ร่วม แล้วทั่วไป10%ของส่วนเหลือ",()=>{const data=year();data.records=[rec("donation-education",50000),rec("donation-sport",50000),rec("donation",200000)];expect(category(data,"donation-education").allowed).toBe(B(84000));expect(category(data,"donation-sport").allowed).toBe(0);expect(category(data,"donation").allowed).toBe(B(75600));expect(calculate(data).deductions).toBe(B(159600));expect(category(data,"donation-education").remaining).toBe(0);});
 it("บริจาคต้องหักสิทธิอื่นก่อนหา10%",()=>{const data=year();data.records=[rec("rmf",300000),rec("donation",100000)];expect(category(data,"donation").allowed).toBe(B(54000));});
 it("ThaiESGXสับเปลี่ยน380kให้20kไม่ใช่50k",()=>{const data=year();data.records=[rec("thai-esgx-carry",50000,{carrySourceId:"transfer-2025",carryTransfer:B(380000),carryFirstYearUsed:B(300000),carryProofConfirmed:true})];expect(category(data,"thai-esgx-carry").allowed).toBe(B(20000));});
 it("สิทธิต่อเนื่องไม่มีข้อมูลต้นทางไม่ถูกนับ",()=>{const data=year();data.records=[rec("thai-esgx-carry",50000)];expect(category(data,"thai-esgx-carry").allowed).toBe(0);});
 it("แหล่งสับเปลี่ยนเดียวกันไม่ใช้ซ้ำ",()=>{const data=year();const facts={carrySourceId:"source-1",carryTransfer:B(500000),carryFirstYearUsed:B(300000),carryProofConfirmed:true};data.records=[rec("thai-esgx-carry",50000,facts),rec("thai-esgx-carry",50000,facts)];expect(category(data,"thai-esgx-carry").allowed).toBe(B(50000));});
 it("ไม่ย้ายสิทธิปีแรกที่ไม่ได้ใช้มาเพิ่มเอง",()=>{const data=year();data.records=[rec("thai-esgx-carry",50000,{carrySourceId:"source-1",carryTransfer:B(380000),carryFirstYearUsed:B(200000),carryProofConfirmed:true})];expect(category(data,"thai-esgx-carry").allowed).toBe(0);});
});

describe("ปีใหม่ นำเข้ากฎ และจำลอง",()=>{
 it("จำลองผลต่างภาษีจริงและไม่แก้รายการจริง",()=>{const data=year();const before=JSON.stringify(data);const output=simulate(data,"rmf",B(100000));expect(output.taxSaved).toBe(B(19500));expect(JSON.stringify(data)).toBe(before);});
 it("ไม่เปิดจำลองกฎpending",()=>expect(()=>simulate(year(),"annual-shopping",B(10000))).toThrow());
 it("ปีอนาคตไม่มีวงเงินหรือขั้นภาษีเก่าสืบทอด",()=>{const data=makeYear(2570);data.profile.income=B(1000000);expect(data.rules.brackets).toEqual([]);expect(data.rules.sharedCaps).toEqual({});expect(data.rules.rules.every(r=>r.cap===null)).toBe(true);expect(calculate(data).taxAfter).toBeNull();expect(calculate(data).personal).toBe(0);});
 it("เพิ่มปีคัดลอกได้แค่หมวดที่เลือก",()=>{const original=year();original.records=[rec("life",10000)];original.profile.selectedCategories=["life"];const w:Workspace={manifest:{schemaVersion:1,id:newId(),name:"ทดสอบ",revision:0,createdAt:"",updatedAt:"",years:[2569]},years:{2569:original},files:new Map(),warnings:[]};const next=addYear(w,2570,true);expect(next.years[2570].profile.selectedCategories).toEqual(["life"]);expect(next.years[2570].profile.income).toBeNull();expect(next.years[2570].records).toEqual([]);expect(w.years[2570]).toBeUndefined();});
 it("ปีใหม่คัดลอกหมวดกำหนดเองได้เฉพาะเอกสาร ไม่สืบทอดกฎเงิน",()=>{const data=year();data.rules.rules.push({...data.rules.rules.find(r=>r.id==="income-doc")!,id:"custom-folder",name:"หมวดฉัน"});data.profile.selectedCategories=["custom-folder"];const w:Workspace={manifest:{schemaVersion:1,id:newId(),name:"ตัวอย่าง",revision:0,createdAt:"",updatedAt:"",years:[2569]},years:{2569:data},files:new Map(),warnings:[]};const next=addYear(w,2570,true);const copied=next.years[2570].rules.rules.find(r=>r.id==="custom-folder")!;expect(copied.kind).toBe("documents");expect(copied.cap).toBeNull();expect(copied.status).toBe("pending");});
 it("นำเข้ากฎปฏิเสธปีผิด รหัสซ้ำ สูตร/ขั้นผิด",()=>{const rules=getRules(2569);expect(()=>importRules(rules,2570)).toThrow();rules.rules.push(rules.rules[0]);expect(()=>importRules(rules,2569)).toThrow();const invalid=getRules(2569);invalid.brackets[1].upTo=1;expect(()=>importRules(invalid,2569)).toThrow();});
 it("เพดานร่วมไม่อ่าน inherited object properties",()=>{const rules=getRules(2569);rules.rules.find(r=>r.id==="life")!.sharedCap="toString";expect(()=>importRules(rules,2569)).toThrow();});
 it("นำเข้ากฎปฏิเสธสูตรบริจาคที่ทำเพดานร่วมผิด",()=>{const rules=getRules(2569);const row={...rules.rules.find(r=>r.id==="donation")!,id:"extra-donation"};rules.rules.push(row);expect(()=>importRules(rules,2569)).toThrow();});
});


describe("เปลี่ยนชุดกฎโดยไม่สืบทอดการยืนยันสิทธิผิดฐาน",()=>{
 it("รุ่น/แหล่งอ้างอิง/ชื่อเปลี่ยนแต่สาระเดิมคงsnapshotเดิม",()=>{const data=year();const rules=structuredClone(data.rules);rules.version="new-version";rules.rules[0].name="ชื่อใหม่";rules.rules[0].reviewedAt="2026-10-26";rules.rules[0].sources=["https://www.rd.go.th/5937.html"];expect(replaceYearRules(data,rules)).toBe(data);});
 it("วงเงินเปลี่ยน resetconfirmed แต่ไม่แก้เงินหรือไฟล์",()=>{const data=year();const row=rec("life",60000);data.records=[row];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="life")!.cap=B(80000);const next=replaceYearRules(data,rules);expect(next.records[0].eligibility).toBe("unchecked");expect(next.records[0].amount).toBe(row.amount);expect(next.records[0].attachments).toBe(row.attachments);expect(data.records[0].eligibility).toBe("confirmed");});
 it("เอกสารที่เคยครบต้องตรวจchecklistใหม่",()=>{const data=year();const rule=data.rules.rules.find(r=>r.id==="life")!;data.records=[rec("life",60000,{}, {documentStatus:"complete",checklist:[...rule.documents,"เอกสารเก่าที่ไม่ใช้"],attachments:[{id:"doc-1",path:"years/2569/documents/insurance/doc-1.pdf",originalName:"ใบรับรอง.pdf",mime:"application/pdf",size:10,hash:"0".repeat(64)}]})];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="life")!.documents.push("เอกสารใหม่");const next=replaceYearRules(data,rules);expect(next.records[0].documentStatus).toBe("partial");expect(next.records[0].checklist).toEqual(rule.documents);expect(next.records[0].eligibility).toBe("unchecked");});
 it("ครบchecklistแต่ไม่มีไฟล์ไม่ใช่เอกสารครบ",()=>{const data=year();data.records=[rec("life",60000,{}, {documentStatus:"complete",checklist:[...data.rules.rules.find(r=>r.id==="life")!.documents]})];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="life")!.description+="เงื่อนไขใหม่";expect(replaceYearRules(data,rules).records[0].documentStatus).toBe("none");});
 it("กฎใหม่รอยืนยันทำให้สิทธิเดิมรอกฎ ไม่ยืนยันต่อเอง",()=>{const data=year();data.records=[rec("life",10000)];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="life")!.status="pending";expect(replaceYearRules(data,rules).records[0].eligibility).toBe("pending");});
 it("กฎที่ไม่เกี่ยวข้องเปลี่ยนไม่resetรายการเดิม",()=>{const data=year();data.records=[rec("life",10000)];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="rmf")!.cap=B(400000);expect(replaceYearRules(data,rules).records[0]).toBe(data.records[0]);});
 it("เพดานร่วมเปลี่ยนต้องทบทวนการยืนยัน",()=>{const data=year();data.records=[rec("life",10000)];const rules=structuredClone(data.rules);rules.sharedCaps["life-health"]=B(90000);expect(replaceYearRules(data,rules).records[0].eligibility).toBe("unchecked");});
 it("อัตราก้าวหน้าเปลี่ยนคำนวณใหม่แต่สิทธิรายรายการเดิมไม่เปลี่ยน",()=>{const data=year();data.records=[rec("life",10000)];const rules=structuredClone(data.rules);rules.brackets[1].rateBps=600;const next=replaceYearRules(data,rules);expect(next.rules).not.toBe(data.rules);expect(next.records[0]).toBe(data.records[0]);});
 it("ไม่เปลี่ยนคำยืนยันว่าไม่เข้าเงื่อนไขเป็นสิทธิผ่านเอง",()=>{const data=year();data.records=[rec("life",10000,{}, {eligibility:"ineligible"})];const rules=structuredClone(data.rules);rules.rules.find(r=>r.id==="life")!.cap=B(90000);expect(replaceYearRules(data,rules).records[0].eligibility).toBe("ineligible");});
 it("ปฏิเสธปีผิดและการลบหมวดที่มีรายการก่อนเปลี่ยนsnapshot",()=>{const data=year();data.records=[rec("life",10000)];expect(()=>replaceYearRules(data,getRules(2570))).toThrow();const rules=structuredClone(data.rules);rules.rules=rules.rules.filter(r=>r.id!=="life");expect(()=>replaceYearRules(data,rules)).toThrow();expect(data.rules.rules.some(r=>r.id==="life")).toBe(true);});
});


describe("ขีดจำกัดปีและหมวดก่อนแก้แฟ้ม",()=>{
 it("ปฏิเสธปีที่101ก่อนเปลี่ยนข้อมูลซึ่งจะบันทึกไม่ได้",()=>{const years=Array.from({length:100},(_,index)=>2569+index);const w:Workspace={manifest:{schemaVersion:1,id:newId(),name:"แฟ้มทดสอบ",revision:0,createdAt:"",updatedAt:"",years},years:Object.fromEntries(years.map(y=>[y,makeYear(y)])),files:new Map(),warnings:[]};const before=JSON.stringify(w.manifest);expect(()=>addYear(w,2669,false)).toThrow("ขีดจำกัด");expect(JSON.stringify(w.manifest)).toBe(before);expect(w.years[2669]).toBeUndefined();});
 it("คัดลอกหมวดกำหนดเองจนรวมทะเบียนใหม่เกิน150ไม่แก้แฟ้ม",()=>{const data=year();const template=data.rules.rules.find(r=>r.id==="income-doc")!;data.rules.rules=Array.from({length:150},(_,i)=>({...template,id:`custom-${i}`}));data.profile.selectedCategories=data.rules.rules.map(r=>r.id);const w:Workspace={manifest:{schemaVersion:1,id:newId(),name:"แฟ้ม",revision:0,createdAt:"",updatedAt:"",years:[2569]},years:{2569:data},files:new Map(),warnings:[]};expect(()=>addYear(w,2570,true)).toThrow("ขีดจำกัด");expect(w.years[2570]).toBeUndefined();expect(addYear(w,2570,false).years[2570]).toBeDefined();});
 it("หมวดที่สนใจไม่ซ้ำ และปฏิเสธเกินจำนวนที่schemaบันทึกได้",()=>{expect(makeYear(2569,["life","life"]).profile.selectedCategories).toEqual(["life"]);expect(()=>makeYear(2569,Array.from({length:151},(_,i)=>`custom-${i}`))).toThrow();});
});

// Fictional fixtures (สมมติ): reviewed 2569 catalogue and supported activation gates.
describe("reviewed 2569 category limits",()=>{
 const fictional=(id:string,amount:number,extra:Partial<TaxRecord>={})=>rec(id,amount,{}, {title:"ทดสอบวงเงินสมมติ",...extra});
 it("validates the reviewed bundle and keeps pending catalogue caps unknown",()=>{
  const rules=getRules(2569);expect(importRules(rules,2569)).toEqual(rules);
  expect(rules.version).toBe("2569.3-reviewed-2026-10-27");
  for(const id of ["adopted-child","art-purchase","cctv","maternity","social-39","social-40"]){const rule=rules.rules.find(r=>r.id===id)!;expect(rule.status).toBe("pending");expect(rule.cap).toBeNull();}
  expect(rules.sharedCaps).toEqual({"life-health":B(100000),retirement:B(500000),"thai-esg":B(300000)});
 });
 it.each(["spouse-life","teacher-fund"])("%s uses certified actual paid only and never confirms itself",id=>{
  const cap=id==="spouse-life"?10000:500000;
  for(const amount of [0,cap,cap+10000]){const data=year(5000000);data.records=[fictional(id,amount)];expect(category(data,id).allowed).toBe(B(Math.min(amount,cap)));}
  for(const eligibility of ["unchecked","ineligible","pending"] as const){const data=year();data.records=[fictional(id,cap,{eligibility,documentStatus:"complete"})];expect(category(data,id).allowed).toBe(0);}
  const data=year();data.records=[fictional(id,cap,{eligibleAmount:B(3000)})];expect(category(data,id).allowed).toBe(B(3000));
 });
 it("teacher fund consumes the existing retirement pool and NSF still caps at 30000",()=>{
  const data=year(5000000);data.records=[fictional("teacher-fund",490000),fictional("nsf",40000),fictional("rmf",500000)];
  expect(calculate(data).deductions).toBe(B(500000));
  const nsf=year();nsf.records=[fictional("nsf",40000)];expect(category(nsf,"nsf").allowed).toBe(B(30000));
 });
 it("every pending category stays excluded even with confirmed complete documents",()=>{
  for(const rule of getRules(2569).rules.filter(r=>r.status==="pending")){
   const data=year();data.records=[fictional(rule.id,300000,{documentStatus:"complete"})];
   expect(category(data,rule.id).allowed,rule.id).toBe(0);expect(calculate(data).deductions,rule.id).toBe(0);
  }
 });
 it("pension's total can exceed the additional-portion ceiling without double counting",()=>{
  const data=year(5000000);data.records=[fictional("pension",300000)];
  expect(category(data,"pension").allowed).toBe(B(300000));expect(calculate(data).deductions).toBe(B(300000));
 });
 it("a qualifying second child adds 30000, not another 60000",()=>{
  const data=year();data.records=[rec("child",0,{qualifyingCount:2},{title:"บุตรสมมติ"}),rec("child-additional",0,{qualifyingCount:1},{title:"ส่วนเพิ่มสมมติ"})];
  expect(calculate(data).deductions).toBe(B(90000));
 });
 it("historical ZIP retains its own rules and totals through roundtrip",async()=>{
  const original=await importZip(new Uint8Array(await readFile("examples/fictional-tax-2569.zip")));
  const snapshot=structuredClone(original.years[2569].rules),before=calculate(original.years[2569]);
  expect(snapshot.version).not.toBe(getRules(2569).version);
  const reopened=await importZip(await exportZip(original));
  expect(reopened.years[2569].rules).toEqual(snapshot);expect(calculate(reopened.years[2569])).toEqual(before);
  const replacement=replaceYearRules(original.years[2569],getRules(2569));
  expect(replacement.rules.version).toBe(getRules(2569).version);expect(original.years[2569].rules).toEqual(snapshot);
  expect(replacement.records.map(r=>r.attachments)).toEqual(original.years[2569].records.map(r=>r.attachments));
 });
 it("recorded custom categories cannot be removed by a public bundle replacement",()=>{
  const data=year();const custom={...data.rules.rules.find(r=>r.id==="income-doc")!,id:"custom-fictional",name:"เอกสารสมมติ"};
  data.rules.rules.push(custom);data.records=[fictional(custom.id,123)];
  expect(()=>replaceYearRules(data,getRules(2569))).toThrow("ชุดกฎใหม่ลบหมวด");expect(data.records).toHaveLength(1);expect(data.rules.rules).toContain(custom);
 });
});
