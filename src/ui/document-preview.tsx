import { useEffect, useState, lazy, Suspense } from "react";
import type { Attachment, Workspace } from "../domain/model";
import { Modal } from "./primitives";
import { download } from "../reports/download";
const PdfPreview=lazy(()=>import("./pdf-preview"));
export function DocumentPreview({attachment,workspace,onClose}:{attachment:Attachment;workspace:Workspace;onClose:()=>void}){
 const [url,setUrl]=useState("");const bytes=workspace.files.get(attachment.path);
 useEffect(()=>{if(!bytes)return;const next=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:attachment.mime}));setUrl(next);return()=>URL.revokeObjectURL(next);},[attachment.path,bytes]);
 return <Modal title={attachment.originalName} wide onClose={onClose}><div className="modal-body">{!bytes?<p className="error">ไม่พบไฟล์ในแฟ้ม กรุณากู้คืนจากสำรอง</p>:<>{attachment.mime==="application/pdf"?<Suspense fallback={<p role="status">กำลังเตรียมตัวอ่าน PDF ในเครื่อง…</p>}><PdfPreview bytes={bytes}/></Suspense>:<img className="image-preview" src={url} alt={attachment.originalName}/>}<button className="button secondary" onClick={()=>download(bytes,attachment.originalName,attachment.mime)}>ดาวน์โหลดเอกสารต้นฉบับ</button></>}</div></Modal>;
}
