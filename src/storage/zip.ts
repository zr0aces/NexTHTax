import { zipSync, inflateSync } from "fflate";
import type { Workspace } from "../domain/model";
import { decoder, encoder, MAX_TOTAL, serializedFiles, validateWorkspace, workspaceFromFiles } from "./validation";
const MAX_ENTRIES = 1100;
const MAX_ARCHIVE = MAX_TOTAL + 20 * 1024 * 1024;
const escapeHtml = (value:string) => value.replace(/[&<>"\x27]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\x27":"&#39;"}[c]!));
export function safeArchivePath(path:string): boolean {
 if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || path.split("/").some(x => x === ".." || x === ".")) return false;
 return /^(manifest\.json|index\.html|README\.txt)$/.test(path)
  || /^years\/[0-9]{4}\/(profile|records|rules-snapshot)\.json$/.test(path)
  || /^years\/[0-9]{4}\/documents\/(insurance|retirement|donations|housing|family|other)\/[a-zA-Z0-9_-]+\.(pdf|jpg|png|webp)$/.test(path)
  || /^years\/[0-9]{4}\/exports\/[a-zA-Z0-9_-]+\.(csv|pdf|txt)$/.test(path)
  || /^(years\/|years\/[0-9]{4}\/|years\/[0-9]{4}\/(documents|exports)\/|years\/[0-9]{4}\/documents\/(insurance|retirement|donations|housing|family|other)\/)$/.test(path);
}
const crcTable = Array.from({length:256}, (_, n) => {let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0;});
function crc32(bytes:Uint8Array):number {let crc=0xffffffff; for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0;}
type InspectedEntry={size:number;crc:number;method:number;dataStart:number;compressed:number};
export function inspectZip(bytes:Uint8Array): Map<string,InspectedEntry> {
 if (bytes.length < 22 || bytes.length > MAX_ARCHIVE) throw new Error("ไฟล์ ZIP ไม่ถูกต้องหรือเกินขนาดที่รองรับ (220 MB)");
 const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let end = -1;
 for(let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) if(view.getUint32(i,true)===0x06054b50 && i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0) throw new Error("ไฟล์ ZIP เสียหรือไม่สมบูรณ์");
 if(end>=20&&view.getUint32(end-20,true)===0x07064b50) throw new Error("ZIP64 ไม่รองรับ กรุณาใช้ ZIP ปกติ");
 const count=view.getUint16(end+10,true), centralSize=view.getUint32(end+12,true), centralStart=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)!==0 || view.getUint16(end+6,true)!==0 || view.getUint16(end+8,true)!==count || count>MAX_ENTRIES || count===65535 || centralStart+centralSize!==end) throw new Error("ZIP แบบหลายส่วน / ZIP64 หรือจำนวนไฟล์มากเกินไปไม่รองรับ");
 let position=centralStart, total=0;
 const entries = new Map<string,InspectedEntry>();
 for(let i=0;i<count;i++) {
  if(position+46>end || view.getUint32(position,true)!==0x02014b50) throw new Error("ดัชนี ZIP เสีย");
  const flags=view.getUint16(position+8,true), method=view.getUint16(position+10,true), crc=view.getUint32(position+16,true), compressed=view.getUint32(position+20,true), size=view.getUint32(position+24,true), nameLen=view.getUint16(position+28,true), extra=view.getUint16(position+30,true), comment=view.getUint16(position+32,true), local=view.getUint32(position+42,true);
  const next=position+46+nameLen+extra+comment;
  if(next>end || !nameLen || flags&1 || ![0,8].includes(method) || size===0xffffffff || compressed===0xffffffff || view.getUint16(position+34,true)!==0) throw new Error("รูปแบบ ZIP ไม่รองรับหรือไฟล์ถูกเข้ารหัส");
  let name:string;
  try {name=decoder.decode(bytes.subarray(position+46,position+46+nameLen));} catch {throw new Error("ชื่อไฟล์ ZIP ไม่ใช่ UTF-8");}
  if(!safeArchivePath(name) || entries.has(name)) throw new Error("ชื่อไฟล์ใน ZIP ไม่ปลอดภัยหรือซ้ำกัน");
  if(local+30>centralStart || view.getUint32(local,true)!==0x04034b50) throw new Error("ส่วนข้อมูล ZIP เสีย");
  const localNameLen=view.getUint16(local+26,true), localExtra=view.getUint16(local+28,true), dataStart=local+30+localNameLen+localExtra;
  if(dataStart+compressed>centralStart || view.getUint16(local+8,true)!==method || view.getUint16(local+6,true)!==flags || decoder.decode(bytes.subarray(local+30,local+30+localNameLen))!==name) throw new Error("ข้อมูล ZIP ขัดแย้งกัน");
  if(method===0&&compressed!==size) throw new Error("ขนาดไฟล์ ZIP แบบไม่บีบอัดไม่ตรงกัน");
  total+=size;
  if(total>MAX_ARCHIVE || (/\.json$/.test(name) && size>8*1024*1024) || (/\/documents\//.test(name)&&size>20*1024*1024)) throw new Error("ข้อมูลหลังคลาย ZIP ใหญ่เกินกำหนด");
  entries.set(name,{size,crc,method,dataStart,compressed}); position=next;
 }
 if(position!==end) throw new Error("ดัชนี ZIP ไม่สมบูรณ์");
 return entries;
}
export async function importZip(bytes:Uint8Array):Promise<Workspace> {
 const entries=inspectZip(bytes);
 const files=new Map<string,Uint8Array>();
 for(const [path,meta] of entries) {
  // Never reparse the archive in a second ZIP parser: extract only inspected ranges.
  // The extra byte detects output exceeding its declaration without an unbounded allocation.
  const compressed=bytes.subarray(meta.dataStart,meta.dataStart+meta.compressed);
  let data:Uint8Array;
  try {data=meta.method===0?compressed.slice():inflateSync(compressed,{out:new Uint8Array(meta.size+1)});}
  catch {throw new Error("คลาย ZIP ไม่สำเร็จ กรุณาใช้ไฟล์สำรองที่สมบูรณ์");}
  if(!data || data.length!==meta.size || crc32(data)!==meta.crc) throw new Error("ข้อมูลใน ZIP เสียหรือถูกแก้ไข");
  if(!path.endsWith("/")) files.set(path,data);
 }
 return workspaceFromFiles(files);
}
export function searchIndex(workspace:Workspace):string {
 const rows=workspace.manifest.years.flatMap(year => workspace.years[String(year)].records.map(r=>`<tr><td>${year}</td><td>${escapeHtml(r.title)}</td><td>${(r.amount/100).toFixed(2)}</td><td>${escapeHtml(r.date)}</td><td>${r.attachments.map(a=>`<a href="${a.path}">${escapeHtml(a.originalName)}</a>`).join("<br>")}</td></tr>`));
 return `<!doctype html><html lang="th"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>ดัชนีแฟ้มภาษี</title><style>body{font:16px sans-serif;margin:32px}td,th{padding:12px;border:1px solid #ccc}table{border-collapse:collapse}</style><h1>${escapeHtml(workspace.manifest.name)}</h1><p>เอกสารช่วยเตรียมยื่นภาษี ไม่ใช่แบบยื่นทางการ ค้นหาชื่อรายการด้วย Ctrl+F</p><table><thead><tr><th>ปี</th><th>รายการ</th><th>จ่ายจริง (บาท)</th><th>วันที่</th><th>เอกสาร</th></tr></thead><tbody>${rows.join("")}</tbody></table></html>`;
}
export async function exportZip(input:Workspace):Promise<Uint8Array> {
 const workspace=await validateWorkspace(input);
 const files=serializedFiles(workspace);
 files.set("index.html",encoder.encode(searchIndex(workspace)));
 files.set("README.txt",encoder.encode("แฟ้มภาษี NexTHTax: เปิด ZIP นี้ด้วยแอป หรือคลาย ZIP แล้วเลือกโฟลเดอร์ที่มี manifest.json\nใช้ UTF-8 JSON และไฟล์เอกสารจริง สามารถย้ายทั้งโฟลเดอร์ได้\nข้อมูลภาษีส่วนตัว: เก็บสำรองในที่ปลอดภัย"));
 return zipSync(Object.fromEntries(files),{level:1});
}
