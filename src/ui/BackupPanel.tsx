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
      onOpened(target, await restoreZipIntoEmptyFolder(target, bytes));
      notify("กู้คืนสำเร็จ โฟลเดอร์ใหม่พร้อมใช้งาน โฟลเดอร์เดิมไม่ถูกแก้ไข");
    });

  const importJson = (file: File | undefined) =>
    run("นำเข้า JSON", async () => {
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const target = await pickWorkspaceFolder();
      await importMetadataIntoEmptyFolder(target, bytes);
      const opened = await openWorkspace(target);
      if ("needsSetup" in opened) throw new Error("นำเข้าแล้วแต่ไม่พบข้อมูล");
      onOpened(target, opened);
      notify(
        opened.missingAttachments.length > 0
          ? `นำเข้าข้อมูลแล้ว แต่ไม่พบไฟล์แนบ ${opened.missingAttachments.length} ไฟล์ ไม่ใช่ข้อมูลสำรองครบถ้วน`
          : "นำเข้าข้อมูลแล้ว",
      );
    });

  return (
    <section aria-labelledby="backup-title" className="backup">
      <h2 id="backup-title">สำรองข้อมูลและถ่ายโอน</h2>
      <p className="warning">ควรสำรองข้อมูล ZIP เป็นระยะ และก่อนลบถาวรหรือย้ายโฟลเดอร์</p>
      {!canExport && <p className="warning">มีการแก้ไขที่ยังไม่บันทึก บันทึกหรือยกเลิกก่อนสำรองหรือส่งออก</p>}
      <div className="actions">
        <button type="button" disabled={busy || !canExport} onClick={() => void backupZip()}>สำรอง ZIP ทั้งหมด</button>
        <button type="button" disabled={busy || !canExport} onClick={() => void exportJson()}>ส่งออก JSON (เฉพาะข้อมูล)</button>
        <button type="button" disabled={busy || !canExport} onClick={() => void exportCsv()}>ส่งออก CSV ปี {taxYear}</button>
      </div>
      <label>
        กู้คืนจาก ZIP ไปยังโฟลเดอร์ว่างใหม่
        <input type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => void restoreZip(e.target.files?.[0])} />
      </label>
      <label>
        นำเข้า JSON ไปยังโฟลเดอร์ว่างใหม่ (ต้องเลือกไฟล์แนบใหม่ภายหลัง)
        <input type="file" accept="application/json,.json" disabled={busy} onChange={(e) => void importJson(e.target.files?.[0])} />
      </label>
    </section>
  );
}
