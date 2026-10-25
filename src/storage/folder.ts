import { manifestSchema, type Workspace } from "../domain/model";
import { exportZip, importZip, safeArchivePath } from "./zip";
import { encodeJson, hashBytes, MAX_FILE, MAX_TOTAL, parseJson, serializedFiles, validateWorkspace, workspaceFromFiles } from "./validation";
const PENDING=".tax-pending.json", BACKUP=".tax-backup.zip";
type Directory = FileSystemDirectoryHandle & {entries():AsyncIterableIterator<[string,FileSystemHandle]>};
async function exists(root:FileSystemDirectoryHandle,path:string):Promise<boolean> {
 try {await readPath(root,path); return true;} catch(error) {if(error instanceof DOMException && error.name==="NotFoundError")return false; throw error;}
}
async function readPath(root:FileSystemDirectoryHandle,path:string,max=MAX_TOTAL+20*1024*1024):Promise<Uint8Array> {
 const parts=path.split("/"); let directory=root;
 for(const part of parts.slice(0,-1)) directory=await directory.getDirectoryHandle(part);
 const file=await (await directory.getFileHandle(parts.at(-1)!)).getFile();
 if(file.size>max) throw new Error("ไฟล์ในแฟ้มใหญ่เกินกำหนด");
 return new Uint8Array(await file.arrayBuffer());
}
async function writePath(root:FileSystemDirectoryHandle,path:string,bytes:Uint8Array):Promise<void> {
 const parts=path.split("/"); let directory=root;
 for(const part of parts.slice(0,-1)) directory=await directory.getDirectoryHandle(part,{create:true});
 const handle=await directory.getFileHandle(parts.at(-1)!,{create:true});
 const writable=await handle.createWritable();
 try {await writable.write(new Uint8Array(bytes).buffer); await writable.close();}
 catch(error) {try {await writable.abort();} catch {/* Preserve original write error. */} throw error;}
}
async function removePath(root:FileSystemDirectoryHandle,path:string):Promise<void> {
 const parts=path.split("/"); let directory=root;
 for(const part of parts.slice(0,-1)) directory=await directory.getDirectoryHandle(part);
 await directory.removeEntry(parts.at(-1)!);
}
async function readManaged(root:FileSystemDirectoryHandle):Promise<Map<string,Uint8Array>> {
 const files=new Map<string,Uint8Array>(); let total=0;
 async function visit(directory:FileSystemDirectoryHandle,prefix:string,depth:number):Promise<void> {
  if(depth>5) throw new Error("โครงสร้างแฟ้มซับซ้อนเกินกำหนด");
  for await (const [name,entry] of (directory as Directory).entries()) {
   const path=prefix+name;
   if(entry.kind==="directory") {
    if(path==="years" || /^years\/[0-9]{4}$/.test(path) || /^years\/[0-9]{4}\/documents(?:\/(insurance|retirement|donations|housing|family|other))?$/.test(path)) await visit(entry as FileSystemDirectoryHandle,path+"/",depth+1);
   } else if(path==="manifest.json" || /^years\/[0-9]{4}\/(profile|records|rules-snapshot)\.json$/.test(path) || path.includes("/documents/")) {
    if(!safeArchivePath(path)) throw new Error("พบชื่อเอกสารที่ไม่ปลอดภัยในแฟ้มภาษี");
    const bytes=await readPath(root,path,path.endsWith(".json")?8*1024*1024:MAX_FILE);
    total+=bytes.length;
    if(files.size>=1100 || total>MAX_TOTAL+20*1024*1024) throw new Error("แฟ้มใหญ่เกินขนาดที่รองรับ");
    files.set(path,bytes);
   }
  }
 }
 await visit(root,"",0); return files;
}
async function fingerprint(files:Map<string,Uint8Array>):Promise<Map<string,string>> {return new Map(await Promise.all([...files].map(async([path,bytes])=>[path,await hashBytes(bytes)] as const)));}
async function assertUnchanged(root:FileSystemDirectoryHandle,baseline:Map<string,string>):Promise<void> {
 if(await exists(root,PENDING)) throw new Error("มีการบันทึกค้างอยู่ กรุณากู้คืนสำรองก่อนเปิดแฟ้มอีกครั้ง");
 const current=await fingerprint(await readManaged(root));
 if(current.size!==baseline.size || [...baseline].some(([path,hash])=>current.get(path)!==hash)) throw new Error("แฟ้มถูกแก้ไขจากภายนอกหรือแท็บอื่น ไม่ได้เขียนทับ กรุณาส่งออก ZIP เก็บงานนี้แล้วเปิดแฟ้มเดิมใหม่");
}
async function assertWritten(root:FileSystemDirectoryHandle,files:Map<string,Uint8Array>):Promise<void> {
 const expected=await fingerprint(files), actual=await fingerprint(await readManaged(root));
 if(expected.size!==actual.size || [...expected].some(([path,hash])=>actual.get(path)!==hash)) throw new Error("ตรวจพบข้อมูลเปลี่ยนระหว่างบันทึก กรุณากู้คืนสำรองก่อนแก้ไขต่อ");
}
async function withLock<T>(id:string,action:()=>Promise<T>):Promise<T> {
 const locks=typeof navigator!=="undefined"?navigator.locks:undefined;
 if(!locks) throw new Error("เบราว์เซอร์นี้ไม่มีระบบล็อกแฟ้มที่ปลอดภัย กรุณาใช้โหมด ZIP");
 return locks.request(`next-th-tax:${id}`,{mode:"exclusive",ifAvailable:true},async lock=>{if(!lock)throw new Error("แฟ้มกำลังบันทึกจากแท็บอื่น กรุณาลองอีกครั้ง"); return action();});
}
async function ensureYearDirectories(root:FileSystemDirectoryHandle,workspace:Workspace):Promise<void> {
 const years=await root.getDirectoryHandle("years",{create:true});
 for(const year of workspace.manifest.years) {
  const directory=await years.getDirectoryHandle(String(year),{create:true});
  await directory.getDirectoryHandle("exports",{create:true});
  const documents=await directory.getDirectoryHandle("documents",{create:true});
  for(const group of ["insurance","retirement","donations","housing","family","other"]) await documents.getDirectoryHandle(group,{create:true});
 }
}
export class FolderSession {
 private baseline:Map<string,string>;
 private persisted:Workspace;
 private saving=false;
 private constructor(private root:FileSystemDirectoryHandle, workspace:Workspace, baseline:Map<string,string>) {this.persisted=workspace;this.baseline=baseline;}
 static async create(root:FileSystemDirectoryHandle,input:Workspace):Promise<FolderSession> {
  const workspace=await validateWorkspace(input);
  return withLock("create-folder",async()=>{
   for await(const _entry of (root as Directory).entries()) throw new Error("กรุณาเลือกโฟลเดอร์ว่าง เพื่อไม่เขียนทับไฟล์เดิม");
   const marker=encodeJson({schemaVersion:1,creating:true,createdAt:new Date().toISOString()});
   await writePath(root,PENDING,marker);
   await ensureYearDirectories(root,workspace);
   const files=serializedFiles(workspace);
   for(const[path,bytes]of files)await writePath(root,path,bytes);
   await assertWritten(root,files);
   await root.removeEntry(PENDING);
   return new FolderSession(root,await validateWorkspace(workspace),await fingerprint(files));
  });
 }
 static async open(root:FileSystemDirectoryHandle):Promise<{session:FolderSession;workspace:Workspace}> {
  if(await exists(root,PENDING)) throw new Error("พบการบันทึกไม่สมบูรณ์ ห้ามแก้ไขต่อ กรุณากดกู้คืนสำรองของโฟลเดอร์นี้");
  const initial=manifestSchema.parse(parseJson(await readPath(root,"manifest.json",8*1024*1024),"manifest.json"));
  return withLock(initial.id,async()=>{
   if(await exists(root,PENDING)) throw new Error("พบการบันทึกไม่สมบูรณ์ ห้ามแก้ไขต่อ กรุณากดกู้คืนสำรองของโฟลเดอร์นี้");
   const files=await readManaged(root); const workspace=await workspaceFromFiles(files);
   if(workspace.manifest.id!==initial.id) throw new Error("แฟ้มถูกเปลี่ยนระหว่างเปิด กรุณาเลือกโฟลเดอร์ใหม่อีกครั้ง");
   if(await exists(root,PENDING)) throw new Error("พบการบันทึกไม่สมบูรณ์ ห้ามแก้ไขต่อ กรุณากดกู้คืนสำรองของโฟลเดอร์นี้");
   return {session:new FolderSession(root,await validateWorkspace(workspace),await fingerprint(files)),workspace};
  });
 }
 async save(input:Workspace):Promise<void> {
  if(this.saving)throw new Error("กำลังบันทึก กรุณารอสักครู่");
  this.saving=true;
  try {
   const workspace=await validateWorkspace(input);
   if(workspace.manifest.id!==this.persisted.manifest.id)throw new Error("ไม่สามารถเขียนแฟ้มคนละชุดลงโฟลเดอร์เดิม");
   await withLock(workspace.manifest.id,async()=>{
    await assertUnchanged(this.root,this.baseline);
    const backup=await exportZip(this.persisted);
    await writePath(this.root,BACKUP,backup);
    await assertUnchanged(this.root,this.baseline);
    const next={...workspace,manifest:{...workspace.manifest,revision:this.persisted.manifest.revision+1,updatedAt:new Date().toISOString()}};
    const files=serializedFiles(next);
    await writePath(this.root,PENDING,encodeJson({schemaVersion:1,backupHash:await hashBytes(backup),createdAt:new Date().toISOString()}));
    await ensureYearDirectories(this.root,next);
    for(const[path,bytes]of files)await writePath(this.root,path,bytes);
    await assertWritten(this.root,files);
    await this.root.removeEntry(PENDING);
    this.persisted=await validateWorkspace(next); this.baseline=await fingerprint(files);
    input.manifest={...next.manifest};
   });
  } finally {this.saving=false;}
 }
}
export async function restoreBackup(root:FileSystemDirectoryHandle):Promise<void> {
 const bytes=await readPath(root,BACKUP);
 const backupHash=await hashBytes(bytes);
 const markerBytes=await exists(root,PENDING)?await readPath(root,PENDING,4096):null;
 const markerHash=markerBytes?await hashBytes(markerBytes):null;
 if(markerBytes) {
  const marker=parseJson(markerBytes,PENDING) as {backupHash?:string};
  if(!marker.backupHash || backupHash!==marker.backupHash) throw new Error("สำรองไม่ตรงกับงานที่บันทึกค้าง กรุณาใช้ ZIP สำรองที่เก็บไว้");
 }
 const workspace=await importZip(bytes);
 await withLock(workspace.manifest.id,async()=>{
  const currentBackupHash=await hashBytes(await readPath(root,BACKUP));
  const currentMarkerHash=await exists(root,PENDING)?await hashBytes(await readPath(root,PENDING,4096)):null;
  if(currentBackupHash!==backupHash||currentMarkerHash!==markerHash) throw new Error("สำรองหรือสถานะบันทึกเปลี่ยนระหว่างเตรียมกู้คืน ยังไม่ได้เขียนทับ กรุณาลองกู้คืนใหม่");
  const files=serializedFiles(workspace);
  await writePath(root,PENDING,encodeJson({schemaVersion:1,backupHash,restoring:true}));
  const current=await readManaged(root);
  for(const[path,data]of files)await writePath(root,path,data);
  for(const path of current.keys())if(!files.has(path))await removePath(root,path);
  await assertWritten(root,files);
  await root.removeEntry(PENDING);
 });
}
