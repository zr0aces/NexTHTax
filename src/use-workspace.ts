import { ZodError } from "zod";
import { useEffect, useRef, useState } from "react";
import type { Workspace, TaxYearData, TaxRecord, RuleSet } from "./domain/model";
import { getRules } from "./domain/rules";
import { replaceYearRules } from "./domain/workspace";
import { applyFixedDrafts, type FixedDraft } from "./domain/fixed-allowances";
import { createWorkspace, exportZip, importZip, FolderSession, restoreBackup, assertCarrySources } from "./storage";
import { download } from "./reports/download";
export type Mode="folder"|"zip"|"sample";
export type Status="saved"|"dirty"|"saving"|"error";
const pickDirectory=()=> (window as unknown as {showDirectoryPicker(options:{mode:string}):Promise<FileSystemDirectoryHandle>}).showDirectoryPicker({mode:"readwrite"});
export const errorMessage=(error:unknown)=>error instanceof ZodError?"ข้อมูลในแฟ้มไม่ครบหรือเป็นรุ่นที่ยังไม่รองรับ กรุณาเปิดไฟล์สำรองที่สมบูรณ์":error instanceof Error?error.message:"ดำเนินการไม่สำเร็จ กรุณาลองอีกครั้ง";
export function useWorkspace(){
 const [workspace,setWorkspace]=useState<Workspace|null>(null),current=useRef<Workspace|null>(null);
 const session=useRef<FolderSession|null>(null),saveQueue=useRef(Promise.resolve());
 const [mode,setMode]=useState<Mode>("zip"),[status,setStatus]=useState<Status>("saved"),[year,setYearState]=useState(2569);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const currentYear=useRef(year);
 const setYear=(value:number)=>{currentYear.current=value;setYearState(value);};
 const operation=useRef(false);
 const beginOperation=()=>{if(operation.current)return false;operation.current=true;setBusy(true);return true;};
 const endOperation=()=>{operation.current=false;setBusy(false);};
 const assertCurrent=(expected:Workspace|null)=>{if(current.current!==expected)throw new Error("แฟ้มเปลี่ยนระหว่างทำงาน ยกเลิกการเปิดเพื่อรักษางานปัจจุบัน");};
 const dirty=status!=="saved";
 useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
 function load(ws:Workspace,newMode:Mode,folder:FolderSession|null=null){current.current=ws;setWorkspace(ws);session.current=folder;setMode(newMode);setYear(ws.manifest.years[0]);setStatus("saved");setError("");setNotice(newMode==="sample"?"กำลังดูข้อมูลสมมติ แยกจากแฟ้มจริง ไม่บันทึกลงโฟลเดอร์ใด":"");}
 function commit(ws:Workspace){current.current=ws;setWorkspace(ws);setStatus("dirty");setError("");}
 function updateYear(next:TaxYearData){if(!current.current)return;const ws=current.current;commit({...ws,years:{...ws.years,[year]:next}});}
 async function saveFolder(snapshot:Workspace,folder:FolderSession){
  if(current.current!==snapshot||session.current!==folder)return;
  setStatus("saving");setError("");
  try {await folder.save(snapshot);if(current.current===snapshot&&session.current===folder)setStatus("saved");}
  catch(err){if(session.current===folder){setStatus("error");setError(`บันทึกไม่สำเร็จ: ${errorMessage(err)} งานที่แก้ยังอยู่ในหน้านี้ ส่งออก ZIP สำรองได้`);}}
 }
 useEffect(()=>{if(!workspace||mode!=="folder"||status!=="dirty"||!session.current)return;const snapshot=workspace,folder=session.current;const timer=setTimeout(()=>{saveQueue.current=saveQueue.current.then(()=>saveFolder(snapshot,folder));},500);return()=>clearTimeout(timer);},[workspace,mode,status]);
 const mayLeave=()=>!dirty||window.confirm("ยังมีงานที่ไม่ได้บันทึกหรือส่งออก ZIP ต้องการเปลี่ยนแฟ้มโดยละทิ้งงานนี้หรือไม่?");
 async function create(name:string,kind:Mode){if(!beginOperation())return false;const expected=current.current;setError("");try{if(!mayLeave())return false;const ws=createWorkspace(name,getRules(2569));if(kind==="folder"){const handle=await pickDirectory();const folder=await FolderSession.create(handle,ws);assertCurrent(expected);load(ws,"folder",folder);}else{load(ws,"zip");setStatus("dirty");setNotice("แฟ้มใหม่อยู่ในหน่วยความจำ กดส่งออก ZIP เพื่อเก็บในเครื่อง");}return true;}catch(err){if(!(err instanceof DOMException&&err.name==="AbortError"))setError(errorMessage(err));return false;}finally{endOperation();}}
 async function openFolder(){if(!mayLeave()||!beginOperation())return false;const expected=current.current;setError("");try{const handle=await pickDirectory();const opened=await FolderSession.open(handle);assertCurrent(expected);load(opened.workspace,"folder",opened.session);return true;}catch(err){if(!(err instanceof DOMException&&err.name==="AbortError"))setError(errorMessage(err));return false;}finally{endOperation();}}
 async function openZip(file:File){if(!mayLeave()||!beginOperation())return false;const expected=current.current;setError("");try{if(file.size>220*1024*1024)throw new Error("ZIP ใหญ่เกิน 220 MB กรุณาเลือกแฟ้มขนาดเล็กลง");const ws=await importZip(new Uint8Array(await file.arrayBuffer()));assertCurrent(expected);load(ws,"zip");setNotice("เปิด ZIP แล้ว การแก้ไขจะอยู่ในหน่วยความจำจนกว่าจะส่งออก ZIP ฉบับใหม่");return true;}catch(err){setError(errorMessage(err));return false;}finally{endOperation();}}
 async function saveZip(){const ws=current.current;if(!ws||!beginOperation())return;try{const bytes=await exportZip(ws);download(bytes,`tax-folder-${year}-${new Date().toISOString().replaceAll(":","-").slice(0,19)}.zip`,"application/zip");if(current.current===ws&&mode!=="folder")setStatus("saved");setNotice("ส่งออก ZIP แล้ว กรุณาตรวจไฟล์ในรายการดาวน์โหลด เบราว์เซอร์ไม่แจ้งแอปว่าคุณเก็บไฟล์สำเร็จหรือยกเลิก");}catch(err){setError(errorMessage(err));}finally{endOperation();}}
 function save(){if(mode==="folder"&&session.current){const snapshot=current.current!,folder=session.current;saveQueue.current=saveQueue.current.then(()=>saveFolder(snapshot,folder));}else void saveZip();}
 async function recover(){if(!mayLeave()||!window.confirm("กู้คืนโฟลเดอร์เป็นฉบับก่อนบันทึกครั้งล่าสุด? งานหลังจุดสำรองจะถูกแทนที่ กรุณาเก็บ ZIP ของงานปัจจุบันก่อน"))return;if(!beginOperation())return;const expected=current.current;try{const handle=await pickDirectory();await restoreBackup(handle);const opened=await FolderSession.open(handle);assertCurrent(expected);load(opened.workspace,"folder",opened.session);setNotice("กู้คืนสำรองแล้ว");}catch(err){setError(errorMessage(err));}finally{endOperation();}}
 /** Shared pre-change backup: requests a ZIP download, then stops if the workspace changed while it was built. Caller holds the operation lock. */
 async function downloadBackupZip(ws:Workspace,filename:string){download(await exportZip(ws),filename,"application/zip");assertCurrent(ws);}
 async function applyRules(rules:RuleSet,expected:Workspace,expectedYear:number){
  if(!beginOperation())return false;
  setNotice("");
  try{
   const assertTarget=()=>{if(current.current!==expected||currentYear.current!==expectedYear)throw new Error("แฟ้มหรือปีเปลี่ยนหลังตรวจชุดกฎ กรุณานำเข้าและตรวจอีกครั้ง");};
   assertTarget();
   const data=expected.years[expectedYear];
   const replacement=replaceYearRules(data,rules);
   if(replacement===data){setNotice("หลักเกณฑ์ไม่เปลี่ยน ยังคงใช้ชุดกฎเดิม ไม่ได้ติดตั้งรุ่นใหม่");return true;}
   const candidate:Workspace={...expected,years:{...expected.years,[expectedYear]:replacement}};
   assertCarrySources(candidate);
   await downloadBackupZip(expected,`tax-before-rules-${expectedYear}.zip`);
   assertTarget();
   commit(candidate);
   setNotice("เปลี่ยนชุดกฎหลังยืนยันแล้ว รายการที่เงื่อนไขเปลี่ยนต้องตรวจสิทธิอีกครั้ง โปรดตรวจว่าเก็บ ZIP สำรองจากรายการดาวน์โหลดแล้ว");
   return true;
  }catch(err){setError(errorMessage(err));return false;}finally{endOperation();}
 }
 function saveRecord(record:TaxRecord,files:Map<string,Uint8Array>,expected:Workspace,recordYear:number){
  const ws=current.current;
  if(!ws||ws!==expected||year!==recordYear)throw new Error("แฟ้มเปลี่ยนไปแล้ว กรุณาเปิดรายการอีกครั้ง งานเดิมไม่ถูกเขียนทับ");
  const d=ws.years[year],exists=d.records.some(r=>r.id===record.id);
  if(!exists&&d.records.length>=5000)throw new Error("ปีนี้ครบ 5,000 รายการแล้ว กรุณาแยกแฟ้ม");
  const candidate:Workspace={...ws,files:new Map([...ws.files,...files]),years:{...ws.years,[year]:{...d,records:exists?d.records.map(r=>r.id===record.id?record:r):[...d.records,record],profile:{...d.profile,selectedCategories:d.profile.selectedCategories.includes(record.categoryId)?d.profile.selectedCategories:[...d.profile.selectedCategories,record.categoryId]}}}};
  assertCarrySources(candidate);commit(candidate);
 }
 /** Atomic annual upsert for fixed allowances. Optional backup is downloaded before the single commit. */
 async function saveFixedAllowanceClaims(drafts:FixedDraft[],files:Map<string,Uint8Array>,expected:Workspace,recordYear:number,backupFirst:boolean){
  const ws=current.current;
  if(!ws||ws!==expected||year!==recordYear)throw new Error("แฟ้มเปลี่ยนไปแล้ว กรุณาเปิดสิทธิอีกครั้ง งานเดิมไม่ถูกเขียนทับ");
  if(backupFirst){
   if(!beginOperation())throw new Error("กำลังดำเนินการอยู่ กรุณารอสักครู่");
   try{await downloadBackupZip(ws,`tax-before-fixed-${recordYear}.zip`);}
   finally{endOperation();}
  }
  if(current.current!==ws)throw new Error("แฟ้มเปลี่ยนระหว่างสำรอง ยกเลิกการบันทึกเพื่อรักษางานปัจจุบัน");
  const next=applyFixedDrafts(ws.years[recordYear],drafts);
  const candidate:Workspace={...ws,files:new Map([...ws.files,...files]),years:{...ws.years,[recordYear]:next}};
  assertCarrySources(candidate);commit(candidate);
 }
 const statusText=status==="saving"?"กำลังบันทึก…":status==="error"?"บันทึกไม่สำเร็จ":status==="dirty"?(mode==="folder"?"รอบันทึก":"ยังไม่ได้ส่งออก ZIP"):mode==="folder"?"บันทึกแล้ว":mode==="sample"?"ตัวอย่างสมมติ":"ไม่มีการแก้ไขค้างในหน้านี้";
 return {workspace,current,mode,status,statusText,year,setYear,error,setError,busy,notice,setNotice,load,commit,updateYear,mayLeave,create,openFolder,openZip,saveZip,save,recover,applyRules,saveRecord,saveFixedAllowanceClaims};
}
