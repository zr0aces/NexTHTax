import { manifestSchema, taxYearDataSchema, pathSchema, type Workspace } from "../domain/model";
import { importRules } from "../domain/rules";
export const MAX_FILE = 20 * 1024 * 1024;
export const MAX_TOTAL = 200 * 1024 * 1024;
export const MAX_DOCUMENTS = 500;
export const encoder = new TextEncoder();
export const decoder = new TextDecoder("utf-8", { fatal: true });
export const encodeJson = (value: unknown) => encoder.encode(JSON.stringify(value, null, 2));
export function parseJson(bytes: Uint8Array, name: string): unknown {
 try { if (bytes.length > 8 * 1024 * 1024) throw new Error(); return JSON.parse(decoder.decode(bytes)); }
 catch { throw new Error(`อ่าน ${name} ไม่ได้: ไฟล์เสียหรือมีขนาดใหญ่เกินไป`); }
}
export async function hashBytes(bytes: Uint8Array): Promise<string> {
 const result = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
 return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2,"0")).join("");
}
export function mimeFor(bytes: Uint8Array): {mime: "application/pdf"|"image/jpeg"|"image/png"|"image/webp"; extension: string} {
 const begins = (...values:number[]) => values.every((v,i) => bytes[i] === v);
 if (begins(37,80,68,70,45)) return {mime:"application/pdf",extension:"pdf"};
 if (begins(255,216,255)) return {mime:"image/jpeg",extension:"jpg"};
 if (begins(137,80,78,71,13,10,26,10)) return {mime:"image/png",extension:"png"};
 if (begins(82,73,70,70) && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return {mime:"image/webp",extension:"webp"};
 throw new Error("รองรับเฉพาะไฟล์ PDF, JPG, PNG และ WebP ที่มีชนิดไฟล์ถูกต้อง");
}
/** A continuing entitlement must retain one consistent original transfer history. */
export function assertCarrySources(workspace:Workspace):void {
 const sources=new Map<string,{transfer:number;firstUsed:number}>();
 for(const data of Object.values(workspace.years)) for(const record of data.records) {
  const facts=record.facts;
  if(!facts.carryProofConfirmed||!facts.carrySourceId||facts.carryTransfer===undefined||facts.carryFirstYearUsed===undefined) continue;
  const previous=sources.get(facts.carrySourceId);
  if(previous&&(previous.transfer!==facts.carryTransfer||previous.firstUsed!==facts.carryFirstYearUsed)) throw new Error("ข้อมูลสิทธิต่อเนื่องแหล่งเดียวกันไม่ตรงกันระหว่างรายการหรือปี กรุณาตรวจยอดสับเปลี่ยนและยอดใช้สิทธิปี 2568");
  sources.set(facts.carrySourceId,{transfer:facts.carryTransfer,firstUsed:facts.carryFirstYearUsed});
 }
}
export async function validateWorkspace(input: Workspace): Promise<Workspace> {
 const manifest = manifestSchema.parse(input.manifest);
 if (new Set(manifest.years).size !== manifest.years.length) throw new Error("ปีภาษีซ้ำในแฟ้ม");
 if (Object.keys(input.years).length !== manifest.years.length) throw new Error("รายชื่อปีภาษีไม่ตรงกับข้อมูล");
 const years: Workspace["years"] = {};
 const warnings: string[] = [];
 const ids = new Set<string>();
 const attachmentPaths = new Map<string,string>();
 const attachmentHashes = new Set<string>();
 let total = 0;
 if (input.files.size > MAX_DOCUMENTS) throw new Error("แฟ้มนี้เกิน 500 เอกสาร กรุณาแยกแฟ้มสำรอง");
 for (const [path,bytes] of input.files) {
  pathSchema.parse(path);
  if (!manifest.years.includes(Number(path.split("/")[1]))) throw new Error("เอกสารอยู่ในปีที่ไม่มีข้อมูล");
  if (!bytes.length || bytes.length > MAX_FILE) throw new Error("เอกสารต้องมีขนาดไม่เกิน 20 MB ต่อไฟล์");
  total += bytes.length;
  mimeFor(bytes);
 }
 if (total > MAX_TOTAL) throw new Error("เอกสารในแฟ้มเกิน 200 MB กรุณาแยกแฟ้มสำรอง");
 for (const year of manifest.years) {
  const data = taxYearDataSchema.parse(input.years[String(year)]);
  data.rules = importRules(data.rules,year);
  if (data.rules.taxYear !== year || data.rules.rules.some(r => r.taxYear !== year)) throw new Error("กฎภาษีไม่ตรงกับปีของแฟ้ม");
  const ruleIds = new Set(data.rules.rules.map(r => r.id));
  if (ruleIds.size !== data.rules.rules.length) throw new Error("รายการกฎภาษีซ้ำ");
  for (const record of data.records) {
   if (ids.has(record.id)) throw new Error("พบรหัสรายการซ้ำ");
   ids.add(record.id);
   if (!ruleIds.has(record.categoryId)) throw new Error("รายการอ้างถึงหมวดที่ไม่มีอยู่ในแฟ้ม");
   if (record.eligibleAmount !== null && record.eligibleAmount > record.amount) throw new Error("ยอดที่เข้าเกณฑ์มากกว่ายอดจ่ายจริง");
   const date = new Date(`${record.date}T00:00:00Z`);
   if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== record.date || date.getUTCFullYear() !== year - 543) throw new Error("วันที่รายการไม่อยู่ในปีภาษีหรือไม่ถูกต้อง");
   const localIds = new Set<string>();
   for (const att of record.attachments) {
    if (localIds.has(att.id)) throw new Error("รหัสไฟล์แนบซ้ำในรายการ");
    localIds.add(att.id);
    if (attachmentHashes.has(att.hash)) throw new Error("พบหลักฐานซ้ำในหลายรายการ กรุณารวมยอดในรายการเดิมก่อนนำเข้า เพื่อไม่ให้นับยอดซ้ำ");
    attachmentHashes.add(att.hash);
    if (!att.path.startsWith(`years/${year}/documents/`)) throw new Error("ไฟล์แนบอ้างถึงปีอื่น");
    const existing = attachmentPaths.get(att.path);
    if (existing && existing !== att.hash) throw new Error("เอกสารเดียวกันมีข้อมูลขัดแย้ง");
    attachmentPaths.set(att.path, att.hash);
    const bytes = input.files.get(att.path);
    if (!bytes) { warnings.push(`ไม่พบเอกสาร ${att.originalName} ในรายการ ${record.title}`); record.documentStatus = record.attachments.length > 1 ? "partial" : "none"; continue; }
    if (bytes.length !== att.size || await hashBytes(bytes) !== att.hash || mimeFor(bytes).mime !== att.mime) throw new Error(`เอกสาร ${att.originalName} เสียหรือถูกแก้ไข กรุณากู้คืนจากสำรอง`);
   }
   if (!record.attachments.length && record.documentStatus !== "none") record.documentStatus = "none";
   if (record.documentStatus === "complete") {
    const required=data.rules.rules.find(r=>r.id===record.categoryId)!.documents;
    if (!record.checklist.length || required.some(item=>!record.checklist.includes(item))) {
     record.documentStatus="partial";
     warnings.push(`รายการ ${record.title} ยังไม่ยืนยัน checklist เอกสารครบ`);
    }
   }
  }
  years[String(year)] = data;
 }
 const workspace={manifest, years, files:new Map(input.files), warnings};
 assertCarrySources(workspace);
 return workspace;
}
export function serializedFiles(workspace: Workspace): Map<string,Uint8Array> {
 const files = new Map(workspace.files);
 for (const year of workspace.manifest.years) {
  const data = workspace.years[String(year)];
  files.set(`years/${year}/profile.json`, encodeJson(data.profile));
  files.set(`years/${year}/records.json`, encodeJson(data.records));
  files.set(`years/${year}/rules-snapshot.json`, encodeJson(data.rules));
 }
 files.set("manifest.json",encodeJson(workspace.manifest));
 return files;
}
export async function workspaceFromFiles(files: Map<string,Uint8Array>): Promise<Workspace> {
 const manifestBytes = files.get("manifest.json");
 if (!manifestBytes) throw new Error("ไม่พบ manifest.json กรุณาเลือกแฟ้มภาษีที่ส่งออกจากแอป");
 const manifest = manifestSchema.parse(parseJson(manifestBytes,"manifest.json"));
 for (const path of files.keys()) {
  const match=/^years\/([0-9]{4})\//.exec(path);
  if(match && !manifest.years.includes(Number(match[1]))) throw new Error("พบข้อมูลปีที่ไม่อยู่ในรายชื่อปีภาษีของแฟ้ม");
 }
 const years: Workspace["years"] = {};
 for (const year of manifest.years) {
  const read = (name:string) => {const path = `years/${year}/${name}.json`; const bytes = files.get(path); if (!bytes) throw new Error(`ไม่พบ ${path} กรุณากู้คืนจากสำรอง`); return parseJson(bytes,path);};
  years[String(year)] = {profile:read("profile"),records:read("records"),rules:read("rules-snapshot")} as Workspace["years"][string];
 }
 const docs = new Map([...files].filter(([path]) => path.startsWith("years/") && path.includes("/documents/")));
 return validateWorkspace({manifest,years,files:docs,warnings:[]});
}
