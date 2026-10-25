import { useState } from "react";
import type { DirHandleLike } from "../storage/fs";
import { importMetadataIntoEmptyFolder } from "../transfer/json";
import { exportMetadataJson } from "../transfer/json";
import { createBackupZip, restoreZipIntoEmptyFolder } from "../transfer/zip";
import { recordsToCsv } from "../transfer/csv";
import { openWorkspace, pickWorkspaceFolder, type OpenResult, type WorkspaceSession } from "../storage/workspace";
import type { Manifest } from "../domain/schema";
import { LIMITS } from "../storage/capacity";

interface Props {
  root: DirHandleLike;
  session: WorkspaceSession;
  manifest: Manifest;
  taxYear: number;
  canExport: boolean;
  onOpened: (folder: DirHandleLike, result: OpenResult) => void;
  notify: (message: string) => void;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Backup, restore and export. Restore and import always target a NEW EMPTY folder chosen by the user. */
export function BackupPanel({ root, session, manifest, taxYear, canExport, onOpened, notify }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (err) {
      notify(err instanceof Error ? err.message : `${label} ไม่สำเร็จ`);
    } finally {
      setBusy(false);
    }
  };

  const backupZip = () =>
    run("สำรองข้อมูล", async () => {
      const blob = await createBackupZip(root, session);
      downloadBlob(blob, `nexthtax-backup-${stamp()}.zip`);
      notify("สร้างไฟล์สำรอง ZIP แล้ว กรุณาเก็บไว้ในที่ปลอดภัย");
    });

  const exportJson = () =>
    run("ส่งออก JSON", async () => {
      downloadBlob(exportMetadataJson(manifest), `nexthtax-metadata-${stamp()}.json`);
      notify("ส่งออกเฉพาะข้อมูล JSON (ไม่รวมไฟล์แนบ) ไม่ใช่ข้อมูลสำรองครบถ้วน");
    });

  const exportCsv = () =>
    run("ส่งออก CSV", async () => {
      downloadBlob(new Blob([recordsToCsv(manifest.records, taxYear)], { type: "text/csv;charset=utf-8" }), `nexthtax-${taxYear}-${stamp()}.csv`);
      notify("ส่งออก CSV แล้ว รายงานนี้ไม่ใช่รูปแบบไฟล์ยื่นภาษี");
    });

  const restoreZip = (file: File | undefined) =>
    run("กู้คืน", async () => {
      if (!file) return;
      if (file.size > LIMITS.zipBudgetBytes) throw new Error("ไฟล์ ZIP ใหญ่เกิน 1 GiB");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const target = await pickWorkspaceFolder();
      onOpened(target, await restoreZipIntoEmptyFolder(target, bytes, () => window.confirm("ZIP นี้เป็นข้อมูลรุ่นเดิม ยืนยันสร้างสำเนารุ่นใหม่ในโฟลเดอร์ว่างหรือไม่? ไฟล์ต้นฉบับคงเดิม แอปรุ่นเก่าเปิดสำเนาใหม่ไม่ได้")));
      notify("กู้คืนสำเร็จ โฟลเดอร์ใหม่พร้อมใช้งาน โฟลเดอร์เดิมไม่ถูกแก้ไข");
    });

  const importJson = (file: File | undefined) =>
    run("นำเข้า JSON", async () => {
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const target = await pickWorkspaceFolder();
      await importMetadataIntoEmptyFolder(target, bytes, () => window.confirm("JSON นี้เป็นข้อมูลรุ่นเดิม ยืนยันสร้างสำเนารุ่นใหม่หรือไม่? ไม่รวมไฟล์แนบและแอปรุ่นเก่าเปิดสำเนาใหม่ไม่ได้"));
      const opened = await openWorkspace(target);
      if ("needsSetup" in opened || "upgradeRequired" in opened) throw new Error("นำเข้าแล้วแต่ไม่พบข้อมูล");
      onOpened(target, opened);
      notify(
        opened.missingAttachments.length > 0
          ? `นำเข้าข้อมูลแล้ว แต่ไม่พบไฟล์แนบ ${opened.missingAttachments.length} ไฟล์ ไม่ใช่ข้อมูลสำรองครบถ้วน`
          : "นำเข้าข้อมูลแล้ว",
      );
    });

  return (
    <section aria-labelledby="backup-title" className="backup card">
      <h2 id="backup-title">สำรองข้อมูลและถ่ายโอนแฟ้มภาษี</h2>
      <p className="warning">ควรสำรองข้อมูล ZIP เป็นระยะ และก่อนลบถาวรหรือย้ายโฟลเดอร์ ข้อมูลทั้งหมดอยู่บนเครื่องนี้เท่านั้น</p>
      {!canExport && <p className="warning">มีการแก้ไขที่ยังไม่บันทึก บันทึกหรือยกเลิกก่อนสำรองหรือส่งออก</p>}

      {/* Primary Vault Backup Card */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", margin: "16px 0" }}>
        <div className="card" style={{ background: "var(--orange-surface)", borderColor: "var(--primary-orange)" }}>
          <h3 style={{ color: "var(--primary-orange-deep)", margin: "0 0 6px" }}>📦 สำรอง ZIP ทั้งหมด (สมบูรณ์)</h3>
          <p className="muted" style={{ margin: "0 0 12px" }}>รวมข้อมูลภาษี ไฟล์แนบทั้งหมด กฎ และประวัติการกู้คืน พร้อมรหัสตรวจสอบ SHA-256</p>
          <button type="button" className="btn-primary" disabled={busy || !canExport} onClick={() => void backupZip()}>
            สำรอง ZIP ทั้งหมด
          </button>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 6px" }}>📊 ส่งออกรายงาน CSV (ปี {taxYear})</h3>
          <p className="muted" style={{ margin: "0 0 12px" }}>ตารางสรุปรายการเอกสาร ยอด และสถานะ นำไปเปิดใน Excel หรือสเปรดชีตได้</p>
          <button type="button" disabled={busy || !canExport} onClick={() => void exportCsv()}>
            ส่งออก CSV ปี {taxYear}
          </button>
        </div>

        <div className="card">
          <h3 style={{ margin: "0 0 6px" }}>📄 ส่งออก JSON (เฉพาะข้อมูล)</h3>
          <p className="muted" style={{ margin: "0 0 12px" }}>เฉพาะโครงสร้างรายการ ไม่รวมไฟล์แนบ ไม่ใช่ข้อมูลสำรองที่สมบูรณ์</p>
          <button type="button" disabled={busy || !canExport} onClick={() => void exportJson()}>
            ส่งออก JSON (เฉพาะข้อมูล)
          </button>
        </div>
      </div>

      <fieldset style={{ marginTop: "20px" }}>
        <legend>กู้คืนและนำเข้าข้อมูล (ต้องเลือกโฟลเดอร์ว่างใหม่)</legend>
        <p className="muted">เพื่อความปลอดภัยต่อข้อมูลเดิม การกู้คืนจะทำในโฟลเดอร์ว่างใหม่เท่านั้น โฟลเดอร์เดิมไม่ถูกเขียนทับ</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "10px" }}>
          <label className="dropzone-box">
            <span>กู้คืนจาก ZIP ไปยังโฟลเดอร์ว่างใหม่</span>
            <input type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => void restoreZip(e.target.files?.[0])} />
          </label>
          <label className="dropzone-box">
            <span>นำเข้า JSON ไปยังโฟลเดอร์ว่างใหม่ (ต้องเลือกไฟล์แนบใหม่ภายหลัง)</span>
            <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void importJson(e.target.files?.[0])} />
          </label>
        </div>
      </fieldset>
    </section>
  );
}
