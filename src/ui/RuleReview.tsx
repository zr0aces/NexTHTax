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
    <section aria-labelledby="rules-title" className="rules card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div>
          <h2 id="rules-title" style={{ margin: "0 0 4px" }}>กฎภาษีรายปี ({taxYear})</h2>
          <p className="disclaimer" style={{ margin: 0 }}>
            กฎที่แสดงเป็นข้อมูลอ้างอิงที่ปักไว้ในโฟลเดอร์ ยอดของคุณไม่เปลี่ยนเมื่อเปลี่ยนกฎ ตรวจรายการอัปเดตเมื่อออนไลน์
          </p>
        </div>
        <button type="button" disabled={busy} onClick={onCheck}>ตรวจรายการกฎอัปเดต</button>
      </div>

      {catalogError && <p role="alert" className="error alert-danger">{catalogError}</p>}

      {pinned ? (
        <div style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "var(--slate-surface)", borderRadius: "6px", border: "1px solid var(--border-subtle)", marginBottom: "16px" }}>
            <span style={{ fontWeight: 600 }}>เวอร์ชันที่ปักไว้: {pinned.bundle.version}</span>
            <span className="muted">(ตรวจทานเมื่อ {pinned.bundle.reviewedAt})</span>
            {trusted ? (
              <span className="seal-badge seal-reviewed">✓ ยืนยันแล้ว (ตรงกับรายการที่ยืนยันในแอป)</span>
            ) : (
              <span className="seal-badge seal-waiting-review">ยังไม่ยืนยันกับแหล่งทางการ</span>
            )}
          </div>

          <h3>แหล่งอ้างอิงทางการ (ราชกิจจานุเบกษา / กรมสรรพากร)</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {pinned.bundle.sources.map((s) => {
              const href = safeOfficialHref(s.url);
              return (
                <li key={s.url} style={{ padding: "8px 12px", background: "#fff", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer no-referrer" style={{ fontWeight: 600, color: "var(--primary-orange-deep)" }}>
                      {s.title} ↗
                    </a>
                  ) : (
                    <span style={{ fontWeight: 600 }}>{s.title} (ลิงก์ที่ยังไม่ได้ตรวจสอบ: {s.url})</span>
                  )}{" "}
                  <div className="muted" style={{ fontSize: "12px", marginTop: "2px" }}>
                    {s.publication} · มีผลตั้งแต่ {s.effectiveFrom}
                  </div>
                </li>
              );
            })}
          </ul>

          <h3>ความครอบคลุมของกฎในแต่ละหมวด</h3>
          <ul className="coverage">
            {CATEGORIES.map((c) => (
              <li key={c.id}>
                <span>{categoryLabel(c.id)}</span>
                <span className="muted">
                  {coverageFor(pinned.bundle, c.id) === "unavailable" ? "ยังไม่มีกฎที่ตรวจแล้ว" : coverageFor(pinned.bundle, c.id)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ padding: "24px", textAlign: "center", background: "var(--slate-surface)", borderRadius: "6px", margin: "16px 0" }}>
          <p className="muted" style={{ margin: 0 }}>ยังไม่ได้ปักกฎสำหรับปีนี้</p>
        </div>
      )}

      {latest && updateAvailable && (
        <div className="update" style={{ marginTop: "16px" }}>
          <div>
            <strong>มีเวอร์ชันใหม่ {latest.version}</strong> (ตรวจทานเมื่อ {latest.reviewedAt}) ยืนยันก่อนเปลี่ยน ยอดที่กรอกไว้จะไม่เปลี่ยน
          </div>
          <button type="button" className="btn-primary" disabled={busy} onClick={onPinLatest}>ใช้เวอร์ชันนี้</button>
        </div>
      )}
      {!latest && <p className="muted" style={{ marginTop: "12px" }}>ไม่มีกฎสำหรับปี {taxYear} ในรายการที่แอปมี ยอดสิทธิหลังกฎจะไม่แสดง</p>}
    </section>
  );
}
