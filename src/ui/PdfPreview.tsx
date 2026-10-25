import { memo, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export const MAX_PDF_PAGES = 500;
export const MAX_PAGE_PIXELS = 16_000_000;
export const RENDER_TIMEOUT_MS = 10_000;

/**
 * Canvas-only preview of one page at a time. No annotation, form, link or scripting layers are created,
 * so PDF actions are never executed and no document-driven network request is made.
 */
export const PdfPreview = memo(function PdfPreview({ bytes }: { bytes: Uint8Array }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      enableXfa: false,
      stopAtErrors: true,
      useWorkerFetch: false,
      useSystemFonts: false,
    });
    // Timeout destroys the loading task (and worker transport) so a hostile file cannot keep the app busy.
    const timer = window.setTimeout(() => {
      cancelled = true;
      void task.destroy();
      setError("ตัวอย่างใช้เวลานานเกินกำหนด");
    }, RENDER_TIMEOUT_MS);
    (async () => {
      try {
        const doc = await task.promise;
        if (cancelled) return;
        if (doc.numPages > MAX_PDF_PAGES) {
          setError("ไฟล์มีหน้ามากเกินกำหนดสำหรับตัวอย่าง (ไฟล์ยังเก็บได้)");
          return;
        }
        setPageCount(doc.numPages);
        const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, Math.sqrt(MAX_PAGE_PIXELS / (base.width * base.height)));
        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no canvas");
        await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
        if (!cancelled) setError(null);
      } catch {
        if (!cancelled) setError("ไม่สามารถแสดงตัวอย่าง PDF นี้ได้");
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void task.destroy();
    };
  }, [bytes, page]);

  return (
    <div className="preview" aria-label="ตัวอย่าง PDF">
      {error ? <p role="status">{error}</p> : <canvas ref={canvasRef} aria-label="หน้า PDF" />}
      {pageCount > 1 && (
        <nav aria-label="เลือกหน้า">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
          <span>หน้า {page} / {pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
        </nav>
      )}
    </div>
  );
});
