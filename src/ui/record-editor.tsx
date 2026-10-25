import { ZodError } from "zod";
import { useState, useRef, type FormEvent } from "react";
import { FilePlus2, UploadCloud, FileText, Trash2 } from "lucide-react";
import type { Workspace, TaxRecord, Attachment } from "../domain/model";
import { newId, recordSchema } from "../domain/model";
import { addAttachments } from "../storage/documents";
import { Modal, AmountInput } from "./primitives";
import { docLabels, eligibilityLabels } from "./format";
export function RecordEditor({workspace,year,record,categoryId,onClose,onSave}:{workspace:Workspace;year:number;record?:TaxRecord;categoryId?:string;onClose:()=>void;onSave:(record:TaxRecord,files:Map<string,Uint8Array>,expected:Workspace,year:number)=>void}) {
 const source=useRef(workspace),submitting=useRef(false);
 const rules=workspace.years[year].rules.rules.filter(r=>r.id!=="personal"&&r.kind!=="expense");
 const [draft,setDraft]=useState<TaxRecord>(()=>record?structuredClone(record):{id:newId(),categoryId:categoryId??rules[0]?.id??"income-doc",title:"",amount:0,date:`${year-543}-${new Date().toISOString().slice(5,10)}`,eligibleAmount:null,provider:"",reference:"",note:"",documentStatus:"none",eligibility:"unchecked",checklist:[],attachments:[],facts:{}});
 const [files,setFiles]=useState<File[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const rule=rules.find(r=>r.id===draft.categoryId)??rules[0];
 function patch(part:Partial<TaxRecord>){setDraft({...draft,...part});}
 function choose(list:FileList|null){if(list)setFiles(prev=>[...prev,...Array.from(list)]);}
 async function submit(e:FormEvent){e.preventDefault();if(submitting.current)return;submitting.current=true;setError("");setBusy(true);try {
 if(!draft.title.trim())throw new Error("กรุณาตั้งชื่อรายการ");
 if(!draft.date.startsWith(`${year-543}-`)||!Number.isFinite(Date.parse(draft.date))||new Date(`${draft.date}T12:00:00Z`).toISOString().slice(0,10)!==draft.date)throw new Error("วันที่จ่ายต้องเป็นวันที่จริงในปีภาษีที่เลือก");
 if(draft.eligibleAmount!==null&&draft.eligibleAmount>draft.amount)throw new Error("ยอดเข้าเกณฑ์ต้องไม่เกินยอดจ่ายจริง");
 if(draft.attachments.length+files.length>20)throw new Error("แนบได้ไม่เกิน 20 ไฟล์ต่อรายการ");
 const staged={...workspace,files:new Map(workspace.files)};
 const attachments=await addAttachments(staged,year,rule.group,files);
 const all=[...draft.attachments,...attachments];
 if(draft.documentStatus==="complete"&&(!all.length||!rule.documents.every(d=>draft.checklist.includes(d))))throw new Error("ก่อนระบุว่าเอกสารครบ กรุณาแนบไฟล์และตรวจ checklist ให้ครบ");
 onSave(recordSchema.parse({...draft,title:draft.title.trim(),attachments:all,documentStatus:all.length?(draft.documentStatus==="none"?"partial":draft.documentStatus):"none",eligibility:rule.status==="verified"?draft.eligibility:"pending"}),staged.files,source.current,year);
 }catch(err){setError(err instanceof ZodError?"ข้อมูลบางช่องไม่ถูกต้อง กรุณาตรวจจำนวนเงิน วันที่ และจำนวนไฟล์":err instanceof Error?err.message:"เพิ่มเอกสารไม่สำเร็จ");}finally{submitting.current=false;setBusy(false);}}
 return <Modal title={record?"แก้ไขรายการ / เพิ่มหลักฐาน":"เพิ่มรายการใช้เงินหรือเอกสาร"} onClose={()=>{if(!submitting.current)onClose();}} busy={busy} wide><form onSubmit={submit} className="editor-form"><fieldset disabled={busy} className="editor-fieldset">
 <p className="muted">{record?"เพิ่มไฟล์ให้รายการเดิมได้ โดยไม่สร้างยอดใช้เงินซ้ำ":"ยังไม่พร้อมแนบเอกสาร? บันทึกรายการไว้ก่อน แล้วค่อยเพิ่มภายหลังได้"}</p>
 <div className="form-grid"><label className="full">หมวด<select aria-label="หมวด" value={draft.categoryId} onChange={e=>patch({categoryId:e.target.value,checklist:[],eligibility:"unchecked",facts:{}})}>{rules.map(r=><option value={r.id} key={r.id}>{r.name}{r.status!=="verified"?" · เก็บเอกสาร / รอยืนยัน":""}</option>)}</select></label>
 <label className="full">ชื่อรายการ<input required maxLength={200} value={draft.title} onChange={e=>patch({title:e.target.value})} placeholder="เช่น เบี้ยประกันสุขภาพรายปี"/></label>
 <AmountInput label={rule.group==="family"?"ยอดจ่ายจริง (ถ้ามี)":"จำนวนเงินที่จ่าย"} value={draft.amount} onChange={v=>patch({amount:v??0})}/><label>วันที่จ่าย<input type="date" required min={`${year-543}-01-01`} max={`${year-543}-12-31`} value={draft.date} onChange={e=>patch({date:e.target.value})}/></label></div>
 <section className="drop-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(busy)return;choose(e.dataTransfer.files);}}><UploadCloud/><strong>ลากเอกสารมาวางที่นี่</strong><span>PDF, JPG, PNG, WebP · ไม่เกิน 20 MB ต่อไฟล์</span><label className="button secondary">เลือกหลายไฟล์<input className="sr-only" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>{choose(e.target.files);e.target.value="";}}/></label></section>
 <ul className="file-list">{draft.attachments.map((a:Attachment)=><li key={a.id}><FileText size={16}/><span>{a.originalName}</span><button type="button" aria-label={`นำ ${a.originalName} ออกจากรายการ`} className="icon-button" onClick={()=>patch({attachments:draft.attachments.filter(x=>x.id!==a.id),documentStatus:"partial"})}><Trash2 size={16}/></button></li>)}{files.map((f,i)=><li key={i}><FilePlus2 size={16}/><span>{f.name}</span><button type="button" className="icon-button" aria-label={`นำไฟล์ใหม่ ${f.name} ออก`} onClick={()=>setFiles(files.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></li>)}</ul>
 <details className="conditions"><summary>ดูเงื่อนไขและตรวจสิทธิ</summary><p>{rule.description}</p><ul>{rule.conditions.map(c=><li key={c}>{c}</li>)}</ul>{rule.status!=="verified"&&<p className="notice">กฎรายการนี้ยังไม่ยืนยัน เก็บเอกสารได้ แต่ไม่รวมยอดคำนวณ</p>}
 {["child","child-additional","parents","disability-care"].includes(rule.id)&&<label>จำนวนผู้มีสิทธิตามเงื่อนไข<input type="number" min={0} max={20} value={draft.facts.qualifyingCount??0} onChange={e=>patch({facts:{...draft.facts,qualifyingCount:Number(e.target.value)}})}/><span className="muted">รวมจำนวนไว้ในรายการเดียวต่อสิทธิ ระบบใช้จำนวนนี้คำนวณ ไม่ใช้ยอดจ่ายจริง</span></label>}
 <label>สถานะสิทธิ<select aria-label="สถานะสิทธิ" value={rule.status==="verified"?draft.eligibility:"pending"} disabled={rule.status!=="verified"} onChange={e=>patch({eligibility:e.target.value as TaxRecord["eligibility"]})}>{Object.entries(eligibilityLabels).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <p className="muted">“ผู้ใช้ตรวจยืนยันแล้ว” หมายถึงคุณตรวจเงื่อนไขข้างต้นแล้ว ไม่ใช่การรับรองจากแอป</p>
 {rule.documents.map(d=><label className="check" key={d}><input type="checkbox" checked={draft.checklist.includes(d)} onChange={e=>patch({checklist:e.target.checked?[...draft.checklist,d]:draft.checklist.filter(x=>x!==d)})}/>{d}</label>)}
 <label>สถานะเอกสาร<select aria-label="สถานะเอกสาร" value={draft.documentStatus} onChange={e=>patch({documentStatus:e.target.value as TaxRecord["documentStatus"]})}>{Object.entries(docLabels).map(([v,t])=><option value={v} key={v}>{t}</option>)}</select></label><p className="muted">เอกสารครบ ไม่ได้แปลว่าเข้าเงื่อนไขทางภาษีเสมอไป</p>
 </details>
 <details><summary>ข้อมูลเพิ่มเติม (ไม่จำเป็น)</summary><div className="form-grid"><AmountInput label="ยอดเข้าเกณฑ์ตามหนังสือรับรอง" value={draft.eligibleAmount} onChange={v=>patch({eligibleAmount:v})} optional/><label>ผู้ให้บริการ<input maxLength={200} value={draft.provider} onChange={e=>patch({provider:e.target.value})}/></label><label>เลขอ้างอิง<input maxLength={200} value={draft.reference} onChange={e=>patch({reference:e.target.value})}/></label>
 {rule.id==="housing"&&<label>จำนวนผู้กู้ร่วม<input type="number" min={1} max={20} value={draft.facts.coBorrowers??1} onChange={e=>patch({facts:{...draft.facts,coBorrowers:Number(e.target.value)}})}/><span className="muted">กรอกดอกเบี้ยรวม ระบบจะแบ่งเท่ากันตามจำนวนผู้กู้</span></label>}
 {rule.id==="pension"&&<AmountInput label="ส่วนเบี้ยเข้าประกันชีวิต (เว้นว่าง = จัดสรรอัตโนมัติ)" value={draft.facts.pensionLifeAllocation??null} onChange={v=>patch({facts:{...draft.facts,pensionLifeAllocation:v??undefined}})}/>}
 {rule.id==="thai-esgx-carry"&&<><label>รหัสอ้างอิงหนังสือสับเปลี่ยนเดิม<input required pattern="[a-zA-Z0-9_-]{1,100}" value={draft.facts.carrySourceId??""} onChange={e=>patch({facts:{...draft.facts,carrySourceId:e.target.value}})}/></label><AmountInput label="ยอดสับเปลี่ยน LTF ปี 2568" value={draft.facts.carryTransfer??null} onChange={v=>patch({facts:{...draft.facts,carryTransfer:v??0}})}/><AmountInput label="ยอดใช้สิทธิในปี 2568" value={draft.facts.carryFirstYearUsed??null} onChange={v=>patch({facts:{...draft.facts,carryFirstYearUsed:v??0}})}/><label className="check"><input type="checkbox" checked={draft.facts.carryProofConfirmed??false} onChange={e=>patch({facts:{...draft.facts,carryProofConfirmed:e.target.checked}})}/>ตรวจหลักฐานสับเปลี่ยนและสิทธิเดิมแล้ว</label></>}
 <label className="full">หมายเหตุ<textarea rows={3} maxLength={2000} value={draft.note} onChange={e=>patch({note:e.target.value})}/></label></div></details>
 {error&&<div role="alert" className="error">{error}</div>}<footer className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={onClose}>ยกเลิก</button><button className="button primary" disabled={busy}>{busy?"กำลังตรวจไฟล์…":"บันทึกรายการ"}</button></footer></fieldset></form></Modal>;
}
