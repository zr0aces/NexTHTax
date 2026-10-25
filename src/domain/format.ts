import type { RecordState } from "./fixed-allowances";

/** Neutral formatters and labels shared by UI and storage. No DOM or React here. */
export const money = (satang: number) => new Intl.NumberFormat("th-TH", {maximumFractionDigits:2}).format(satang / 100);
export const recordStateLabels: Record<RecordState,string> = {counted:"นับในยอดสิทธิแล้ว",duplicate:"ไม่นับ · รายการซ้ำ",unconfirmed:"ยังไม่ยืนยันให้นำมาคำนวณ",ineligible:"ผู้ใช้ระบุว่าไม่เข้าเงื่อนไข",["invalid-date"]:"วันที่ไม่อยู่ในปีภาษี",["needs-count"]:"โปรดระบุจำนวนและตรวจสิทธิ",["rule-pending"]:"กฎปีนี้ยังไม่ยืนยัน"};
