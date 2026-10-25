import { newId, type Attachment, type Workspace } from "../domain/model";
import { hashBytes, MAX_DOCUMENTS, MAX_FILE, MAX_TOTAL, mimeFor } from "./validation";
const groupFolder = (group:string) => ["insurance","retirement","donations","housing","family"].includes(group) ? group : "other";
export async function addAttachments(workspace:Workspace, year:number, categoryGroup:string, files:File[]):Promise<Attachment[]> {
 if (!workspace.manifest.years.includes(year)) throw new Error("ไม่พบปีภาษีนี้");
 if(files.some(file=>file.size<=0||file.size>MAX_FILE)) throw new Error("เอกสารต้องมีขนาดตั้งแต่ 1 ไบต์ถึง 20 MB ต่อไฟล์");
 const existing = new Map<string,string[]>();
 for (const [path,bytes] of workspace.files) {
  const hash=await hashBytes(bytes);
  existing.set(hash,[...(existing.get(hash)??[]),path]);
 }
 const references=Object.values(workspace.years).flatMap(data=>data.records.flatMap(record=>record.attachments));
 const referencedHashes=new Set(references.map(attachment=>attachment.hash));
 const referencedPaths=new Set(references.map(attachment=>attachment.path));
 const batchHashes=new Set<string>();
 let total=[...workspace.files.values()].reduce((sum,bytes)=>sum+bytes.length,0);
 const staged = new Map<string,Uint8Array>();
 const attachments:Attachment[]=[];
 for(const file of files) {
  if(file.name.length>200 || /[\x00-\x1f\x7f]/.test(file.name) || !/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) throw new Error("ชื่อเอกสารไม่ถูกต้อง รองรับนามสกุล PDF, JPG, PNG, WebP เท่านั้น");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const {mime,extension}=mimeFor(bytes);
  const expected=file.name.toLowerCase().split(".").at(-1)?.replace("jpeg","jpg");
  if(expected!==extension || (file.type && file.type!==mime)) throw new Error(`ชนิดไฟล์ ${file.name} ไม่ตรงกับเนื้อหา`);
  const hash=await hashBytes(bytes);
  if(referencedHashes.has(hash)||batchHashes.has(hash)) throw new Error(`พบเอกสารซ้ำ: ${file.name} กรุณาใช้หลักฐานที่อยู่ในรายการเดิม ไม่เพิ่มยอดจ่ายซ้ำ`);
  batchHashes.add(hash);
  const id=newId();
  // Re-link retained, unreferenced evidence from this year without copying its bytes.
  // Evidence in another year needs a new relative path to preserve year isolation.
  const retained=existing.get(hash)?.find(path=>path.startsWith(`years/${year}/documents/`)&&!referencedPaths.has(path));
  const path=retained??`years/${year}/documents/${groupFolder(categoryGroup)}/${id}.${extension}`;
  if(!retained) {
   if(workspace.files.size+staged.size+1>MAX_DOCUMENTS) throw new Error("แฟ้มนี้เก็บได้ไม่เกิน 500 เอกสาร");
   total+=bytes.length;
   if(total>MAX_TOTAL) throw new Error("เอกสารรวมเกิน 200 MB กรุณาแยกแฟ้มสำรอง");
   staged.set(path,bytes);
  }
  attachments.push({id,path,originalName:file.name,mime,size:bytes.length,hash});
 }
 for(const [path,bytes] of staged) workspace.files.set(path,bytes);
 return attachments;
}
