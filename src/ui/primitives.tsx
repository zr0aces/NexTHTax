import { useEffect, useRef, useId, type ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({title,children,onClose,wide=false,busy=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean;busy?:boolean}) {
 const ref=useRef<HTMLDialogElement>(null); const titleId=useId();
 useEffect(()=>{const element=ref.current;if(element&&!element.open)element.showModal();return()=>{if(element&&element.open)element.close();};},[]);
 return <dialog ref={ref} className={wide?"modal wide":"modal"} onCancel={e=>{e.preventDefault();if(!busy)onClose();}} aria-labelledby={titleId}>
 <header className="modal-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="ปิดหน้าต่าง" disabled={busy} onClick={onClose}><X size={20}/></button></header>{children}</dialog>;
}
export function AmountInput({label,value,onChange,optional=false}:{label:string;value:number|null;onChange:(v:number|null)=>void;optional?:boolean}) {
 return <label>{label}{optional&&<span className="optional"> (ไม่จำเป็น)</span>}<div className="amount-input"><input aria-label={label} type="number" min="0" max="1000000000" step="0.01" value={value===null?"":value/100} onChange={e=>{const n=e.target.value; if(n==="")onChange(null);else if(/^\d+(\.\d{0,2})?$/.test(n)){const amount=Math.round(Number(n)*100);if(Number.isSafeInteger(amount)&&amount<=100_000_000_000)onChange(amount);}}} placeholder="0.00"/><span>บาท</span></div></label>;
}
export function Empty({title,description,children}:{title:string;description:string;children?:ReactNode}) {return <div className="empty"><div className="empty-mark">+</div><h3>{title}</h3><p>{description}</p>{children}</div>;}
