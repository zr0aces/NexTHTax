import { CATEGORIES, categoryLabel } from "../domain/documents";
import { coverageFor, isTrustedMatch, safeOfficialHref, type Catalog, type AnyRuleBundle } from "../domain/rules";
import type { CatalogEntry } from "../domain/rules";

interface Props {
  taxYear: number;
  pinned: { bundle: AnyRuleBundle; digest: string } | null;
  catalog: Catalog | null;
  catalogError: string | null;
  latest: CatalogEntry | null;
  busy: boolean;
  onCheck: () => void;
  onPinLatest: () => void;
}

/** Shows pinned rules for one year, the latest shipped catalog entry, and consent-based update. Imported text is plain text. */
export function RuleReview({ taxYear, pinned, catalog, catalogError, latest, busy, onCheck, onPinLatest }: Props) {
  const trusted = pinned ? isTrustedMatch(catalog, pinned.bundle, pinned.digest) : false;
  const updateAvailable = latest !== null && (pinned === null || pinned.digest !== latest.sha256);
  return (
    <section aria-labelledby="rules-title" className="rules">
      <h2 id="rules-title">กฎภาษีรายปี ({taxYear})</h2>
      <p className="disclaimer">
        กฎที่แสดงเป็นข้อมูลอ้างอิงที่ปักไว้ในโฟลเดอร์ ยอดของคุณไม่เปลี่ยนเมื่อเปลี่ยนกฎ ตรวจรายการอัปเดตเมื่อออนไลน์
      </p>
      <button type="button" disabled={busy} onClick={onCheck}>ตรวจรายการกฎอัปเดต</button>
      {catalogError && <p role="alert" className="error">{catalogError}</p>}
      {pinned ? (
        <div>
          <p>
            ปักไว้: เวอร์ชัน {pinned.bundle.version} ตรวจทานเมื่อ {pinned.bundle.reviewedAt}{" "}
            {trusted ? "(ตรงกับรายการที่ยืนยันในแอป)" : "(ยังไม่ยืนยันกับแหล่งทางการ)"}
          </p>
          <ul>
            {pinned.bundle.sources.map((s) => {
              const href = safeOfficialHref(s.url);
              return (
                <li key={s.url}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer no-referrer">{s.title}</a>
                  ) : (
                    <span>{s.title} (ลิงก์ที่ยังไม่ได้ตรวจสอบ: {s.url})</span>
                  )}{" "}
                  {s.publication} มีผลตั้งแต่ {s.effectiveFrom}
                </li>
              );
            })}
          </ul>
          <ul className="coverage">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                {categoryLabel(c.id)}: {coverageFor(pinned.bundle, c.id) === "unavailable" ? "ยังไม่มีกฎที่ตรวจแล้ว" : coverageFor(pinned.bundle, c.id)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>ยังไม่ได้ปักกฎสำหรับปีนี้</p>
      )}
      {latest && updateAvailable && (
        <p>
          มีเวอร์ชันใหม่ {latest.version} (ตรวจทานเมื่อ {latest.reviewedAt}) ยืนยันก่อนเปลี่ยน ยอดที่กรอกไว้จะไม่เปลี่ยน
          <button type="button" disabled={busy} onClick={onPinLatest}>ใช้เวอร์ชันนี้</button>
        </p>
      )}
      {!latest && <p>ไม่มีกฎสำหรับปี {taxYear} ในรายการที่แอปมี ยอดสิทธิหลังกฎจะไม่แสดง</p>}
    </section>
  );
}
