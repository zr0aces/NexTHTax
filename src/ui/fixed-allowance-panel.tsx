import type { FixedAllowanceId, FixedRow } from "../domain/fixed-allowances";
import { money, fixedStatusLabels } from "./format";

const rowLabels: Record<string, string> = {
  personal: "ส่วนตัว", child: "บุตร", "child-additional": "บุตรส่วนเพิ่ม", parents: "บิดามารดา",
  spouse: "คู่สมรสไม่มีเงินได้", "disability-care": "ผู้พิการ/ทุพพลภาพที่อุปการะ",
};

/** Fixed allowances are shown as quantity × rate, separate from actual payments and their documents. */
export function FixedAllowancePanel({rows, year, onOpen}: {rows: FixedRow[]; year: number; onOpen: (id: FixedAllowanceId) => void}) {
  const included = rows.reduce((sum, row) => sum + row.included, 0);
  const reviewItems = rows.reduce((sum, row) => sum + row.pendingRecords, 0);
  const documentsMissing = rows.flatMap(row => row.records).filter(view => view.record.documentStatus !== "complete").length;
  return <section className="fixed-panel" aria-labelledby="fixed-panel-title">
    <div className="fixed-panel-head">
      <div><h2 id="fixed-panel-title">สิทธิของฉันและครอบครัว</h2><p>สิทธิตามจำนวนคนของปี {year} แยกจากรายจ่ายที่จ่ายจริง ไม่ต้องกรอกยอดจ่ายหรือวันที่จ่าย</p></div>
      <span className="pill neutral">ปีภาษี {year}</span>
    </div>
    <ul className="fixed-rows">{rows.map(row => {
      const isPersonal = row.quantityKind === "personal";
      const statusText = isPersonal ? (row.status === "included" ? "รวมในฐานคำนวณแล้ว" : "กฎปีนี้ยังไม่ยืนยัน") : fixedStatusLabels[row.status];
      const confirmed = row.status === "included";
      const equation = row.potential === null
        ? "โปรดระบุจำนวนและตรวจสิทธิ"
        : row.quantityKind === "count" ? `${row.quantity} คน × ${money(row.rate)} บาท = ${money(row.potential)} บาท`
        : isPersonal ? `${money(row.potential)} บาท` : `สิทธิต่อปี ${money(row.rate)} บาท`;
      return <li className={`fixed-row ${confirmed ? "is-included" : ""}`} key={row.ruleId}>
        <div className="fixed-row-name"><h3>{rowLabels[row.ruleId] ?? row.name}</h3><span className={`pill ${confirmed ? "green" : "neutral"}`}>{statusText}</span></div>
        <div className="fixed-row-amounts">
          <p className="fixed-equation">{equation}</p>
          {isPersonal ? <p className="small muted">ยอดนี้นำมาคำนวณแล้วจากกฎส่วนตัว</p>
            : row.status === "none" ? <p className="small muted">ยังไม่ได้ตั้งค่า</p>
            : confirmed ? <p className="small"><strong>นำมาคำนวณ {money(row.included)} บาท</strong></p>
            : row.potential !== null && row.potential > 0 ? <p className="small muted">ยอดตามจำนวนที่ระบุ — ยังไม่นำมาคำนวณ</p> : null}
          {row.pendingRecords > 0 && <p className="small notice-inline">รอตรวจ {row.pendingRecords} รายการ</p>}
        </div>
        {isPersonal ? <span className="small muted fixed-readonly">อ่านอย่างเดียว</span>
          : <button className="button secondary compact" onClick={() => onOpen(row.ruleId as FixedAllowanceId)}>{row.status === "none" ? "เลือกและตั้งค่า" : "แก้ไขสิทธิ"}</button>}
      </li>;
    })}</ul>
    <p className="fixed-footer">รวมในยอดคำนวณ {money(included)} บาท · รอตรวจ {reviewItems} รายการ · เอกสารยังไม่ครบ {documentsMissing} รายการ</p>
  </section>;
}
