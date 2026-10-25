import { createWorkspace } from "./storage";
import { getRules } from "./domain/rules";
import { newId, type TaxRecord } from "./domain/model";
export function createSample() {
 const ws=createWorkspace("ตัวอย่างสมมติ · ไม่ใช่แฟ้มจริง",getRules(2569));
 ws.years[2569].profile.income=90000000;
 const base={date:"2026-10-01",eligibleAmount:null,provider:"บริษัทตัวอย่าง (สมมติ)",reference:"",note:"ข้อมูลตัวอย่างเพื่อเรียนรู้วิธีใช้ ไม่ใช่เอกสารหรือคำแนะนำซื้อจริง",documentStatus:"none",eligibility:"confirmed",checklist:[],attachments:[],facts:{}} as const;
 ws.years[2569].records=[{...base,id:newId(),categoryId:"health",title:"ประกันสุขภาพรายปี (สมมติ)",amount:1800000},{...base,id:newId(),categoryId:"rmf",title:"ออม RMF (สมมติ)",amount:6000000},{...base,id:newId(),categoryId:"thai-esg",title:"Thai ESG (สมมติ)",amount:2000000}].map(r=>({...r,checklist:[],attachments:[],facts:{}})) as TaxRecord[];
 ws.years[2569].profile.selectedCategories=["health","life","rmf","thai-esg","housing"];
 return ws;
}
