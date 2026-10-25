import { CATEGORIES, categoryLabel, subcategoryLabel } from "../domain/documents";
import { formatSatang } from "../domain/money";
import type { Manifest } from "../domain/schema";
import { coverageFor, type AnyRuleBundle } from "../domain/rules";
import { summarizeYear, summarizeSubcategories, type SummaryResult } from "../domain/summary";
import { buddhistYear } from "../domain/years";

interface Props {
  manifest: Manifest;
  taxYear: number;
  pinned: AnyRuleBundle | null;
}

const DISCLAIMER =
  "สรุปนี้เป็นข้อมูลที่คุณบันทึกและยอดที่คุณเลือกใช้สิทธิ ไม่ใช่การคำนวณภาษีสุทธิ และไม่ใช่การรับรองสิทธิหรือความครบถ้วนสำหรับการยื่นภาษี";

/** Year summary with evidence, user-selected claim base and unknown rule coverage kept separate. */
export function YearOverview({ manifest, taxYear, pinned }: Props) {
  const summary = summarizeYear(manifest.records, taxYear);
  const yearEntry = manifest.years[String(taxYear)];

  return (
    <section aria-labelledby="overview-title" className="overview card">
      <div className="overview-header">
        <h2 id="overview-title">
          สรุปปีภาษี {taxYear} (พ.ศ. {buddhistYear(taxYear)})
        </h2>

      </div>

      {!summary.ok ? (
        <p role="alert" className="error alert-danger">ยอดรวมเกินช่วงที่ระบบคำนวณได้อย่างแม่นยำ จึงไม่แสดงยอดรวม</p>
      ) : (
        <>
          {/* Tabular totals for accessibility & test contracts */}
          <dl className="totals">
            <dt>ยอดตามหลักฐานเอกสาร (บาท)</dt>
            <dd>{formatSatang(summary.evidenceTotal)}</dd>
            <dt>ยอดที่คุณเลือกใช้สิทธิ (ก่อนกฎ, บาท)</dt>
            <dd>{formatSatang(summary.claimedTotal)}</dd>
            <dt>ยอดที่เลือกใช้สิทธิและตรวจทานแล้ว (บาท)</dt>
            <dd>{formatSatang(summary.reviewedClaimedTotal)}</dd>
            <dt>หัก ณ ที่จ่ายที่บันทึกไว้ (แสดงแยก ไม่ใช่ค่าลดหย่อน, บาท)</dt>
            <dd>{formatSatang(summary.withheldTotal)}</dd>
            <dt>รายการที่ยังไม่ระบุยอดใช้สิทธิ</dt>
            <dd>{summary.unknownClaimCount} รายการ</dd>
            <dt>รอเอกสาร / รอตรวจทาน / ตรวจทานแล้ว</dt>
            <dd>
              {summary.counts["waiting-document"]} / {summary.counts["waiting-review"]} / {summary.counts.reviewed}
            </dd>
            <dt>ไม่นับในสรุป / อยู่ในถังขยะ</dt>
            <dd>
              {summary.excludedCount} / {summary.trashedCount}
            </dd>
          </dl>
        </>
      )}

      <section aria-labelledby="subcategories-title" className="subcategories-section">
        <h3 id="subcategories-title">รวบรวมกองทุนและประกันแยกประเภท</h3>
        <p className="muted">รายการย่อยเป็นส่วนหนึ่งของยอดหมวดหลัก ไม่บวกซ้ำกับยอดรวม และไม่ใช่ยอดสิทธิที่กฎหมายรับรอง</p>
        {summarizeSubcategories(manifest.records, taxYear).map((group) => (
          <div key={group.parent} className="subtype-group">
            <h4>{categoryLabel(group.parent)}</h4>
            <table>
              <caption>ยอดปี {taxYear} · {categoryLabel(group.parent)}</caption>
              <thead>
                <tr>
                  <th scope="col">ประเภท</th>
                  <th scope="col">ยอดหลักฐาน</th>
                  <th scope="col">ยอดที่เลือกใช้สิทธิ</th>
                  <th scope="col">ตรวจทานแล้ว</th>
                  <th scope="col">ยังไม่ทราบยอด</th>
                  <th scope="col">ไม่นับ / ถังขยะ</th>
                </tr>
              </thead>
              <tbody>
                <SubtypeRow label="รวมหมวดหลัก" summary={group.summary} />
                {group.children.map((row) => (
                  <SubtypeRow key={row.subcategory ?? "unclassified"} label={subcategoryLabel(row.subcategory)} summary={row.summary} />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <h3>กฎที่ใช้กับปีนี้</h3>
      {pinned ? (
        <p>
          เวอร์ชัน {pinned.version} ตรวจทานเมื่อ {pinned.reviewedAt} {pinned.officialReviewed ? "(ยืนยันแล้วจากรายการที่แอปรองรับ)" : "(ยังไม่ได้ยืนยันกับแหล่งทางการ)"}
        </p>
      ) : (
        <p>ยังไม่ได้ปักกฎสำหรับปีนี้ ยอดสิทธิหลังกฎจะแสดงเป็นยังไม่มีข้อมูล</p>
      )}
      <ul className="coverage">
        {CATEGORIES.filter((c) => c.group === "deduction" || c.group === "donation").map((c) => (
          <li key={c.id}>
            <span>{categoryLabel(c.id)}</span>
            <span className="muted">{coverageText(coverageFor(pinned, c.id))}</span>
          </li>
        ))}
      </ul>
      <p className="disclaimer">{DISCLAIMER}</p>
      <p className="muted">ข้อมูลปีนี้: {yearEntry ? "มีการบันทึกการตั้งค่าปี" : "ยังไม่มีการตั้งค่าปี"}</p>
      <div className="actions">
        <button type="button" onClick={() => window.print()}>พิมพ์หรือบันทึกเป็น PDF</button>
      </div>

      <section className="print-only" aria-label="มุมมองสำหรับพิมพ์">
        <h2>รายงานสรุปปีภาษี {taxYear}</h2>
        <p>{DISCLAIMER}</p>
        <p>กฎที่ใช้: {pinned ? `${pinned.version} ตรวจทานเมื่อ ${pinned.reviewedAt}` : "ยังไม่ได้ปักกฎ"}</p>
        <p>เอกสารนี้ไม่ใช่ไฟล์ยื่นภาษีตามรูปแบบของกรมสรรพากร</p>
      </section>
    </section>
  );
}

function SubtypeRow({ label, summary }: { label: string; summary: SummaryResult }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      {summary.ok ? (
        <>
          <td>{formatSatang(summary.evidenceTotal)}</td>
          <td>{formatSatang(summary.claimedTotal)}</td>
          <td>{formatSatang(summary.reviewedClaimedTotal)}</td>
          <td>{summary.unknownClaimCount}</td>
          <td>{summary.excludedCount} / {summary.trashedCount}</td>
        </>
      ) : (
        <td colSpan={5}>ยอดเกินช่วงที่คำนวณได้ ไม่แสดงยอดรวม</td>
      )}
    </tr>
  );
}

function coverageText(status: "verified" | "partial" | "unavailable"): string {
  if (status === "verified") return "มีกฎที่ตรวจแล้ว";
  if (status === "partial") return "มีกฎบางส่วน (ยังไม่ครบ)";
  return "ยังไม่มีกฎที่ตรวจแล้ว ยอดสิทธิหลังกฎยังไม่แสดง";
}
