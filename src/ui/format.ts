export const money = (satang: number) => new Intl.NumberFormat("th-TH", {maximumFractionDigits:2}).format(satang / 100);
export const fullMoney = (satang: number) => `${money(satang)} บาท`;
export function parseMoney(value: string): number | null {
 if (!value.trim()) return null;
 if (!/^\d{1,10}(\.\d{0,2})?$/.test(value)) throw new Error("กรุณาระบุจำนวนเงินไม่เกินสองตำแหน่งทศนิยม");
 const [whole, decimal = ""] = value.split(".");
 const result = Number(whole) * 100 + Number(decimal.padEnd(2,"0"));
 if (!Number.isSafeInteger(result) || result > 100_000_000_000) throw new Error("จำนวนเงินสูงเกินขอบเขตที่รองรับ");
 return result;
}
export const dateLabel = (date: string) => new Intl.DateTimeFormat("th-TH", {day:"numeric",month:"short",year:"numeric"}).format(new Date(`${date}T12:00:00`));
export const groupNames: Record<string,string> = {family:"ส่วนตัวและครอบครัว", insurance:"ประกันและประกันสังคม",retirement:"ออมเพื่อเกษียณ",investment:"การลงทุนที่มีสิทธิภาษี",housing:"ที่อยู่อาศัย",donations:"เงินบริจาค",special:"มาตรการเฉพาะปี",income:"รายได้และการยื่นภาษี",other:"หมวดของฉัน"};
export const docLabels = {none:"ยังไม่มีเอกสาร",partial:"มีเอกสารบางส่วน",complete:"ครบตามรายการตรวจ"};
export const eligibilityLabels = {unchecked:"ยังไม่ได้ตรวจสิทธิ",confirmed:"ผู้ใช้ตรวจยืนยันแล้ว",ineligible:"ไม่เข้าเงื่อนไข",pending:"รอกฎยืนยัน"};
