import type { RuleSet, TaxRule } from "../domain/model";
import { isAnnualCompatible, quantityKindOf } from "../domain/fixed-allowances";
import { fullMoney } from "./format";

/** Describes snapshot metadata only. Allowed amounts and remaining capacity belong to calculate. */
export function CategoryLimit({rule, rules}: {rule: TaxRule; rules: RuleSet}) {
  if (rule.status === "expired") return <span className="category-limit">สิทธิสิ้นสุดแล้ว · เก็บเอกสารเท่านั้น</span>;
  if (rule.kind === "documents") return <span className="category-limit">เก็บเอกสารเท่านั้น · ไม่เพิ่มยอดลดหย่อน</span>;
  const pending = rule.status !== "verified";
  const unit = isAnnualCompatible(rule, rules.taxYear)
    ? quantityKindOf(rule.id) === "count" ? "/คนที่เข้าเงื่อนไข" : "/ปีเมื่อเข้าเงื่อนไข" : "";
  const shared = rule.sharedCap === null ? undefined : rules.sharedCaps[rule.sharedCap];
  return <span className={`category-limit${pending ? " is-pending" : ""}`}>
    <strong>{pending ? "รอตรวจสอบ · ยังไม่นำมาคำนวณ" : "เพดานตามหลักเกณฑ์"}</strong>
    {rule.cap !== null && <span>{pending ? "วงเงินอ้างอิงเท่านั้น: " : rule.formula === "pension" ? "ส่วนเกษียณเพิ่มเติมไม่เกิน " : "ไม่เกิน "}{fullMoney(rule.cap)}{unit}</span>}
    {rule.rateBps !== null && <span>{rule.formula === "donation" && rule.multiplier > 1 ? "ยอดหลังคูณตามสิทธิไม่เกิน " : rule.cap === null ? "ไม่เกิน " : "และไม่เกิน "}{rule.rateBps / 100}% · {rule.incomeBase}</span>}
    {rule.cap === null && rule.rateBps === null && <span>ตรวจวงเงินและเงื่อนไขเฉพาะรายการก่อนใช้สิทธิ</span>}
    {rule.sharedCap && <span>{shared === undefined ? "ใช้เพดานร่วมตามฐานและเงื่อนไขเดียวกัน" : `รวมหมวดที่ใช้วงเงินร่วมกันไม่เกิน ${fullMoney(shared)}`} · ห้ามบวกวงเงินเหลือข้ามหมวด</span>}
    {rule.formula === "pension" && <span>เบี้ยส่วนที่ใช้วงเงินชีวิตยังอาจใช้สิทธิได้แยกจากส่วนเกษียณเพิ่มเติม ห้ามนับเบี้ยซ้ำ</span>}
    <span className="limit-description">{rule.description}</span>
  </span>;
}
